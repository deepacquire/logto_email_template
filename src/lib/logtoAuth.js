import { createManagementApi } from '@logto/api/management';

/**
 * Creates and returns Logto Management API client with authenticated access.
 * @param {Object} config - Configuration object
 * @param {string} config.tenantId - Logto tenant ID
 * @param {string} config.clientId - M2M client ID
 * @param {string} config.clientSecret - M2M client secret
 * @returns {Promise<{apiClient: any, accessToken: string}>}
 */
export async function createLogtoApiClient(config) {
  const { apiClient, clientCredentials } = createManagementApi(config.tenantId, {
    clientId: config.clientId,
    clientSecret: config.clientSecret,
  });

  // Get access token (SDK handles auth internally, but we can also get it explicitly)
  const { value: accessToken } = await clientCredentials.getAccessToken();

  return { apiClient, accessToken };
}
