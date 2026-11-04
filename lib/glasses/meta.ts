// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
import type { GlassesTransport } from './transport';

/** Web build: Meta glasses need the phone app (see meta.native.ts). */

const NEEDS_APP = 'Smart glasses work in the Reskale phone app, not in a browser.';

export function createMetaTransport({ mock }: { mock: boolean }): GlassesTransport {
  const refuse = () => Promise.reject(new Error(NEEDS_APP));
  return {
    kind: mock ? 'meta-mock' : 'meta',
    features: { livestream: false, wifi: false },
    isAvailable: () => false,
    snapshot: async () => ({
      connection: 'unavailable',
      deviceName: null,
      batteryPercent: null,
      charging: false,
      wifiSsid: null,
    }),
    scan: refuse,
    connect: refuse,
    reconnect: refuse,
    disconnect: async () => undefined,
    forget: async () => undefined,
    capturePhoto: refuse,
    startStream: refuse,
    stopStream: refuse,
    scanWifi: refuse,
    joinWifi: refuse,
    subscribe: () => () => undefined,
  };
}
