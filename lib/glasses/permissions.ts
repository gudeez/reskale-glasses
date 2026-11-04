// From the Reskale app: first written 2026-10-23, last changed 2026-10-23 (before this repo). See HACKATHON.md.
import { PermissionsAndroid, Platform, type Permission } from 'react-native';

/**
 * Ask for what finding and connecting to glasses needs.
 *
 * iOS asks for Bluetooth itself the first time the SDK scans. Android 12+
 * needs Nearby devices (scan + connect) granted up front, and some Android
 * phones only report Bluetooth scan results when location is allowed too.
 */
export async function ensureGlassesPermissions(): Promise<void> {
  if (Platform.OS !== 'android') return;

  const { BLUETOOTH_SCAN, BLUETOOTH_CONNECT, ACCESS_FINE_LOCATION } = PermissionsAndroid.PERMISSIONS;
  const modern = Number(Platform.Version) >= 31;
  // Location is asked for alongside on Android 12+ but isn't required there:
  // a seller who declines it can still connect on most phones.
  const required: Permission[] = modern ? [BLUETOOTH_SCAN, BLUETOOTH_CONNECT] : [ACCESS_FINE_LOCATION];
  const asked: Permission[] = modern ? [...required, ACCESS_FINE_LOCATION] : required;

  const result = await PermissionsAndroid.requestMultiple(asked);
  if (required.some((p) => result[p] !== PermissionsAndroid.RESULTS.GRANTED)) {
    throw new Error(
      'Reskale needs "Nearby devices" to find your glasses. Allow it in your phone’s Settings → Apps → Reskale → Permissions.',
    );
  }
}
