// From the Reskale app: first written 2026-03-20, last changed 2026-10-07 (before this repo); changed here on 2026-11-04 for the hackathon. See HACKATHON.md.
import { Platform } from 'react-native';
import Constants from 'expo-constants';

function getApiBaseUrl(): string {
  if (Platform.OS !== 'web') {
    // 1. Explicit env var (set in .env)
    const configured = process.env.EXPO_PUBLIC_API_URL;
    if (configured) return configured;
    // 2. Dev server: Metro serves the API routes next to the bundle, so keep
    // its port.
    const hostUri = Constants.expoConfig?.hostUri;
    if (hostUri) return `http://${hostUri.includes(':') ? hostUri : `${hostUri}:8081`}`;
  }
  return '';
}

export const API_BASE_URL = getApiBaseUrl();
