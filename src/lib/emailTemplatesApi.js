import fs from 'node:fs/promises';
import path from 'node:path';

function makeKey(templateType, languageTag) {
  return `${templateType}::${languageTag}`;
}

/**
 * List all email templates from Logto Management API
 * @param {any} apiClient - Logto Management API client
 * @param {string} emailTemplatesPath - Path to email templates endpoint
 * @returns {Promise<Array|null>} Array of templates or null if endpoint not available
 */
export async function listEmailTemplates(apiClient, emailTemplatesPath) {
  try {
    const response = await apiClient.GET(`/api/${emailTemplatesPath}`);
    if (response.data && Array.isArray(response.data)) {
      return response.data;
    }
    return null;
  } catch (error) {
    // Some deployments may not expose list endpoint; allow callers to fallback
    if (error?.status === 404 || error?.status === 405) {
      return null;
    }
    throw new Error(
      `Failed to list email templates: ${error?.message || String(error)}`
    );
  }
}

/**
 * Update an existing email template by ID
 * @param {any} apiClient - Logto Management API client
 * @param {string} emailTemplatesPath - Path to email templates endpoint
 * @param {string} id - Template ID
 * @param {Object} fullTemplate - Full template object
 * @returns {Promise<{ok: boolean, method: string, response: any}>}
 */
async function tryUpdateById(apiClient, emailTemplatesPath, id, fullTemplate) {
  const basePath = `/api/${emailTemplatesPath}`;
  
  // Strategy A: PATCH {id} with full template
  try {
    const response = await apiClient.PATCH(`${basePath}/${id}`, {
      body: fullTemplate,
    });
    if (response.data) {
      return { ok: true, method: 'PATCH', response: response.data };
    }
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) {
      return { ok: false, method: 'PATCH', error };
    }
  }

  // Strategy B: PUT {id} with full template
  try {
    const response = await apiClient.PUT(`${basePath}/${id}`, {
      body: fullTemplate,
    });
    if (response.data) {
      return { ok: true, method: 'PUT', response: response.data };
    }
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) {
      return { ok: false, method: 'PUT', error };
    }
  }

  return { ok: false, method: 'PUT', error: new Error('All update strategies failed') };
}

/**
 * Create a new email template
 * @param {any} apiClient - Logto Management API client
 * @param {string} emailTemplatesPath - Path to email templates endpoint
 * @param {Object} fullTemplate - Full template object
 * @returns {Promise<{ok: boolean, method: string, response: any}>}
 */
async function tryCreate(apiClient, emailTemplatesPath, fullTemplate) {
  const basePath = `/api/${emailTemplatesPath}`;
  
  // Strategy A: POST base
  try {
    const response = await apiClient.POST(basePath, {
      body: fullTemplate,
    });
    if (response.data) {
      return { ok: true, method: 'POST', response: response.data };
    }
  } catch (error) {
    if (error?.status !== 404 && error?.status !== 405) {
      return { ok: false, method: 'POST', error };
    }
  }

  // Strategy B: PUT base (some APIs use PUT for upsert)
  try {
    const response = await apiClient.PUT(basePath, {
      body: fullTemplate,
    });
    if (response.data) {
      return { ok: true, method: 'PUT', response: response.data };
    }
  } catch (error) {
    return { ok: false, method: 'PUT', error };
  }

  return { ok: false, method: 'POST', error: new Error('All create strategies failed') };
}

/**
 * Sync local email templates to Logto Management API
 * @param {Object} params
 * @param {any} params.apiClient - Logto Management API client
 * @param {string} params.emailTemplatesPath - Path to email templates endpoint
 * @param {Array} params.localTemplates - Local templates to sync
 * @param {boolean} params.dryRun - If true, don't actually make API calls
 * @param {boolean} params.verbose - If true, print verbose output
 * @returns {Promise<Array>} Results array
 */
export async function syncEmailTemplates({
  apiClient,
  emailTemplatesPath,
  localTemplates,
  dryRun = false,
  verbose = false,
}) {
  const remoteTemplates = await listEmailTemplates(apiClient, emailTemplatesPath);
  const remoteIndex = new Map();
  const hasRemoteIndex = Array.isArray(remoteTemplates);
  if (hasRemoteIndex) {
    for (const t of remoteTemplates) {
      if (!t?.templateType || !t?.languageTag) continue;
      remoteIndex.set(makeKey(t.templateType, t.languageTag), t);
    }
  }

  const results = [];

  for (const local of localTemplates) {
    const key = makeKey(local.templateType, local.languageTag);
    const existing = hasRemoteIndex ? remoteIndex.get(key) : null;

    const fullTemplate = {
      languageTag: local.languageTag,
      templateType: local.templateType,
      details: local.details,
    };

    const action = hasRemoteIndex ? (existing ? 'update' : 'create') : 'upsert';

    if (dryRun) {
      results.push({ action, key, local, remote: existing || null, dryRun: true });
      continue;
    }

    if (existing?.id) {
      const attempt = await tryUpdateById(
        apiClient,
        emailTemplatesPath,
        existing.id,
        fullTemplate
      );

      if (!attempt.ok) {
        const errorMsg = attempt.error?.message || String(attempt.error);
        throw new Error(
          `Failed to update email template (id=${existing.id}, ${local.templateType}/${local.languageTag}). ` +
            `Error: ${errorMsg}`
        );
      }

      if (verbose && attempt.response) {
        // eslint-disable-next-line no-console
        console.log(JSON.stringify(attempt.response, null, 2));
      }

      results.push({
        action,
        key,
        request: { method: attempt.method },
        local,
        remote: existing,
      });

      continue;
    }

    const attempt = await tryCreate(apiClient, emailTemplatesPath, fullTemplate);

    if (!attempt.ok) {
      const errorMsg = attempt.error?.message || String(attempt.error);
      throw new Error(
        `Failed to create email template (${local.templateType}/${local.languageTag}). ` +
          `Error: ${errorMsg}`
      );
    }

    // If the API returns the created object, refresh remote index for subsequent operations
    if (attempt.response?.id) {
      remoteIndex.set(key, attempt.response);
    }

    results.push({
      action,
      key,
      request: { method: attempt.method },
      local,
      remote: null,
    });
  }

  return results;
}

/**
 * Export email templates from Logto to local files
 * @param {Object} params
 * @param {any} params.apiClient - Logto Management API client
 * @param {string} params.emailTemplatesPath - Path to email templates endpoint
 * @param {string} params.outDir - Output directory
 * @returns {Promise<{count: number, outDir: string}>}
 */
export async function exportEmailTemplates({ apiClient, emailTemplatesPath, outDir }) {
  const remoteTemplates = await listEmailTemplates(apiClient, emailTemplatesPath);
  if (!Array.isArray(remoteTemplates)) {
    throw new Error(
      'Email template list endpoint is not available (got 404/405). ' +
      'Set LOGTO_EMAIL_TEMPLATES_PATH to the correct path for your tenant.'
    );
  }
  const outputRoot = path.resolve(outDir);
  await fs.mkdir(outputRoot, { recursive: true });

  for (const t of remoteTemplates) {
    const templateType = t?.templateType;
    const languageTag = t?.languageTag;
    const details = t?.details;
    if (!templateType || !languageTag || !details) continue;

    const dir = path.join(outputRoot, templateType, languageTag);
    await fs.mkdir(dir, { recursive: true });

    const subject = typeof details.subject === 'string' ? details.subject : '';
    const content = typeof details.content === 'string' ? details.content : '';
    const contentType = details.contentType || undefined;

    await fs.writeFile(path.join(dir, 'subject.txt'), `${subject.trimEnd()}\n`, 'utf8');

    const contentFile = contentType === 'text/plain' ? 'content.txt' : 'content.html';
    await fs.writeFile(path.join(dir, contentFile), `${content.trimEnd()}\n`, 'utf8');

    const meta = {};
    if (details.replyTo) meta.replyTo = details.replyTo;
    if (details.sendFrom) meta.sendFrom = details.sendFrom;
    if (details.contentType) meta.contentType = details.contentType;

    if (Object.keys(meta).length > 0) {
      await fs.writeFile(path.join(dir, 'meta.json'), JSON.stringify(meta, null, 2) + '\n', 'utf8');
    }
  }

  return { count: remoteTemplates.length, outDir: outputRoot };
}
