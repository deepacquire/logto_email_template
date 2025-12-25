function requiredEnv(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var: ${name}`);
  }
  return value;
}

function normalizeBaseUrl(input) {
  const value = String(input || '').trim();
  // Remove trailing slashes
  return value.replace(/\/+$/, '');
}

function normalizePath(input) {
  const value = String(input || '').trim();
  // Remove leading/trailing slashes so we can join safely
  return value.replace(/^\/+/, '').replace(/\/+$/, '');
}

function extractTenantId(endpoint) {
  // Extract tenant-id from endpoint URL
  // Examples:
  //   https://<tenant-id>.logto.app -> <tenant-id>
  //   https://logto.your-company.com -> use as-is or require LOGTO_TENANT_ID
  const match = endpoint.match(/https?:\/\/([^.]+)\.logto\.app/);
  if (match) {
    return match[1];
  }
  // For custom domains, require explicit tenant-id
  return null;
}

export function loadConfigFromEnv() {
  const endpoint = normalizeBaseUrl(requiredEnv('LOGTO_ENDPOINT'));
  const tenantId = process.env.LOGTO_TENANT_ID || extractTenantId(endpoint);
  
  if (!tenantId) {
    throw new Error(
      'Cannot extract tenant-id from LOGTO_ENDPOINT. ' +
      'Please set LOGTO_TENANT_ID explicitly (e.g., for custom domains).'
    );
  }

  const clientId = requiredEnv('LOGTO_M2M_CLIENT_ID');
  const clientSecret = requiredEnv('LOGTO_M2M_CLIENT_SECRET');

  const emailTemplatesPath = normalizePath(
    process.env.LOGTO_EMAIL_TEMPLATES_PATH || 'email-templates'
  );

  return {
    tenantId,
    endpoint,
    emailTemplatesPath,
    clientId,
    clientSecret,
  };
}


