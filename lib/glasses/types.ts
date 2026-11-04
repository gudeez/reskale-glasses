/**
 * Smart-glasses types shared by every glasses brand.
 *
 * Screens and hooks only ever see these shapes. Each brand's SDK lives behind a
 * `GlassesTransport` (lib/glasses/transport.ts), so adding Meta later is a new
 * transport, not a change to the sourcing, listing or live screens.
 */

export type GlassesConnection = 'unavailable' | 'disconnected' | 'scanning' | 'connecting' | 'connected';

export interface GlassesDevice {
  /** Stable key from the SDK. Never parse it. */
  id: string;
  name: string;
  /** Signal strength when the platform reported it. */
  rssi?: number;
  /** The SDK's own device record, kept so a saved pair can reconnect. */
  raw: unknown;
}

export interface GlassesSnapshot {
  connection: GlassesConnection;
  deviceName: string | null;
  /** 0–100, or null while the glasses haven't reported it. */
  batteryPercent: number | null;
  charging: boolean;
  /** The Wi-Fi network the glasses are on. Livestreaming needs one. */
  wifiSsid: string | null;
  /** Width ÷ height of the glasses camera frame, once the live view has seen one. */
  frameAspect?: number | null;
}

/**
 * `scan` favours speed (a sourcing lookup only needs enough detail to identify
 * the item); `listing` favours detail, because the photo goes on the listing.
 */
export type CaptureQuality = 'scan' | 'listing';

export interface GlassesPhoto {
  /** A local file the rest of the app can read like any camera photo. */
  uri: string;
  requestId: string;
}

/**
 * `double` is a quick second press. Brands that cannot report one (Mentra,
 * Raven) simply never send it; the on-screen demo button can.
 */
export type ButtonPress = 'short' | 'long' | 'double';

export type StreamState = 'idle' | 'starting' | 'live' | 'reconnecting' | 'stopping' | 'stopped' | 'error';

export interface StreamSnapshot {
  state: StreamState;
  /** Plain-English line for the seller; null when there is nothing to say. */
  message: string | null;
  bitrateKbps: number | null;
  durationSec: number | null;
}

export type GlassesEvent =
  | { type: 'status'; patch: Partial<GlassesSnapshot> }
  | { type: 'button'; press: ButtonPress }
  /** A finished phrase heard by the glasses mic. Not yet checked for the wake word. */
  | { type: 'speech'; text: string }
  | { type: 'stream'; stream: StreamSnapshot };

export type GlassesListener = (event: GlassesEvent) => void;
