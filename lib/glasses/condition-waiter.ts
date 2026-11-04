/**
 * Wait for state that arrives by event: "until the session has started",
 * "until the camera is streaming". The caller updates its own state from the
 * SDK's events and then calls `recheck()`; each waiter resolves the first time
 * its condition holds, or rejects with a seller-readable message on timeout or
 * when `failAll` is called (the glasses dropped, a fatal camera error).
 */

interface Waiter {
  check: () => boolean;
  resolve: () => void;
  reject: (err: Error) => void;
  timer: ReturnType<typeof setTimeout>;
}

export interface ConditionWaiter {
  until(check: () => boolean, timeoutMs: number, timeoutMessage: string): Promise<void>;
  recheck(): void;
  failAll(message: string): void;
}

export function createConditionWaiter(): ConditionWaiter {
  let waiters: Waiter[] = [];

  const remove = (w: Waiter) => {
    clearTimeout(w.timer);
    waiters = waiters.filter((x) => x !== w);
  };

  return {
    until(check, timeoutMs, timeoutMessage) {
      if (check()) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const w: Waiter = {
          check,
          resolve,
          reject,
          timer: setTimeout(() => {
            remove(w);
            reject(new Error(timeoutMessage));
          }, timeoutMs),
        };
        waiters = [...waiters, w];
      });
    },

    recheck() {
      for (const w of waiters) {
        if (w.check()) {
          remove(w);
          w.resolve();
        }
      }
    },

    failAll(message) {
      const failing = waiters;
      waiters = [];
      for (const w of failing) {
        clearTimeout(w.timer);
        w.reject(new Error(message));
      }
    },
  };
}
