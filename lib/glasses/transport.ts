// From the Reskale app: first written 2026-10-23, last changed 2026-11-02 (before this repo). See HACKATHON.md.
import type { ButtonPress, CaptureQuality, GlassesDevice, GlassesListener, GlassesPhoto, GlassesSnapshot } from './types';

export interface StreamVideo {
  width: number;
  height: number;
  bitrateKbps: number;
  fps: number;
}

/** What a family of glasses can do; screens hide what it can't. */
export interface GlassesFeatures {
  /** Streams straight from the glasses to an RTMP ingest. */
  livestream: boolean;
  /** Joins Wi-Fi itself (Mentra streams and uploads photos over it). */
  wifi: boolean;
  /** Hears spoken commands through the glasses mic ("Reskale, scan"). */
  voice?: boolean;
}

/**
 * Pairing glasses that read a QR code from the phone (Raven Prism): show
 * `qrValue` until `done` settles.
 */
export interface GlassesPairing {
  readonly qrValue: string;
  /** The glasses, once they have read the code and answered. Rejects in plain English. */
  readonly done: Promise<GlassesDevice>;
  cancel(): void;
}

/**
 * One brand of glasses, as the app sees it. `mentra` talks to real Mentra Live
 * glasses, `meta` to Ray-Ban / Oakley Meta through the Meta AI app, and
 * `raven` to Raven Prism over the local Wi-Fi.
 * `demo` and `meta-mock` stand in for them in developer builds so every
 * glasses screen can be exercised without hardware.
 */
export interface GlassesTransport {
  readonly kind: 'mentra' | 'meta' | 'meta-mock' | 'raven' | 'demo';
  readonly features: GlassesFeatures;
  /** False where the native SDK isn't linked (web, Expo Go). */
  isAvailable(): boolean;
  /** The current state, read once when a screen opens. */
  snapshot(): Promise<GlassesSnapshot>;
  scan(onResults: (devices: GlassesDevice[]) => void, timeoutMs: number): Promise<GlassesDevice[]>;
  connect(device: GlassesDevice): Promise<void>;
  /** Reconnect to a pair saved from an earlier session. */
  reconnect(device: GlassesDevice): Promise<void>;
  disconnect(): Promise<void>;
  /** `saved` is the pair the store remembers, for transports that keep a secret per pair. */
  forget(saved?: GlassesDevice): Promise<void>;
  capturePhoto(quality: CaptureQuality): Promise<GlassesPhoto>;
  /** Start streaming straight from the glasses to an RTMP ingest URL. */
  startStream(ingestUrl: string, video: StreamVideo): Promise<void>;
  stopStream(): Promise<void>;
  /** Networks the glasses can see; streaming needs the glasses on Wi-Fi. */
  scanWifi(): Promise<string[]>;
  joinWifi(ssid: string, password: string): Promise<void>;
  subscribe(listener: GlassesListener): () => void;
  /** Test glasses only: what a press of the real button would do. */
  pressButton?(press: ButtonPress): void;
  /**
   * Keep the glasses camera running for the phone's live view (it otherwise
   * stops a minute after the last photo). `stopPreview` hands it back to that.
   */
  startPreview?(): Promise<void>;
  stopPreview?(): void;
  /** Test glasses only: what saying `text` into the glasses mic would do. */
  speak?(text: string): void;
  /** Glasses that pair by reading a QR code from the phone. */
  startPairing?(): Promise<GlassesPairing>;
}
