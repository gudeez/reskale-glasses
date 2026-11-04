import type { StreamSnapshot, StreamState } from './types';

/**
 * Translate the glasses' stream status events into what the Live screen shows.
 *
 * The shape mirrors `StreamStatusEvent` from @mentra/bluetooth-sdk, restated
 * here so this stays a pure, testable module. `errorDetails` is a raw firmware
 * string — it goes to logs, never to the seller.
 */
export type RawStreamStatus =
  | { kind: 'lifecycle'; status: 'initializing' | 'streaming' | 'stopping' | 'stopped'; stats?: RawStreamStats }
  | { kind: 'reconnect'; status: 'reconnecting'; attempt: number; maxAttempts: number; stats?: RawStreamStats }
  | { kind: 'reconnect'; status: 'reconnected'; attempt: number; stats?: RawStreamStats }
  | { kind: 'reconnect'; status: 'reconnect_failed'; maxAttempts: number; stats?: RawStreamStats }
  | { kind: 'error'; status: 'error'; errorDetails: string; stats?: RawStreamStats }
  | {
      kind: 'snapshot';
      status: string;
      streaming: boolean;
      reconnecting: boolean;
      stats?: RawStreamStats;
    };

export interface RawStreamStats {
  /** Bits per second. */
  bitrate?: number;
  /** Seconds since the stream started. */
  duration?: number;
}

export const IDLE_STREAM: StreamSnapshot = { state: 'idle', message: null, bitrateKbps: null, durationSec: null };

const STREAM_FAILED =
  "Your stream stopped. Check the glasses are on Wi-Fi and the stream key is right, then go live again.";

export function toStreamSnapshot(event: RawStreamStatus): StreamSnapshot {
  const bitrateKbps = typeof event.stats?.bitrate === 'number' ? Math.round(event.stats.bitrate / 1000) : null;
  const durationSec = typeof event.stats?.duration === 'number' ? Math.floor(event.stats.duration) : null;
  const base = { bitrateKbps, durationSec };

  switch (event.kind) {
    case 'lifecycle':
      if (event.status === 'initializing') return { ...base, state: 'starting', message: 'Starting your stream…' };
      if (event.status === 'streaming') return { ...base, state: 'live', message: null };
      if (event.status === 'stopping') return { ...base, state: 'stopping', message: 'Ending your stream…' };
      return { ...base, state: 'stopped', message: 'Your stream has ended.' };
    case 'reconnect':
      if (event.status === 'reconnecting') {
        return {
          ...base,
          state: 'reconnecting',
          message: `Connection dropped — reconnecting (try ${event.attempt} of ${event.maxAttempts}).`,
        };
      }
      if (event.status === 'reconnected') return { ...base, state: 'live', message: null };
      return { ...base, state: 'error', message: STREAM_FAILED };
    case 'error':
      return { ...base, state: 'error', message: STREAM_FAILED };
    case 'snapshot':
      if (event.reconnecting) return { ...base, state: 'reconnecting', message: 'Connection dropped — reconnecting…' };
      if (event.streaming) return { ...base, state: 'live', message: null };
      return { ...base, state: 'stopped', message: null };
  }
}

const ON_AIR: ReadonlySet<StreamState> = new Set<StreamState>(['starting', 'live', 'reconnecting', 'stopping']);

const LOST_GLASSES =
  "Lost contact with your glasses, so Reskale can't see or end your stream. Reconnect them to check it, or turn them off to end it.";

/**
 * The glasses dropped off Bluetooth. They stream over their own Wi-Fi, so the
 * broadcast may still be running — but the phone can no longer see or stop it,
 * so the screen must not keep showing "LIVE" with a dead End button.
 */
export function streamAfterDisconnect(stream: StreamSnapshot): StreamSnapshot {
  return ON_AIR.has(stream.state)
    ? { ...stream, state: 'error', message: LOST_GLASSES, bitrateKbps: null }
    : stream;
}
