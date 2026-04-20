export function buildSyncAuthHeaders(authToken: string, deviceId: string): Record<string, string> {
  return {
    Authorization: `Bearer ${authToken}`,
    'X-Device-Id': deviceId,
  };
}
