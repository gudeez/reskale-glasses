import { useEffect, useMemo, useRef, useState } from 'react';
import { PanResponder, Text, View, type LayoutChangeEvent } from 'react-native';
import { containRect, moveBox, resizeBox, type FocusBox } from '@/lib/focus-crop';
import { MIN_GLASSES_SIDE } from '@/lib/glasses/crop-box';
import { activeGlasses, useGlassesStore } from '@/store/glassesStore';

/** The glasses' native live-view component; absent in builds without the Meta SDK. */
let StreamView: React.ComponentType<{ isActive?: boolean; resizeMode?: 'contain'; style?: object }> | null = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  StreamView = require('@chrisgocode/expo-meta-wearables-dat').EMWDATStreamView;
} catch {
  StreamView = null;
}

/** Before the first frame, assume the glasses' portrait 3:4. */
const FALLBACK_ASPECT = 3 / 4;
const HANDLE = 28;

interface Props {
  /** Show the crop box over the live view. */
  showBox: boolean;
  box: FocusBox;
  onBoxChange: (box: FocusBox) => void;
  /** True while a finger is on the box; false when it lifts (the time to save it). */
  onDragging?: (dragging: boolean) => void;
}

/**
 * What the glasses camera sees, live on the phone, with an optional box to aim
 * with. The glasses see far wider than the wearer is looking, so without this
 * the item is easy to miss; with the box on, scans are cropped to it.
 *
 * Fills its parent, as the phone camera fills the Scan tab; the video is
 * letterboxed inside it and the box is drawn over the video alone.
 */
export function GlassesViewfinder({ showBox, box, onBoxChange, onDragging }: Props) {
  const connected = useGlassesStore((s) => s.connection === 'connected');
  const aspect = useGlassesStore((s) => s.frameAspect) ?? FALLBACK_ASPECT;
  const [failed, setFailed] = useState<string | null>(null);
  const [size, setSize] = useState({ width: 0, height: 0 });

  // The camera stays on while this is shown; it goes back to stopping when idle after.
  useEffect(() => {
    if (!connected) return;
    const glasses = activeGlasses();
    if (!glasses.startPreview) return;
    setFailed(null);
    glasses.startPreview().catch((err: unknown) => {
      setFailed(err instanceof Error && err.message ? err.message : 'Couldn’t start the live view.');
    });
    return () => glasses.stopPreview?.();
  }, [connected]);

  // Panning works in fractions of the view, so the latest box and size are read through refs.
  // Where the video actually lands in the view (letterboxed when the view is capped).
  const video = containRect(size, { width: aspect, height: 1 });
  const latest = useRef({ box, video, onBoxChange, onDragging });
  latest.current = { box, video, onBoxChange, onDragging };

  const drag = (apply: (b: FocusBox, dx: number, dy: number) => FocusBox) => {
    let start = box;
    return PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onPanResponderTerminationRequest: () => false,
      onPanResponderGrant: () => {
        start = latest.current.box;
        latest.current.onDragging?.(true);
      },
      onPanResponderMove: (_e, g) => {
        const { width, height } = latest.current.video;
        if (!width || !height) return;
        latest.current.onBoxChange(apply(start, g.dx / width, g.dy / height));
      },
      onPanResponderRelease: () => latest.current.onDragging?.(false),
      onPanResponderTerminate: () => latest.current.onDragging?.(false),
    });
  };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const mover = useMemo(() => drag(moveBox), []);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  const resizer = useMemo(() => drag((b, dx, dy) => resizeBox(b, 'br', dx, dy, MIN_GLASSES_SIDE)), []);

  const onLayout = (e: LayoutChangeEvent) => setSize(e.nativeEvent.layout);

  if (!StreamView) return null;

  return (
    <View
      onLayout={onLayout}
      className="bg-black"
      style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }}
      accessibilityLabel="Live view from your glasses"
    >
      {connected && !failed && (
        <StreamView isActive resizeMode="contain" style={{ position: 'absolute', top: 0, left: 0, right: 0, bottom: 0 }} />
      )}
      {connected && failed && (
        <View className="flex-1 items-center justify-center p-8">
          <Text className="text-muted text-sm text-center">{failed}</Text>
        </View>
      )}
      {showBox && connected && video.width > 0 && (
        <View
          {...mover.panHandlers}
          style={{
            position: 'absolute',
            left: video.x + box.x * video.width,
            top: video.y + box.y * video.height,
            width: box.w * video.width,
            height: box.h * video.height,
            borderWidth: 2,
            borderColor: '#0ea5e9',
            borderRadius: 6,
          }}
          accessibilityLabel="Scan box. Drag to move it."
        >
          <View
            {...resizer.panHandlers}
            style={{
              position: 'absolute',
              right: -HANDLE / 2,
              bottom: -HANDLE / 2,
              width: HANDLE,
              height: HANDLE,
              borderRadius: HANDLE / 2,
              backgroundColor: '#0ea5e9',
              borderWidth: 2,
              borderColor: 'white',
            }}
            accessibilityLabel="Drag to resize the scan box"
          />
        </View>
      )}
    </View>
  );
}
