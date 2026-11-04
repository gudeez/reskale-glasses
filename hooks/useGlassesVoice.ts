import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useGlassesStore } from '@/store/glassesStore';
import { createCommandListener, type VoiceCommand } from '@/lib/glasses/voice-commands';

/**
 * Run `handler` for each "Reskale, …" command heard by the glasses mic, only
 * while this screen is in front. Phrases without the wake word never reach it,
 * except the one straight after a bare "Reskale" (see createCommandListener).
 */
export function useGlassesVoice(handler: (command: VoiceCommand) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  const setSpeechHandler = useGlassesStore((s) => s.setSpeechHandler);
  const releaseSpeechHandler = useGlassesStore((s) => s.releaseSpeechHandler);

  useFocusEffect(
    useCallback(() => {
      const hear = createCommandListener((command) => latest.current(command));
      const mine = (text: string) => {
        if (__DEV__) console.log('[glasses] heard:', text);
        hear(text);
      };
      setSpeechHandler(mine);
      return () => releaseSpeechHandler(mine);
    }, [setSpeechHandler, releaseSpeechHandler]),
  );
}
