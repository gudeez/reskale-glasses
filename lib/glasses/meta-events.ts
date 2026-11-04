// From the Reskale app: first written 2026-10-23, last changed 2026-11-04 (before this repo). See HACKATHON.md.
import type {
  Compatibility,
  DeviceSessionErrorCode,
  DeviceState,
  DeviceSessionState,
  DeviceType,
  InputEvent,
  LinkState,
  StreamError,
} from '@chrisgocode/expo-meta-wearables-dat';
import type { ButtonPress, GlassesConnection, GlassesSnapshot } from './types';

/**
 * Meta glasses events, translated into the app's own glasses vocabulary.
 * Pure (type-only imports), so it unit-tests in plain Node.
 */

/**
 * The capture button on the frame is the natural "take it" button: a short
 * press scans or shoots, a hold finishes, a double press ends. A captouch tap
 * on the temple counts as a short press too. Everything else (swipes, Neural
 * Band) is ignored rather than guessed at.
 */
export function inputToPress(event: InputEvent): ButtonPress | null {
  if (event.type === 'capture') {
    if (event.pressType === 'shortPress') return 'short';
    if (event.pressType === 'hold') return 'long';
    if (event.pressType === 'doublePress') return 'double';
    return null;
  }
  if (event.type === 'select' && event.source === 'captouch') return 'short';
  return null;
}

/**
 * "Connected" in this app means "ready to take a photo": linked to the phone
 * AND a Reskale session running on the glasses.
 */
export function toConnection(link: LinkState | undefined, session: DeviceSessionState | null): GlassesConnection {
  if (link === 'disconnected') return 'disconnected';
  if (session === 'started') return 'connected';
  if (link === 'connecting' || session === 'starting' || session === 'idle') return 'connecting';
  return 'disconnected';
}

/** Battery and charging from a device snapshot or onDeviceStateChange. */
export function toStatePatch(state: Partial<DeviceState>): Partial<GlassesSnapshot> {
  const patch: Partial<GlassesSnapshot> = {};
  if ('batteryLevel' in state) {
    // iOS reports null and Android -1 when the level is unknown.
    patch.batteryPercent =
      typeof state.batteryLevel === 'number' && state.batteryLevel >= 0 ? Math.round(state.batteryLevel) : null;
  }
  if (state.chargingState === 'charging') patch.charging = true;
  else if (state.chargingState === 'notCharging') patch.charging = false;
  return patch;
}

const TRY_AGAIN = "The glasses couldn't take that photo. Try again in a moment.";

/** What to tell the seller when the camera stream or a capture fails. */
export function streamErrorMessage(error: StreamError): string {
  switch (error.type) {
    case 'hingesClosed':
      return 'Unfold your glasses to use the camera.';
    case 'permissionDenied':
      return 'Reskale needs camera access on your glasses. Allow it in the Meta AI app, then try again.';
    case 'deviceNotFound':
    case 'deviceNotConnected':
      return "Your glasses aren't connected. Open the Meta AI app to check they're paired, then try again.";
    case 'thermalHot':
    case 'thermalCritical':
    case 'thermalEmergency':
    case 'peakPowerLimit':
    case 'peakPowerShutdown':
      return 'Your glasses are too warm to use the camera. Let them cool for a few minutes.';
    case 'batteryLow':
    case 'batteryCritical':
      return 'Your glasses are low on battery. Charge them, then try again.';
    case 'timeout':
      return "The glasses didn't respond in time. Make sure they're on and nearby, then try again.";
    default:
      return TRY_AGAIN;
  }
}

/** Errors that end any capture in flight, rather than only warning. */
export function isFatalStreamError(error: StreamError): boolean {
  return error.type !== 'batteryLow' && error.type !== 'thermalHot' && error.type !== 'peakPowerLimit';
}

/**
 * The glasses end each speech session a minute after it starts ("Speech
 * session completed" in the device log) and tell nobody: DAT 1.0 keeps the
 * state at 'started' and its start() refuses anything but 'stopped'. So voice
 * commands went deaf a minute after connecting. The transport stops the mic
 * itself just before the minute is up, and starts it again (below).
 */
export const SPEECH_CYCLE_MS = 55_000;

/** A speech session shorter than this stopped "straight away". */
const SPEECH_QUICK_STOP_MS = 10_000;
/** Quick stops in a row that still get the mic restarted. */
const SPEECH_QUICK_STOPS_ALLOWED = 3;

/**
 * Says when to start the glasses' mic again after it stops (see
 * SPEECH_CYCLE_MS): only after it had started, and not when it keeps stopping
 * straight away — then the glasses are refusing it and restarting would loop.
 */
export function createSpeechRestarter(now: () => number = Date.now) {
  let startedAt: number | null = null;
  let quickStops = 0;
  return {
    /** The glasses' mic is listening. */
    started() {
      startedAt = now();
    },
    /** The mic stopped, and the seller didn't turn the glasses off: true to start it again. */
    stopped(): boolean {
      if (startedAt === null) return false;
      quickStops = now() - startedAt < SPEECH_QUICK_STOP_MS ? quickStops + 1 : 0;
      startedAt = null;
      return quickStops <= SPEECH_QUICK_STOPS_ALLOWED;
    },
  };
}

/**
 * Meta glasses only start a session while they are being worn: the wear sensor
 * on the inside of the frame must see a face. Off the head the SDK answers
 * `noEligibleDevice`, which used to read as "not connected" and sent sellers
 * off re-pairing glasses that were fine.
 */
export const PUT_ON =
  "Put your glasses on. Meta glasses only connect while you're wearing them. Already on? Open the Meta AI app to check they're paired.";

/** True only when the glasses say they are off the face; unknown is not off. */
export function isTakenOff(state: Partial<DeviceState> | undefined): boolean {
  return state?.donState === 'doffed';
}

const UPDATE_GLASSES = 'Your glasses need an update. Update them in the Meta AI app, then try again.';

/**
 * What to tell the seller when the glasses refuse or end Reskale's session.
 * Null for errors that don't stop anything: warnings, and the replies to the
 * adapter's own tidy-up calls (removing a camera that was already gone,
 * stopping a session that already ended).
 */
export function sessionErrorMessage(code: DeviceSessionErrorCode): string | null {
  switch (code) {
    case 'dwaOutOfStuRange':
    case 'sessionAlreadyStopped':
    case 'sessionAlreadyExists':
    case 'capabilityAlreadyActive':
    case 'capabilityNotFound':
      return null;
    case 'noEligibleDevice':
      // Meta's firmware refuses a session while the glasses are off the face.
      return PUT_ON;
    case 'deviceDisconnected':
      return "Your glasses aren't connected. Open the Meta AI app to check they're paired and on, then try again.";
    case 'capabilityDenied':
      return 'Reskale needs camera access on your glasses. Allow it in the Meta AI app, then try again.';
    case 'datAppOnTheGlassesUpdateRequired':
      return UPDATE_GLASSES;
    case 'insufficientSDKVersion':
      return 'This version of Reskale needs an update to work with your glasses.';
    case 'thermalCritical':
    case 'thermalEmergency':
    case 'peakPowerShutdown':
      return 'Your glasses are too warm to use the camera. Let them cool for a few minutes.';
    case 'batteryCritical':
      return 'Your glasses are low on battery. Charge them, then try again.';
    case 'sessionEndedByDevice':
      return 'Your glasses ended the connection. Tap Reconnect to start again.';
    default:
      return "Couldn't connect to your glasses. Make sure they're on, paired in the Meta AI app and close to your phone, then try again.";
  }
}

/** A device the SDK says can't work until something is updated. */
export function compatibilityMessage(compatibility: Compatibility | undefined): string | null {
  if (compatibility === 'deviceUpdateRequired') return UPDATE_GLASSES;
  if (compatibility === 'sdkUpdateRequired') return 'This version of Reskale needs an update to work with your glasses.';
  return null;
}

const TYPE_NAMES: Partial<Record<DeviceType, string>> = {
  rayBanMeta: 'Ray-Ban Meta',
  rayBanMetaOptics: 'Ray-Ban Meta',
  oakleyMetaHSTN: 'Oakley Meta HSTN',
  oakleyMetaVanguard: 'Oakley Meta Vanguard',
  metaRayBanDisplay: 'Meta Ray-Ban Display',
};

/**
 * Android reports a device as "Unknown" until it has connected once, so the
 * found list falls back to the model the SDK does know.
 */
export function deviceLabel(name: string | undefined, type?: DeviceType): string {
  if (name && name !== 'Unknown') return name;
  return (type && TYPE_NAMES[type]) || 'Meta glasses';
}
