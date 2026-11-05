// From the Reskale app: first written 2026-10-23, last changed 2026-11-04 (before this repo). See HACKATHON.md.
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';
import type {
  Device,
  DeviceSessionState,
  LinkState,
  RegistrationState,
  StreamState,
} from '@chrisgocode/expo-meta-wearables-dat';
import { createConditionWaiter } from './condition-waiter';
import {
  compatibilityMessage,
  createSpeechRestarter,
  deviceLabel,
  inputToPress,
  isFatalStreamError,
  isTakenOff,
  PUT_ON,
  sessionErrorMessage,
  SPEECH_CYCLE_MS,
  streamErrorMessage,
  toConnection,
  toStatePatch,
} from './meta-events';
import { createPhotoWaiter } from './photo-waiter';
import type { GlassesTransport } from './transport';
import { uprightPhoto } from './upright-photo';
import type { GlassesDevice, GlassesEvent, GlassesListener, GlassesSnapshot } from './types';

type MetaModule = typeof import('@chrisgocode/expo-meta-wearables-dat');

/**
 * Ray-Ban / Oakley Meta glasses through Meta's Wearables Device Access Toolkit
 * (DAT 1.0, via the community Expo wrapper).
 *
 * How it differs from Mentra:
 * - Pairing belongs to the Meta AI app. "Find my glasses" registers Reskale
 *   with Meta AI once (it opens that app to approve), then lists the glasses.
 * - Photos are frames from the camera stream (up to 720×1280). The camera runs
 *   only while photos are being taken and stops after a minute idle, to spare
 *   the glasses' battery and heat. Full-resolution stills are still an
 *   experimental DAT capability; not used yet.
 * - The capture button reaches the app through DAT's experimental Inputs
 *   capability. If it isn't available, the on-screen button still works.
 * - No livestream and no Wi-Fi: DAT sends video to the phone, not to an RTMP
 *   server, so going live stays a Mentra feature for now.
 *
 * `mock` uses DAT's MockDeviceKit (debug builds only): pretend glasses whose
 * camera is the phone's back camera, so the whole flow runs without hardware.
 *
 * Links: the wrapper is configured with its own scheme (`reskale-meta`, see
 * app.json), so before setup it never holds on to Reskale's own links. After
 * setup it still hands every link the app opens to Meta's SDK (a wrapper
 * limitation); its logging is turned down to warnings first so those links
 * are not written to the device log.
 *
 * Verified on real Ray-Ban Meta glasses 2026-10-30 (registration, camera,
 * scans, listing photos). They must be worn: off the face the firmware
 * refuses a session.
 */

const NOT_READY = 'Connect your glasses first.';
const CONNECT_FAILED =
  "Couldn't connect to your glasses. Make sure they're on, paired in the Meta AI app and close to your phone, then try again.";
const SETUP_FAILED = "Couldn't start Meta glasses support. Close the app, open it again, and retry.";
const REGISTER_TIMEOUT =
  'Finish connecting Reskale in the Meta AI app, then come back here and tap Find my glasses again.';
const META_AI_MISSING = "Couldn't open the Meta AI app. Install it, pair your glasses there, then try again.";
const PERMISSION_DENIED = 'Reskale needs camera access on your glasses. Allow it in the Meta AI app, then try again.';
const CAMERA_FAILED = "Couldn't start the glasses camera. Unfold them, make sure they're on, then try again.";
const PHOTO_FAILED = "The glasses couldn't take that photo. Try again in a moment.";
const BUSY = 'Still taking the last photo — one moment.';
const DISCONNECTED = 'Your glasses disconnected.';
const NO_LIVESTREAM = 'Going live works with Mentra Live glasses. Meta glasses can scan items and take listing photos.';
const NONE_FOUND =
  'No glasses found. Pair your glasses in the Meta AI app and turn them on, then tap Find my glasses again.';
const LOOKUP_FAILED =
  "Couldn't look for your glasses. Make sure the Meta AI app is installed and your glasses are paired, then try again.";
const NO_WIFI = "Meta glasses don't need Wi-Fi for Reskale.";
const PHONE_CAMERA_NEEDED = 'Test glasses use your phone camera. Allow camera access, then try again.';
const TEST_GLASSES_FAILED = "Couldn't start the test glasses. Close the app, open it again, and retry.";

const REGISTER_TIMEOUT_MS = 120_000; // the seller switches to Meta AI and back
const SESSION_TIMEOUT_MS = 20_000;
const STREAM_TIMEOUT_MS = 15_000;
const DEVICES_TIMEOUT_MS = 10_000;
/** How long the camera stays on after the last photo, so the next is quick. */
const CAMERA_IDLE_MS = 60_000;

const noop = () => undefined;

/**
 * An error whose message is already written for the seller. Anything else
 * (an SDK code, a bug) is logged and replaced with a plain-English message.
 * A flag, not a subclass: `instanceof` on Error subclasses is unreliable
 * after Babel's class transform.
 */
type PlainError = Error & { plain: true };

function plainError(message: string): PlainError {
  return Object.assign(new Error(message), { plain: true as const });
}

function isPlain(err: unknown): err is PlainError {
  return err instanceof Error && (err as Partial<PlainError>).plain === true;
}

function reason(err: unknown): unknown {
  return err instanceof Error ? err.message : err;
}

/** Keep the raw SDK error for diagnostics; the caller shows `message`. */
async function friendly<T>(work: Promise<T>, message: string): Promise<T> {
  try {
    return await work;
  } catch (err) {
    if (isPlain(err)) throw err;
    console.warn('[glasses] meta:', reason(err));
    throw plainError(message);
  }
}

function toDevice(d: Device): GlassesDevice {
  return { id: d.identifier, name: deviceLabel(d.name, d.deviceType), raw: d };
}

function fileUri(path: string): string {
  return path.startsWith('file://') ? path : `file://${path}`;
}

export function createMetaTransport({ mock }: { mock: boolean }): GlassesTransport {
  // Loaded here, not at the top: the store imports this file in every build,
  // and a build without the native module must still open the glasses screen.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const Meta: MetaModule = require('@chrisgocode/expo-meta-wearables-dat');

  const listeners = new Set<GlassesListener>();
  const emit = (event: GlassesEvent) => listeners.forEach((l) => l(event));

  const photos = createPhotoWaiter();
  const conditions = createConditionWaiter();
  const waitFor = (check: () => boolean, timeoutMs: number, message: string) =>
    conditions.until(check, timeoutMs, message).catch((err: unknown) => {
      throw plainError(reason(err) as string); // every waiter message is ours
    });

  let configured: Promise<void> | null = null;
  let registration: RegistrationState = 'unavailable';
  let devices: Device[] = [];
  let deviceId: string | null = null;
  let mockId: string | null = null;
  let link: LinkState | undefined;
  let sessionId: string | null = null;
  const sessionStates = new Map<string, DeviceSessionState>();
  const streamStates = new Map<string, StreamState>();
  let camera: Promise<void> | null = null;
  /** True once the camera currently attached reached 'streaming'. */
  let cameraReady = false;
  /** Bumped whenever the camera is forgotten, so a stale start can tell. */
  let cameraGen = 0;
  let cameraIdle: ReturnType<typeof setTimeout> | null = null;
  let photoInFlight: string | null = null;
  /** The phone is showing the live view: the camera stays on between photos. */
  let previewing = false;
  let frameAspect: number | null = null;
  /**
   * Disconnect parks the session instead of stopping it. DAT 1.0 only finds
   * the glasses again after a stopped session once Android reports a
   * Bluetooth change (meta-wearables-dat-android #208), so a stop + start
   * left Reconnect timing out until the seller toggled Bluetooth. Parked, the
   * camera is off and the button is ignored; Reconnect just unparks.
   */
  let parked = false;
  let speech = createSpeechRestarter();
  let speechCycle: ReturnType<typeof setTimeout> | null = null;

  const sessionState = () => (sessionId ? sessionStates.get(sessionId) ?? null : null);
  const connection = () => (parked ? 'disconnected' : toConnection(link, sessionState()));
  const emitConnection = () => emit({ type: 'status', patch: { connection: connection() } });

  const forgetCamera = () => {
    if (cameraIdle) clearTimeout(cameraIdle);
    cameraIdle = null;
    camera = null;
    cameraReady = false;
    cameraGen += 1;
    if (sessionId) streamStates.delete(sessionId);
  };

  /**
   * Everything in flight ends and the session is stopped on the glasses too,
   * so the next capture starts from scratch. Stopping a session that already
   * ended is harmless (the SDK answers 'sessionAlreadyStopped').
   */
  const dropSession = (message: string) => {
    const id = sessionId;
    photos.cancelAll(message);
    conditions.failAll(message);
    photoInFlight = null;
    previewing = false; // the live view asks again once reconnected
    forgetCamera();
    sessionId = null;
    parked = false;
    if (id) {
      sessionStates.delete(id);
      void Meta.stopSession(id).catch(noop);
    }
  };

  // The wrapper's events are module-wide, so they are wired once per transport
  // (the store keeps one transport per kind).
  Meta.addListener('onRegistrationStateChange', ({ state }) => {
    registration = state;
    conditions.recheck();
  });
  Meta.addListener('onDevicesChange', ({ devices: next }) => {
    devices = next;
    conditions.recheck();
  });
  Meta.addListener('onLinkStateChange', ({ deviceId: id, linkState }) => {
    if (id !== deviceId) return;
    link = linkState;
    if (linkState === 'disconnected') dropSession(DISCONNECTED);
    emitConnection();
  });
  Meta.addListener('onDeviceStateChange', ({ deviceId: id, ...state }) => {
    if (id !== deviceId) return;
    const patch = toStatePatch(state);
    if (Object.keys(patch).length > 0) emit({ type: 'status', patch });
  });
  Meta.addListener('onDeviceSessionStateChange', ({ sessionId: id, state }) => {
    if (id !== sessionId) return;
    sessionStates.set(id, state);
    // Ended from the glasses or the Meta AI app.
    if (state === 'stopped') dropSession(DISCONNECTED);
    conditions.recheck();
    emitConnection();
  });
  Meta.addListener('onDeviceSessionError', ({ sessionId: id, error, message }) => {
    console.warn('[glasses] meta session error:', error, message ?? '');
    if (id !== sessionId) return;
    const seller = sessionErrorMessage(error);
    if (!seller) return;
    if (photoInFlight) photos.fail(photoInFlight, seller);
    conditions.failAll(seller);
  });
  Meta.addListener('onStreamStateChange', ({ sessionId: id, state }) => {
    if (id !== sessionId) return;
    streamStates.set(id, state);
    // Only a camera that was running counts as stopped. While one is starting,
    // a late 'stopped' from the camera before it must not cancel it.
    if (cameraReady && (state === 'stopped' || state === 'closed')) {
      forgetCamera();
      void Meta.removeCameraFromSession(id).catch(noop);
    }
    conditions.recheck();
  });
  Meta.addListener('onStreamError', (error) => {
    console.warn('[glasses] meta stream error:', error.type);
    if (!isFatalStreamError(error)) return;
    const message = streamErrorMessage(error);
    if (photoInFlight) photos.fail(photoInFlight, message);
    conditions.failAll(message);
  });
  Meta.addListener('onPhotoCaptured', ({ filePath }) => {
    if (photoInFlight) photos.deliver(photoInFlight, fileUri(filePath));
  });
  Meta.addListener('onInputEvent', (event) => {
    if (__DEV__) console.log('[glasses] meta input:', event.type, (event as { pressType?: string }).pressType ?? '', parked ? '(parked)' : '');
    if (event.sessionId !== sessionId || parked) return;
    const press = inputToPress(event);
    if (press) emit({ type: 'button', press });
  });
  // 15 frames a second arrive; only a change of shape is news (it lines the crop box up with the photo).
  Meta.addListener('onVideoFrame', ({ width, height }) => {
    if (!width || !height) return;
    const aspect = Math.round((width / height) * 1000) / 1000;
    if (aspect === frameAspect) return;
    if (__DEV__) console.log('[glasses] live view frames:', `${width}x${height}`);
    frameAspect = aspect;
    emit({ type: 'status', patch: { frameAspect } });
  });
  // Partial results change as the seller speaks; act on the finished phrase only.
  Meta.addListener('onTranscription', ({ sessionId: id, text, isFinal }) => {
    if (id !== sessionId || parked || !isFinal || !text.trim()) return;
    emit({ type: 'speech', text });
  });
  // The glasses end each speech session after a minute without saying so, so
  // the mic is stopped just before then and started again (SPEECH_CYCLE_MS).
  Meta.addListener('onExperimentalCapabilityStateChange', ({ sessionId: id, capability, state }) => {
    if (capability !== 'speech' || id !== sessionId) return;
    if (__DEV__) console.log('[glasses] meta speech:', state);
    if (state === 'started') {
      speech.started();
      if (speechCycle) clearTimeout(speechCycle);
      speechCycle = setTimeout(() => {
        if (id === sessionId && !parked) void Meta.stopSpeech(id).catch(noop);
      }, SPEECH_CYCLE_MS);
      return;
    }
    if (state !== 'stopped' || parked || !speech.stopped()) return;
    void Meta.startSpeech(id).catch((err: unknown) => console.warn('[glasses] meta: voice commands unavailable:', reason(err)));
  });

  const ensureConfigured = (): Promise<void> => {
    // Before configure: from then on the wrapper logs every link it is handed.
    Meta.setLogLevel('warn');
    configured ??= Meta.configure()
      .then(async () => {
        registration = await Meta.getRegistrationStateAsync();
      })
      .catch((err: unknown) => {
        configured = null;
        throw err;
      });
    return friendly(configured, SETUP_FAILED);
  };

  /** Pretend glasses whose camera is the phone's back camera. */
  const ensureMockGlasses = async (): Promise<void> => {
    const phoneCamera = await friendly(ImagePicker.requestCameraPermissionsAsync(), PHONE_CAMERA_NEEDED);
    if (!phoneCamera.granted) throw plainError(PHONE_CAMERA_NEEDED);
    await friendly(
      (async () => {
        if (!(await Meta.isMockDeviceKitEnabled())) {
          await Meta.enableMockDeviceKit({ initiallyRegistered: true, initialPermissionsGranted: true });
        }
        const [existing] = await Meta.getMockDevices();
        const id = existing ?? (await Meta.pairMockDevice('rayBanMeta'));
        await Meta.mockDevicePowerOn(id);
        await Meta.mockDeviceUnfold(id);
        await Meta.mockDeviceDon(id);
        await Meta.mockDeviceSetCameraFeedFromCamera(id, 'back');
        mockId = id;
      })(),
      TEST_GLASSES_FAILED,
    );
  };

  const ensureRegistered = async (): Promise<void> => {
    registration = await friendly(Meta.getRegistrationStateAsync(), META_AI_MISSING);
    if (registration === 'registered') return;
    await friendly(Meta.startRegistration(), META_AI_MISSING); // opens the Meta AI app
    try {
      await waitFor(() => registration === 'registered', REGISTER_TIMEOUT_MS, REGISTER_TIMEOUT);
    } catch (err) {
      // The event can be missed while the app is in the background; ask once.
      const now = await Meta.getRegistrationStateAsync().catch(() => registration);
      if (now !== 'registered') throw err;
      registration = now;
    }
  };

  const ensureCameraPermission = async (): Promise<void> => {
    const granted = await friendly(
      (async () =>
        (await Meta.checkPermissionStatus('camera')) === 'granted' ||
        (await Meta.requestPermission('camera')) === 'granted')(),
      PERMISSION_DENIED,
    );
    if (!granted) throw plainError(PERMISSION_DENIED);
  };

  const ensureCamera = (): Promise<void> => {
    if (cameraIdle) clearTimeout(cameraIdle);
    cameraIdle = null;
    if (camera) return camera;
    const id = sessionId;
    if (!id) return Promise.reject(plainError(NOT_READY));
    const gen = cameraGen;
    const starting = (async () => {
      // Our view of the camera can be behind the glasses' (an event missed
      // while the app was in the background); start from a clean slate.
      await Meta.removeCameraFromSession(id).catch(noop);
      streamStates.delete(id);
      await friendly(
        Meta.addCameraToSession(id, { resolution: 'high', frameRate: 15, videoCodec: 'raw' }),
        CAMERA_FAILED,
      );
      await waitFor(() => streamStates.get(id) === 'streaming', STREAM_TIMEOUT_MS, CAMERA_FAILED);
      if (gen === cameraGen) cameraReady = true;
    })().catch(async (err: unknown) => {
      // A start that was superseded leaves the newer camera alone.
      if (gen === cameraGen) {
        forgetCamera();
        await Meta.removeCameraFromSession(id).catch(noop);
      }
      throw err;
    });
    camera = starting;
    return starting;
  };

  const stopCamera = async () => {
    const id = sessionId;
    forgetCamera();
    if (id) await Meta.removeCameraFromSession(id).catch(noop);
  };

  const stopCameraWhenIdle = () => {
    if (cameraIdle) clearTimeout(cameraIdle);
    cameraIdle = null;
    if (previewing) return; // the live view still needs it
    cameraIdle = setTimeout(() => void stopCamera(), CAMERA_IDLE_MS);
  };

  const statusPatch = (raw: Device) => ({
    connection: connection(),
    deviceName: deviceLabel(raw.name, raw.deviceType),
    ...toStatePatch(raw),
  });

  const start = async (device: GlassesDevice): Promise<void> => {
    await ensureConfigured();
    if (mock) await ensureMockGlasses();
    await ensureCameraPermission();

    // A saved device's link state is from whenever it was saved; ask again.
    const raw = (await Meta.getDevice(device.id).catch(() => null)) ?? (device.raw as Device);

    // Disconnected with the session parked: carry on with it.
    if (parked && device.id === deviceId && sessionState() === 'started' && raw.linkState !== 'disconnected') {
      parked = false;
      link = raw.linkState;
      if (sessionId) await Meta.startSpeech(sessionId).catch(noop);
      emit({ type: 'status', patch: statusPatch(raw) });
      return;
    }

    dropSession(DISCONNECTED);
    deviceId = device.id;
    const blocked = compatibilityMessage(raw.compatibility);
    if (blocked) throw plainError(blocked);
    link = raw.linkState;

    // The worn reading can be stale, so always try. Off the face the glasses
    // refuse the session; only then is "put them on" the answer.
    const notStarted = async (): Promise<never> => {
      const now = await Meta.getDevice(device.id).catch(() => null);
      throw plainError(isTakenOff(now ?? undefined) ? PUT_ON : CONNECT_FAILED);
    };
    const id = await friendly(Meta.createSession(device.id), CONNECT_FAILED).catch(notStarted);
    sessionId = id;
    speech = createSpeechRestarter();
    emitConnection();
    await friendly(Meta.startSession(id), CONNECT_FAILED).catch(notStarted);
    await waitFor(() => sessionStates.get(id) === 'started', SESSION_TIMEOUT_MS, CONNECT_FAILED).catch(notStarted);

    // The capture button is an experimental DAT capability: without it the
    // on-screen button still works, so a failure here is not a failed connect.
    // consumeBack stays off so a back swipe on the glasses still does what the
    // seller expects there.
    await Meta.addInputsToSession(id, { sources: ['captureButton', 'captouch'], consumeBack: false }).catch(
      (err: unknown) => console.warn('[glasses] meta: glasses button unavailable:', reason(err)),
    );
    // Voice commands are experimental too, and optional the same way.
    await addSpeech(id).catch((err: unknown) => console.warn('[glasses] meta: voice commands unavailable:', reason(err)));

    emit({ type: 'status', patch: statusPatch(raw) });
  };

  const addSpeech = async (id: string): Promise<void> => {
    const mic =
      (await Meta.checkPermissionStatus('microphone')) === 'granted' ||
      (await Meta.requestPermission('microphone')) === 'granted';
    if (!mic) throw new Error('microphone permission denied');
    await Meta.addSpeechToSession(id);
  };

  const connect = async (device: GlassesDevice): Promise<void> => {
    try {
      await start(device);
    } catch (err) {
      // Don't leave a half-started session on the glasses.
      dropSession(DISCONNECTED);
      emitConnection();
      if (isPlain(err)) throw err;
      console.warn('[glasses] meta connect:', reason(err));
      throw plainError(CONNECT_FAILED);
    }
  };

  /** Ends everything, the session on the glasses included. */
  const shutDown = async (): Promise<void> => {
    dropSession(DISCONNECTED);
    if (mock) {
      // Test glasses film through the phone's camera; stop that as well.
      mockId = null;
      await Meta.disableMockDeviceKit().catch(noop);
    }
    emitConnection();
  };

  /** Camera off and button ignored, session kept for a quick Reconnect (see `parked`). */
  const disconnect = async (): Promise<void> => {
    if (mock || !sessionId) return shutDown();
    photos.cancelAll(DISCONNECTED);
    conditions.failAll(DISCONNECTED);
    photoInFlight = null;
    previewing = false;
    parked = true;
    await Meta.stopSpeech(sessionId).catch(noop); // the mic is off while parked
    await stopCamera();
    emitConnection();
  };

  const listDevices = async (onResults: (found: GlassesDevice[]) => void, timeoutMs: number) => {
    devices = await friendly(Meta.getDevices(), LOOKUP_FAILED);
    if (devices.length === 0) {
      await conditions.until(() => devices.length > 0, timeoutMs, '').catch(noop);
    }
    const found = devices.map(toDevice);
    if (found.length === 0) throw plainError(NONE_FOUND);
    onResults(found);
    return found;
  };

  return {
    kind: mock ? 'meta-mock' : 'meta',
    features: { livestream: false, wifi: false, voice: true },

    // MockDeviceKit exists only in debug builds.
    isAvailable: () => !mock || __DEV__,

    async snapshot(): Promise<GlassesSnapshot> {
      const base: GlassesSnapshot = {
        connection: 'disconnected',
        deviceName: null,
        batteryPercent: null,
        charging: false,
        wifiSsid: null,
      };
      try {
        await ensureConfigured();
        if (registration !== 'registered') return base;
        devices = await Meta.getDevices();
        const device = devices.find((d) => d.identifier === deviceId) ?? devices[0];
        if (!device) return base;
        if (!deviceId) link = device.linkState;
        return {
          ...base,
          deviceName: deviceLabel(device.name, device.deviceType),
          ...toStatePatch(device),
          connection: connection(),
        };
      } catch (err) {
        console.warn('[glasses] meta snapshot:', reason(err));
        return base;
      }
    },

    async scan(onResults, timeoutMs) {
      await ensureConfigured();
      if (mock) await ensureMockGlasses();
      else await ensureRegistered();
      return listDevices(onResults, timeoutMs > 0 ? timeoutMs : DEVICES_TIMEOUT_MS);
    },

    connect,
    reconnect: connect,
    disconnect,

    async forget() {
      await shutDown();
      deviceId = null;
      if (mock) return; // disconnect already switched the test glasses off
      // Opens the Meta AI app to remove Reskale's access.
      await friendly(Meta.startUnregistration(), "Couldn't open the Meta AI app. Remove Reskale there instead.");
    },

    async capturePhoto() {
      // Listing and scan photos are the same frame size on Meta glasses (see top).
      if (!sessionId || parked || sessionState() !== 'started') throw plainError(NOT_READY);
      if (photoInFlight) throw plainError(BUSY);
      const requestId = `meta-${Crypto.randomUUID()}`;
      // Claimed before the camera starts, so a second tap meanwhile is BUSY.
      photoInFlight = requestId;
      try {
        await ensureCamera();
        if (photoInFlight !== requestId) throw plainError(DISCONNECTED); // dropped while starting
        const file = photos.expect(requestId);
        Meta.capturePhoto('jpeg').catch((err: unknown) => {
          console.warn('[glasses] meta capture failed:', reason(err));
          photos.fail(requestId, PHOTO_FAILED);
        });
        // Real glasses send it sideways; the test glasses use the phone camera, which doesn't.
        const uri = await file;
        return { uri: mock ? uri : await uprightPhoto(uri), requestId };
      } finally {
        if (photoInFlight === requestId) photoInFlight = null;
        if (sessionId) stopCameraWhenIdle();
      }
    },

    startStream: () => Promise.reject(plainError(NO_LIVESTREAM)),
    stopStream: () => Promise.reject(plainError(NO_LIVESTREAM)),

    async startPreview() {
      if (!sessionId || parked) throw plainError(NOT_READY);
      previewing = true;
      await ensureCamera();
    },

    stopPreview() {
      if (!previewing) return;
      previewing = false;
      if (sessionId && camera) stopCameraWhenIdle();
    },
    scanWifi: () => Promise.reject(plainError(NO_WIFI)),
    joinWifi: () => Promise.reject(plainError(NO_WIFI)),

    subscribe(listener) {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },

    ...(mock && {
      pressButton(press) {
        if (!mockId) return;
        void Meta.mockDeviceSimulate(mockId, {
          type: 'input',
          event: {
            source: 'captureButton',
            timestampMs: Date.now(),
            type: 'capture',
            pressType: press === 'long' ? 'hold' : press === 'double' ? 'doublePress' : 'shortPress',
          },
        }).catch((err: unknown) => {
          console.warn('[glasses] meta mock press:', reason(err));
        });
      },
      speak(text) {
        if (!mockId) return;
        void Meta.mockDeviceSimulate(mockId, { type: 'transcription', text, isFinal: true }).catch((err: unknown) => {
          console.warn('[glasses] meta mock speech:', reason(err));
        });
      },
    }),
  };
}
