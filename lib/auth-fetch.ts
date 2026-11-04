/**
 * This app has no accounts: its API routes are its own, served next to the
 * bundle. Kept as a named wrapper so the client calls read as they do in the
 * Reskale app.
 */
export function authFetch(input: string | URL, init: RequestInit = {}): Promise<Response> {
  return fetch(input, init);
}
