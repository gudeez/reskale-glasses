import { describe, it, expect } from 'vitest';
import type { InputEvent, StreamError } from '@chrisgocode/expo-meta-wearables-dat';
import {
  compatibilityMessage,
  createSpeechRestarter,
  deviceLabel,
  inputToPress,
  isTakenOff,
  PUT_ON,
  sessionErrorMessage,
  isFatalStreamError,
  streamErrorMessage,
  toConnection,
  toStatePatch,
} from '@/lib/glasses/meta-events';

const at = { timestampMs: 1 };

describe('inputToPress', () => {
  it('maps the capture button: press scans or shoots, hold finishes', () => {
    expect(inputToPress({ ...at, source: 'captureButton', type: 'capture', pressType: 'shortPress' })).toBe('short');
    expect(inputToPress({ ...at, source: 'captureButton', type: 'capture', pressType: 'hold' })).toBe('long');
  });

  it('a double press ends', () => {
    expect(inputToPress({ ...at, source: 'captureButton', type: 'capture', pressType: 'doublePress' })).toBe('double');
  });

  it('treats a temple tap as a short press', () => {
    expect(inputToPress({ ...at, source: 'captouch', type: 'select' })).toBe('short');
  });

  it('ignores everything it should not guess at', () => {
    const ignored: InputEvent[] = [
      { ...at, source: 'captouch', type: 'nav', direction: 'up' },
      { ...at, source: 'captouch', type: 'back' },
      { ...at, source: 'neuralBand', type: 'select' },
      { ...at, source: 'actionButton', type: 'button', button: 'action' },
      { ...at, source: 'neuralBandDrag', type: 'drag', action: 'move', x: 0, y: 0, dx: 1, dy: 1 },
    ];
    for (const event of ignored) expect(inputToPress(event)).toBeNull();
  });
});

describe('toConnection', () => {
  it('is connected only with a running session', () => {
    expect(toConnection('connected', 'started')).toBe('connected');
    expect(toConnection('connected', null)).toBe('disconnected');
    expect(toConnection('connected', 'stopped')).toBe('disconnected');
  });

  it('shows connecting while the link or session comes up', () => {
    expect(toConnection('connecting', null)).toBe('connecting');
    expect(toConnection('connected', 'starting')).toBe('connecting');
  });

  it('a dropped link wins over a session the phone still thinks is running', () => {
    expect(toConnection('disconnected', 'started')).toBe('disconnected');
  });
});

describe('toStatePatch', () => {
  it('reads battery and charging', () => {
    expect(toStatePatch({ batteryLevel: 72.4, chargingState: 'charging' })).toEqual({ batteryPercent: 72, charging: true });
    expect(toStatePatch({ chargingState: 'notCharging' })).toEqual({ charging: false });
  });

  it('treats null (iOS) and -1 (Android) as unknown battery', () => {
    expect(toStatePatch({ batteryLevel: null })).toEqual({ batteryPercent: null });
    expect(toStatePatch({ batteryLevel: -1 })).toEqual({ batteryPercent: null });
  });

  it('leaves out what the event did not carry', () => {
    expect(toStatePatch({ chargingState: 'unknown' })).toEqual({});
  });
});

describe('streamErrorMessage', () => {
  it('gives the next action in plain English, never the SDK code', () => {
    const errors: StreamError[] = [
      { type: 'hingesClosed' },
      { type: 'permissionDenied' },
      { type: 'deviceNotConnected', deviceId: 'd1' },
      { type: 'thermalCritical' },
      { type: 'batteryCritical' },
      { type: 'timeout' },
      { type: 'internalError' },
      { type: 'photoCaptureFailed' },
    ];
    for (const error of errors) {
      const message = streamErrorMessage(error);
      expect(message).not.toMatch(/[a-z][A-Z]/); // no camelCase codes
      expect(message.length).toBeGreaterThan(20);
    }
    expect(streamErrorMessage({ type: 'hingesClosed' })).toMatch(/Unfold/);
    expect(streamErrorMessage({ type: 'permissionDenied' })).toMatch(/Meta AI app/);
  });
});

describe('isFatalStreamError', () => {
  it('lets warnings through but ends a capture on real failures', () => {
    expect(isFatalStreamError({ type: 'batteryLow' })).toBe(false);
    expect(isFatalStreamError({ type: 'thermalHot' })).toBe(false);
    expect(isFatalStreamError({ type: 'photoCaptureFailed' })).toBe(true);
    expect(isFatalStreamError({ type: 'hingesClosed' })).toBe(true);
  });
});

describe('sessionErrorMessage', () => {
  it('stays quiet about warnings that stop nothing', () => {
    expect(sessionErrorMessage('dwaOutOfStuRange')).toBeNull();
    expect(sessionErrorMessage('sessionAlreadyStopped')).toBeNull();
  });

  it('stays quiet about replies to its own tidy-up calls', () => {
    // Removing a camera before adding one must not fail the camera start.
    expect(sessionErrorMessage('capabilityNotFound')).toBeNull();
    expect(sessionErrorMessage('sessionAlreadyExists')).toBeNull();
  });

  it('names the next action for errors that do', () => {
    expect(sessionErrorMessage('datAppOnTheGlassesUpdateRequired')).toMatch(/Update them in the Meta AI app/);
    expect(sessionErrorMessage('noEligibleDevice')).toBe(PUT_ON);
    expect(sessionErrorMessage('deviceDisconnected')).toMatch(/aren.t connected/);
    expect(sessionErrorMessage('sessionEndedByDevice')).toMatch(/Reconnect/);
    expect(sessionErrorMessage('unexpectedError')).toMatch(/Couldn.t connect/);
  });
});

describe('compatibilityMessage', () => {
  it('asks for the right update, and says nothing for compatible glasses', () => {
    expect(compatibilityMessage('deviceUpdateRequired')).toMatch(/Update them in the Meta AI app/);
    expect(compatibilityMessage('sdkUpdateRequired')).toMatch(/Reskale needs an update/);
    expect(compatibilityMessage('compatible')).toBeNull();
    expect(compatibilityMessage(undefined)).toBeNull();
  });
});

describe('deviceLabel', () => {
  it('never shows the "Unknown" Android sends or a blank name', () => {
    expect(deviceLabel('Unknown')).toBe('Meta glasses');
    expect(deviceLabel('')).toBe('Meta glasses');
    expect(deviceLabel(undefined)).toBe('Meta glasses');
    expect(deviceLabel('Ray-Ban Meta')).toBe('Ray-Ban Meta');
  });

  it('falls back to the model before the glasses have connected once', () => {
    expect(deviceLabel('Unknown', 'rayBanMeta')).toBe('Ray-Ban Meta');
    expect(deviceLabel('RB Meta 0081', 'rayBanMeta')).toBe('RB Meta 0081');
    expect(deviceLabel('Unknown', 'metaGlasses')).toBe('Meta glasses');
  });
});

describe('isTakenOff', () => {
  it('is true only when the glasses say they are off the face', () => {
    expect(isTakenOff({ donState: 'doffed' })).toBe(true);
    expect(isTakenOff({ donState: 'donned' })).toBe(false);
    expect(isTakenOff({ donState: 'unknown' })).toBe(false);
    expect(isTakenOff(undefined)).toBe(false);
  });
});

describe('createSpeechRestarter', () => {
  it('starts the mic again each time Meta ends a speech session after its minute', () => {
    let t = 0;
    const speech = createSpeechRestarter(() => t);
    speech.started();
    t = 60_000;
    expect(speech.stopped()).toBe(true);
    speech.started();
    t = 120_000;
    expect(speech.stopped()).toBe(true);
  });

  it('ignores a stop before the mic ever started, or a second one for the same stop', () => {
    let t = 0;
    const speech = createSpeechRestarter(() => t);
    expect(speech.stopped()).toBe(false);
    speech.started();
    t = 60_000;
    expect(speech.stopped()).toBe(true);
    expect(speech.stopped()).toBe(false);
  });

  it('gives up when the mic keeps stopping straight after each restart', () => {
    let t = 0;
    const speech = createSpeechRestarter(() => t);
    const quickStop = () => {
      speech.started();
      t += 1_000;
      return speech.stopped();
    };
    expect([quickStop(), quickStop(), quickStop(), quickStop()]).toEqual([true, true, true, false]);
  });

  it('forgives quick stops once a full session runs', () => {
    let t = 0;
    const speech = createSpeechRestarter(() => t);
    for (let i = 0; i < 3; i++) {
      speech.started();
      t += 1_000;
      speech.stopped();
    }
    speech.started();
    t += 60_000;
    expect(speech.stopped()).toBe(true);
    speech.started();
    t += 1_000;
    expect(speech.stopped()).toBe(true);
  });
});
