// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
import { describe, it, expect, vi, afterEach } from 'vitest';
import { createPhotoWaiter } from '@/lib/glasses/photo-waiter';

afterEach(() => {
  vi.useRealTimers();
});

describe('createPhotoWaiter', () => {
  it('resolves with the file delivered for the request', async () => {
    const waiter = createPhotoWaiter(1000);
    const photo = waiter.expect('r1');
    waiter.deliver('r1', 'file:///photo-r1.jpg');
    await expect(photo).resolves.toBe('file:///photo-r1.jpg');
  });

  it('drops a file for a request nobody is waiting on', async () => {
    vi.useFakeTimers();
    const waiter = createPhotoWaiter(1000);
    // e.g. posted to the phone's receiver by another device on the same Wi-Fi
    expect(waiter.deliver('r1', 'file:///planted.jpg')).toBe(false);
    const photo = waiter.expect('r1').catch(() => 'timed out');
    vi.advanceTimersByTime(1001);
    expect(await photo).toBe('timed out');
  });

  it('reports whether a request is still open', async () => {
    const waiter = createPhotoWaiter(1000);
    expect(waiter.isWaiting('r1')).toBe(false);
    const photo = waiter.expect('r1');
    expect(waiter.isWaiting('r1')).toBe(true);
    waiter.deliver('r1', 'file:///r1.jpg');
    expect(waiter.isWaiting('r1')).toBe(false);
    await photo;
  });

  it('accepts only the first delivery for a request', async () => {
    const waiter = createPhotoWaiter(1000);
    const photo = waiter.expect('r1');
    expect(waiter.deliver('r1', 'file:///first.jpg')).toBe(true);
    expect(waiter.deliver('r1', 'file:///second.jpg')).toBe(false);
    await expect(photo).resolves.toBe('file:///first.jpg');
  });

  it('does not hand one request another request’s photo', async () => {
    const waiter = createPhotoWaiter(1000);
    const a = waiter.expect('a');
    const b = waiter.expect('b');
    waiter.deliver('b', 'file:///b.jpg');
    waiter.deliver('a', 'file:///a.jpg');
    await expect(a).resolves.toBe('file:///a.jpg');
    await expect(b).resolves.toBe('file:///b.jpg');
  });

  it('times out with a message a seller can act on', async () => {
    vi.useFakeTimers();
    const waiter = createPhotoWaiter(1000);
    const photo = waiter.expect('r1');
    vi.advanceTimersByTime(1001);
    await expect(photo).rejects.toThrow(/try again/);
  });

  it('ignores a late delivery after the timeout instead of throwing', async () => {
    vi.useFakeTimers();
    const waiter = createPhotoWaiter(1000);
    const photo = waiter.expect('r1').catch(() => 'timed out');
    vi.advanceTimersByTime(1001);
    expect(await photo).toBe('timed out');
    expect(() => waiter.deliver('r1', 'file:///late.jpg')).not.toThrow();
  });

  it('fails a single request with the given message', async () => {
    const waiter = createPhotoWaiter(1000);
    const photo = waiter.expect('r1');
    waiter.fail('r1', 'Glasses camera is busy.');
    await expect(photo).rejects.toThrow('Glasses camera is busy.');
  });

  it('rejects everything outstanding on cancelAll', async () => {
    const waiter = createPhotoWaiter(1000);
    const a = waiter.expect('a');
    const b = waiter.expect('b');
    waiter.cancelAll('Glasses disconnected.');
    await expect(a).rejects.toThrow('Glasses disconnected.');
    await expect(b).rejects.toThrow('Glasses disconnected.');
  });
});
