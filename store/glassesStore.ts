import { create } from 'zustand';
import { storage } from '@/lib/storage';
import { createMetaTransport } from '@/lib/glasses/meta';
import { IDLE_STREAM, streamAfterDisconnect } from '@/lib/glasses/stream-status';
import type { GlassesFeatures, GlassesPairing, GlassesTransport } from '@/lib/glasses/transport';
import type { ButtonPress, GlassesDevice, GlassesSnapshot, StreamSnapshot } from '@/lib/glasses/types';

/**
 * One shared connection to the seller's glasses, used by every glasses screen.
 *
 * Only the screen in front reacts to the glasses' button: it registers a
 * handler while focused (see hooks/useGlassesButton.ts), so a press on the
 * sourcing screen never also captures a listing photo.
 */

const SAVED_KEY = 'glasses.savedDevice.v1';

type TransportKind = GlassesTransport['kind'];
type ButtonHandler = (press: ButtonPress) => void;
type SpeechHandler = (text: string) => void;

interface SavedDevice {
  kind: TransportKind;
  device: GlassesDevice;
}

interface GlassesState extends GlassesSnapshot {
  kind: TransportKind;
  /** What the current glasses can do; screens hide the rest. */
  features: GlassesFeatures;
  /** Test glasses: the screen offers a stand-in for the glasses' button. */
  hasTestButton: boolean;
  /** These glasses pair by reading a QR code from the phone (Raven Prism). */
  pairsByCode: boolean;
  /** The code to show while pairing by code; null otherwise. */
  pairingQr: string | null;
  saved: SavedDevice | null;
  found: GlassesDevice[];
  stream: StreamSnapshot;
  error: string | null;
  ready: boolean;
  init: () => Promise<void>;
  switchTransport: (kind: TransportKind) => Promise<void>;
  scan: () => Promise<void>;
  /** Show a code for the glasses to read, then connect to them. */
  pair: () => Promise<void>;
  cancelPairing: () => void;
  connect: (device: GlassesDevice) => Promise<void>;
  reconnect: () => Promise<void>;
  disconnect: () => Promise<void>;
  forget: () => Promise<void>;
  clearError: () => void;
  setButtonHandler: (handler: ButtonHandler) => void;
  /** Clears the handler only if it is still `handler` — a late blur must not wipe the next screen's. */
  releaseButtonHandler: (handler: ButtonHandler) => void;
  /** Test glasses only: what a press of the real button would do. */
  pressDemoButton: (press: ButtonPress) => void;
  /** Same contract as the button handler, for phrases heard by the glasses mic. */
  setSpeechHandler: (handler: SpeechHandler) => void;
  releaseSpeechHandler: (handler: SpeechHandler) => void;
  /** Test glasses only: what saying `text` into the glasses would do. */
  speakDemo: (text: string) => void;
}

const SCAN_TIMEOUT_MS = 10_000;

/** Which glasses a fresh install looks for first. */
const DEFAULT_KIND: TransportKind = 'meta';

const transports: Partial<Record<TransportKind, GlassesTransport>> = {};
let active: GlassesTransport | null = null;
let unsubscribe: (() => void) | null = null;
let buttonHandler: ButtonHandler | null = null;
let speechHandler: SpeechHandler | null = null;
let pairing: GlassesPairing | null = null;
/** Set before startPairing resolves, so a double tap can't start two. */
let pairingStarting = false;

/** Meta glasses only: the real pair, or Meta's Mock Device Kit (the phone's back camera). */
function createTransport(kind: TransportKind): GlassesTransport {
  return createMetaTransport({ mock: kind === 'meta-mock' });
}

function transportFor(kind: TransportKind): GlassesTransport {
  transports[kind] ??= createTransport(kind);
  return transports[kind]!;
}

/** The connected glasses, for screens that capture or stream. */
export function activeGlasses(): GlassesTransport {
  if (!active) throw new Error('Connect your glasses first.');
  return active;
}

async function loadSaved(): Promise<SavedDevice | null> {
  try {
    const raw = await storage.getItem(SAVED_KEY);
    return raw ? (JSON.parse(raw) as SavedDevice) : null;
  } catch {
    return null;
  }
}

const message = (err: unknown) => (err instanceof Error ? err.message : 'Something went wrong. Try again.');

export const useGlassesStore = create<GlassesState>()((set, get) => {
  const attach = async (kind: TransportKind) => {
    unsubscribe?.();
    const transport = transportFor(kind);
    active = transport;
    unsubscribe = transport.subscribe((event) => {
      if (event.type === 'status') {
        const lost = event.patch.connection === 'disconnected' || event.patch.connection === 'unavailable';
        set(lost ? { ...event.patch, stream: streamAfterDisconnect(get().stream) } : event.patch);
      }
      else if (event.type === 'stream') set({ stream: event.stream });
      else if (event.type === 'speech') speechHandler?.(event.text);
      else buttonHandler?.(event.press);
    });
    set({
      kind,
      features: transport.features,
      hasTestButton: typeof transport.pressButton === 'function',
      pairsByCode: typeof transport.startPairing === 'function',
      ...(await transport.snapshot()),
    });
  };

  const remember = async (device: GlassesDevice) => {
    const saved: SavedDevice = { kind: get().kind, device };
    await storage.setItem(SAVED_KEY, JSON.stringify(saved));
    set({ saved, found: [] });
  };

  const stopPairing = () => {
    pairing?.cancel();
    pairing = null;
    set({ pairingQr: null });
  };

  const run = async (work: () => Promise<void>) => {
    set({ error: null });
    try {
      await work();
    } catch (err) {
      set({ error: message(err) });
    }
  };

  return {
    connection: 'disconnected',
    deviceName: null,
    batteryPercent: null,
    charging: false,
    wifiSsid: null,
    kind: DEFAULT_KIND,
    features: { livestream: true, wifi: true },
    hasTestButton: false,
    pairsByCode: false,
    pairingQr: null,
    saved: null,
    found: [],
    stream: IDLE_STREAM,
    error: null,
    ready: false,

    async init() {
      if (get().ready) return;
      const saved = await loadSaved();
      try {
        await attach(saved?.kind ?? DEFAULT_KIND);
        set({ saved, ready: true });
      } catch {
        set({ saved, ready: true, error: "Couldn't start smart glasses support. Close the app, open it again, and retry." });
      }
    },

    async switchTransport(kind) {
      if (kind === get().kind) return;
      stopPairing();
      await active?.disconnect().catch(() => undefined);
      await attach(kind);
      set({ found: [] });
    },

    scan: () =>
      run(async () => {
        set({ found: [] });
        const found = await activeGlasses().scan((devices) => set({ found: devices }), SCAN_TIMEOUT_MS);
        set({ found });
        if (found.length === 0) {
          set({ error: "No glasses found. Turn them on, keep them close to your phone, and try again." });
        }
      }),

    connect: (device) =>
      run(async () => {
        await activeGlasses().connect(device);
        await remember(device);
      }),

    pair: () =>
      run(async () => {
        const transport = activeGlasses();
        if (!transport.startPairing || pairing || pairingStarting) return;
        pairingStarting = true;
        let session: GlassesPairing;
        try {
          session = await transport.startPairing();
        } finally {
          pairingStarting = false;
        }
        pairing = session;
        set({ pairingQr: session.qrValue });
        let device: GlassesDevice;
        try {
          device = await session.done;
        } catch (err) {
          if (pairing !== session) return; // cancelled: nothing to report
          throw err;
        } finally {
          if (pairing === session) stopPairing();
        }
        await transport.connect(device);
        await remember(device);
      }),

    cancelPairing: stopPairing,

    reconnect: () =>
      run(async () => {
        const saved = get().saved;
        if (!saved) throw new Error('Pair your glasses first.');
        if (saved.kind !== get().kind) await attach(saved.kind);
        await activeGlasses().reconnect(saved.device);
      }),

    disconnect: () =>
      run(async () => {
        await activeGlasses().disconnect();
        set({ stream: streamAfterDisconnect(get().stream) });
      }),

    forget: () =>
      run(async () => {
        stopPairing();
        await activeGlasses().forget(get().saved?.device);
        await storage.removeItem(SAVED_KEY);
        set({ saved: null, stream: streamAfterDisconnect(get().stream) });
      }),

    clearError: () => set({ error: null }),

    setButtonHandler(handler) {
      buttonHandler = handler;
    },

    releaseButtonHandler(handler) {
      if (buttonHandler === handler) buttonHandler = null;
    },

    pressDemoButton(press) {
      active?.pressButton?.(press);
    },

    setSpeechHandler(handler) {
      speechHandler = handler;
    },

    releaseSpeechHandler(handler) {
      if (speechHandler === handler) speechHandler = null;
    },

    speakDemo(text) {
      active?.speak?.(text);
    },
  };
});
