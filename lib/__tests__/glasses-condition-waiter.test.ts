// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createConditionWaiter } from '@/lib/glasses/condition-waiter';

afterEach(() => {
  vi.useRealTimers();
});

describe('createConditionWaiter', () => {
  it('resolves at once when the condition already holds', async () => {
    const w = createConditionWaiter();
    await expect(w.until(() => true, 1000, 'late')).resolves.toBeUndefined();
  });

  it('resolves on the first recheck after the state changes', async () => {
    const w = createConditionWaiter();
    let started = false;
    const waiting = w.until(() => started, 1000, 'late');
    w.recheck(); // still false: keeps waiting
    started = true;
    w.recheck();
    await expect(waiting).resolves.toBeUndefined();
  });

  it('rejects with the seller-readable message on timeout', async () => {
    vi.useFakeTimers();
    const w = createConditionWaiter();
    const waiting = w.until(() => false, 1000, 'The glasses did not respond.');
    vi.advanceTimersByTime(1000);
    await expect(waiting).rejects.toThrow('The glasses did not respond.');
  });

  it('failAll ends every wait with the given reason', async () => {
    const w = createConditionWaiter();
    const a = w.until(() => false, 10_000, 'late');
    const b = w.until(() => false, 10_000, 'late');
    w.failAll('Your glasses disconnected.');
    await expect(a).rejects.toThrow('Your glasses disconnected.');
    await expect(b).rejects.toThrow('Your glasses disconnected.');
  });

  it('a settled wait is not resolved or failed twice', async () => {
    vi.useFakeTimers();
    const w = createConditionWaiter();
    let ready = false;
    const waiting = w.until(() => ready, 1000, 'late');
    ready = true;
    w.recheck();
    w.failAll('gone');
    vi.advanceTimersByTime(5000);
    await expect(waiting).resolves.toBeUndefined();
  });
});
