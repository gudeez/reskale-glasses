// From the Reskale app: first written 2026-03-20, last changed 2026-03-20 (before this repo). See HACKATHON.md.
/**
 * eBay OAuth Client Credentials flow.
 * Used by server-side API routes only — never imported on the client.
 *
 * Exchanges EBAY_APP_ID + EBAY_CERT_ID for a short-lived Bearer token.
 * Tokens are cached in memory (~2 hour lifespan).
 */

const PRODUCTION_TOKEN_URL = 'https://api.ebay.com/identity/v1/oauth2/token';
const SANDBOX_TOKEN_URL = 'https://api.sandbox.ebay.com/identity/v1/oauth2/token';
const PRODUCTION_SCOPE = 'https://api.ebay.com/oauth/api_scope';
const SANDBOX_SCOPE = 'https://api.ebay.com/oauth/api_scope';

let cachedToken: string | null = null;
let tokenExpiresAt = 0;

export async function getEbayAppToken(): Promise<string> {
  if (cachedToken && Date.now() < tokenExpiresAt - 60_000) {
    return cachedToken;
  }

  const appId = process.env.EBAY_APP_ID;
  const certId = process.env.EBAY_CERT_ID;
  if (!appId || !certId) {
    throw new Error('EBAY_APP_ID and EBAY_CERT_ID must be configured');
  }

  const isSandbox = process.env.EBAY_SANDBOX === 'true';
  const tokenUrl = isSandbox ? SANDBOX_TOKEN_URL : PRODUCTION_TOKEN_URL;
  const scope = isSandbox ? SANDBOX_SCOPE : PRODUCTION_SCOPE;

  // btoa may fail with non-ASCII — use a safe base64 encoding
  const credentials = btoa(unescape(encodeURIComponent(`${appId}:${certId}`)));

  const res = await fetch(tokenUrl, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/x-www-form-urlencoded',
      Authorization: `Basic ${credentials}`,
    },
    body: `grant_type=client_credentials&scope=${encodeURIComponent(scope)}`,
  });

  if (!res.ok) {
    const text = await res.text();
    // Clear cached token so next attempt retries fresh
    cachedToken = null;
    tokenExpiresAt = 0;
    throw new Error(`eBay token request failed (${res.status}): ${text}`);
  }

  const data = await res.json();
  cachedToken = data.access_token;
  tokenExpiresAt = Date.now() + (data.expires_in ?? 7200) * 1000;

  return cachedToken!;
}

export function clearTokenCache(): void {
  cachedToken = null;
  tokenExpiresAt = 0;
}

export function isEbayConfigured(): boolean {
  return !!(process.env.EBAY_APP_ID && process.env.EBAY_CERT_ID);
}
