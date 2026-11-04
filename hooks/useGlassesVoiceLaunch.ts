import { useEffect } from 'react';
import { Platform } from 'react-native';
import { router } from 'expo-router';
import { GLASSES_META_ENABLED } from '@/lib/feature-flags';
import { useGlassesStore } from '@/store/glassesStore';

type MetaModule = typeof import('@chrisgocode/expo-meta-wearables-dat');

const READY = 'Reskale is opening. Press your glasses button, or say Reskale, scan.';

/**
 * "Hey Meta, start Reskale": Meta AI opens the app and hands it a voice
 * request. Answer it once, connect the saved glasses, and open Scan on them.
 *
 * Voice invocation is an experimental Meta capability: it needs approval and
 * the spoken name set in Wearables Developer Center, and Meta won't publish a
 * store app that uses it. Without that setup this does nothing.
 */
export function useGlassesVoiceLaunch(): void {
  useEffect(() => {
    if (!GLASSES_META_ENABLED || Platform.OS === 'web') return;
    let Meta: MetaModule;
    try {
      // eslint-disable-next-line @typescript-eslint/no-require-imports
      Meta = require('@chrisgocode/expo-meta-wearables-dat');
    } catch {
      return; // a build without the Meta SDK
    }

    const answered = new Set<string>();
    const open = async (invocationId: string) => {
      if (answered.has(invocationId)) return;
      answered.add(invocationId);
      // Answer at once: Meta AI waits on it, and connecting can take a while.
      await Meta.respondToVoiceInvocation(invocationId, true, READY).catch((err: unknown) =>
        console.warn('[glasses] voice launch answer failed:', err),
      );
      router.navigate('/');
      const glasses = useGlassesStore.getState();
      if (glasses.connection !== 'connected' && glasses.saved) await glasses.reconnect().catch(() => undefined);
    };

    const subscription = Meta.addListener('onVoiceInvocation', (invocation) => void open(invocation.invocationId));
    const failed = Meta.addListener('onVoiceInvocationError', ({ message }) =>
      console.warn('[glasses] voice launch unavailable:', message),
    );

    void (async () => {
      const store = useGlassesStore.getState();
      await store.init();
      const saved = useGlassesStore.getState().saved;
      if (saved?.kind !== 'meta') return;
      // Listen before starting, and pick up a request that launched the app cold.
      await Meta.startVoiceInvocations(saved.device.id).catch((err: unknown) =>
        console.warn('[glasses] voice launch unavailable:', err),
      );
      const pending = await Meta.getPendingVoiceInvocations().catch(() => []);
      for (const invocation of pending) await open(invocation.invocationId);
    })();

    return () => {
      subscription?.remove();
      failed?.remove();
      void Meta.stopVoiceInvocations().catch(() => undefined);
    };
  }, []);
}
