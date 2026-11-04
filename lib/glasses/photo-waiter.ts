// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
/**
 * Pairs a photo request with the file that arrives for it.
 *
 * The glasses deliver a photo by uploading it to a small receiver running on
 * the phone; the receiver reports the saved file with the request id. That
 * receiver is an unauthenticated HTTP endpoint on the phone's network, so only
 * a delivery for a request that is still being waited on is accepted —
 * anything else (stale, duplicate, or posted by another device on the same
 * Wi-Fi) is dropped. Callers start waiting *before* asking the glasses for the
 * photo, so a genuine delivery can never arrive first.
 */

export const PHOTO_TIMEOUT_MS = 45_000;

const TIMED_OUT = "The glasses didn't send the photo in time. Make sure they're on and nearby, then try again.";

interface Pending {
  resolve: (uri: string) => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface PhotoWaiter {
  /** Resolves with the photo's file URI, or rejects with a seller-readable error. */
  expect(requestId: string): Promise<string>;
  /** Whether a delivery for this request would still be accepted. */
  isWaiting(requestId: string): boolean;
  /** True when the file was accepted for a request that was being waited on. */
  deliver(requestId: string, fileUri: string): boolean;
  fail(requestId: string, message: string): void;
  /** Reject everything outstanding, e.g. when the glasses disconnect. */
  cancelAll(message: string): void;
}

export function createPhotoWaiter(timeoutMs: number = PHOTO_TIMEOUT_MS): PhotoWaiter {
  const pending = new Map<string, Pending>();

  const settle = (requestId: string): Pending | undefined => {
    const entry = pending.get(requestId);
    if (!entry) return undefined;
    clearTimeout(entry.timer);
    pending.delete(requestId);
    return entry;
  };

  return {
    expect(requestId) {
      return new Promise<string>((resolve, reject) => {
        const timer = setTimeout(() => {
          pending.delete(requestId);
          reject(new Error(TIMED_OUT));
        }, timeoutMs);
        pending.set(requestId, { resolve, reject, timer });
      });
    },
    isWaiting(requestId) {
      return pending.has(requestId);
    },
    deliver(requestId, fileUri) {
      const entry = settle(requestId);
      entry?.resolve(fileUri);
      return entry !== undefined;
    },
    fail(requestId, message) {
      settle(requestId)?.reject(new Error(message));
    },
    cancelAll(message) {
      for (const id of [...pending.keys()]) settle(id)?.reject(new Error(message));
    },
  };
}
