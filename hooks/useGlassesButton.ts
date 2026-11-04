import { useCallback, useRef } from 'react';
import { useFocusEffect } from 'expo-router';
import { useGlassesStore } from '@/store/glassesStore';
import type { ButtonPress } from '@/lib/glasses/types';

/**
 * Run `handler` when the glasses' button is pressed — only while this screen
 * is the one in front. The latest handler is always used, so it can read fresh
 * state without re-registering.
 */
export function useGlassesButton(handler: (press: ButtonPress) => void): void {
  const latest = useRef(handler);
  latest.current = handler;
  const setButtonHandler = useGlassesStore((s) => s.setButtonHandler);
  const releaseButtonHandler = useGlassesStore((s) => s.releaseButtonHandler);

  useFocusEffect(
    useCallback(() => {
      const mine = (press: ButtonPress) => latest.current(press);
      setButtonHandler(mine);
      // The next screen may focus before this one blurs; only clear our own handler.
      return () => releaseButtonHandler(mine);
    }, [setButtonHandler, releaseButtonHandler]),
  );
}
