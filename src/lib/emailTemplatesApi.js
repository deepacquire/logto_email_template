import fs from "node:fs/promises";
import path from "node:path";

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
 * Sync local email templates to Logto Management API using bulk update
 * According to Logto API docs: https://openapi.logto.io/operation/operation-replaceemailtemplates
 * PUT /api/email-templates accepts an array of templates and will create or update them
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
  // Get existing templates to determine action (create vs update)
  const remoteTemplates = await listEmailTemplates(
    apiClient,
    emailTemplatesPath
  );
  const remoteIndex = new Map();
  const hasRemoteIndex = Array.isArray(remoteTemplates);
  if (hasRemoteIndex) {
    for (const t of remoteTemplates) {
      if (!t?.templateType || !t?.languageTag) continue;
      remoteIndex.set(makeKey(t.templateType, t.languageTag), t);
    }
  }

  // Prepare templates array for bulk update
  const templatesToSync = localTemplates.map((local) => ({
    languageTag: local.languageTag,
    templateType: local.templateType,
    details: local.details,
  }));

  const results = [];

  // Determine actions for dry-run
  for (const local of localTemplates) {
    const key = makeKey(local.templateType, local.languageTag);
    const existing = hasRemoteIndex ? remoteIndex.get(key) : null;
    const action = hasRemoteIndex ? (existing ? "update" : "create") : "upsert";

    results.push({
      action,
      key,
      local,
      remote: existing || null,
      dryRun,
    });
  }

  if (dryRun) {
    return results;
  }

  // Perform bulk update via PUT /api/email-templates
  const basePath = `/api/${emailTemplatesPath}`;
  try {
    const response = await apiClient.PUT(basePath, {
      body: { templates: templatesToSync },
    });

    const status = response.status || response.response?.status;
    if (status && status >= 400) {
      throw new Error(`API returned error status: ${status}`);
    }

    const result = response.data || response;
    const updatedTemplates = Array.isArray(result) ? result : [];

    // Update results with actual response
    const updatedIndex = new Map();
    for (const template of updatedTemplates) {
      if (template?.templateType && template?.languageTag) {
        updatedIndex.set(
          makeKey(template.templateType, template.languageTag),
          template
        );
      }
    }

    // Update results with response data
    for (let i = 0; i < results.length; i++) {
      const local = localTemplates[i];
      const key = makeKey(local.templateType, local.languageTag);
      const updatedTemplate = updatedIndex.get(key);
      const existing = hasRemoteIndex ? remoteIndex.get(key) : null;

      results[i] = {
        ...results[i],
        request: { method: "PUT" },
        remote: updatedTemplate || existing || null,
      };

      if (verbose && updatedTemplate) {
        // eslint-disable-next-line no-console
        console.log(
          `${results[i].action} ${key}:`,
          JSON.stringify(updatedTemplate, null, 2)
        );
      }
    }

    return results;
  } catch (error) {
    const errorStatus = error?.status || error?.response?.status;
    const errorMsg = error?.message || String(error);
    let detailedError = `Failed to sync email templates via bulk update.\n`;
    detailedError += `Error: ${errorMsg}\n`;
    detailedError += `URL: ${basePath}\n`;

    if (errorStatus) {
      detailedError += `Status: ${errorStatus}\n`;
    }

    if (error?.response?.data || error?.data || error?.body) {
      detailedError += `Response: ${JSON.stringify(
        error?.response?.data || error?.data || error?.body,
        null,
        2
      )}\n`;
    }

    // Add helpful context for common errors
    if (errorMsg.includes("fetch failed") || errorMsg.includes("network")) {
      detailedError += `\nNote: This appears to be a network error. Please check:\n`;
      detailedError += `  - Your network connection\n`;
      detailedError += `  - The Logto API endpoint is accessible\n`;
      detailedError += `  - Your API credentials are valid\n`;
    }

    throw new Error(detailedError);
  }
}

/**
 * Export email templates from Logto to local files
 * @param {Object} params
 * @param {any} params.apiClient - Logto Management API client
 * @param {string} params.emailTemplatesPath - Path to email templates endpoint
 * @param {string} params.outDir - Output directory
 * @returns {Promise<{count: number, outDir: string}>}
 */
export async function exportEmailTemplates({
  apiClient,
  emailTemplatesPath,
  outDir,
}) {
  const remoteTemplates = await listEmailTemplates(
    apiClient,
    emailTemplatesPath
  );
  if (!Array.isArray(remoteTemplates)) {
    throw new Error(
      "Email template list endpoint is not available (got 404/405). " +
        "Set LOGTO_EMAIL_TEMPLATES_PATH to the correct path for your tenant."
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

    const subject = typeof details.subject === "string" ? details.subject : "";
    const content = typeof details.content === "string" ? details.content : "";
    const contentType = details.contentType || undefined;

    await fs.writeFile(
      path.join(dir, "subject.txt"),
      `${subject.trimEnd()}\n`,
      "utf8"
    );

    const contentFile =
      contentType === "text/plain" ? "content.txt" : "content.html";
    await fs.writeFile(
      path.join(dir, contentFile),
      `${content.trimEnd()}\n`,
      "utf8"
    );

    const meta = {};
    if (details.replyTo) meta.replyTo = details.replyTo;
    if (details.sendFrom) meta.sendFrom = details.sendFrom;
    if (details.contentType) meta.contentType = details.contentType;

    if (Object.keys(meta).length > 0) {
      await fs.writeFile(
        path.join(dir, "meta.json"),
        JSON.stringify(meta, null, 2) + "\n",
        "utf8"
      );
    }
  }

  return {
    count: remoteTemplates.length,
    outDir: outputRoot,
    templates: remoteTemplates,
  };
}

/**
 * List all email templates from Logto (summary only, no file export)
 * @param {Object} params
 * @param {any} params.apiClient - Logto Management API client
 * @param {string} params.emailTemplatesPath - Path to email templates endpoint
 * @returns {Promise<Array>} Array of template summaries
 */
export async function listEmailTemplatesSummary({
  apiClient,
  emailTemplatesPath,
}) {
  const remoteTemplates = await listEmailTemplates(
    apiClient,
    emailTemplatesPath
  );
  if (!Array.isArray(remoteTemplates)) {
    throw new Error(
      "Email template list endpoint is not available (got 404/405). " +
        "Set LOGTO_EMAIL_TEMPLATES_PATH to the correct path for your tenant."
    );
  }

  return remoteTemplates.map((t) => ({
    id: t?.id,
    templateType: t?.templateType,
    languageTag: t?.languageTag,
    subject: t?.details?.subject || "",
    contentType: t?.details?.contentType || "text/html",
    hasContent: !!t?.details?.content,
    contentLength:
      typeof t?.details?.content === "string" ? t?.details?.content.length : 0,
    replyTo: t?.details?.replyTo,
    sendFrom: t?.details?.sendFrom,
  }));
}