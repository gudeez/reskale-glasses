// From the Reskale app: first written 2026-10-23, last changed 2026-11-02 (before this repo). See HACKATHON.md.
import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useGlassesStore } from '@/store/glassesStore';

/**
 * The strip at the top of each glasses screen: connected or not, battery, and
 * — for test glasses — the on-screen stand-in for the glasses' button.
 */
export function GlassesStatusBar({ buttonLabel }: { buttonLabel: string }) {
  const connection = useGlassesStore((s) => s.connection);
  const battery = useGlassesStore((s) => s.batteryPercent);
  const kind = useGlassesStore((s) => s.kind);
  const hasTestButton = useGlassesStore((s) => s.hasTestButton);
  const pressDemoButton = useGlassesStore((s) => s.pressDemoButton);
  const connected = connection === 'connected';

  if (!connected) {
    return (
      <TouchableOpacity
        onPress={() => router.push('/glasses' as any)}
        className="bg-warning/15 rounded-xl px-4 py-3 mb-4"
      >
        <Text className="text-warning text-sm">Your glasses aren’t connected. Tap to connect them.</Text>
      </TouchableOpacity>
    );
  }

  return (
    <View className="flex-row items-center justify-between bg-surface-2 rounded-xl px-4 py-3 mb-4">
      <Text className="text-success text-sm">
        {kind === 'demo' ? 'Demo glasses' : kind === 'meta-mock' ? 'Test glasses' : 'Glasses connected'}
        {battery !== null ? ` · ${battery}%` : ''}
      </Text>
      {hasTestButton ? (
        <TouchableOpacity
          onPress={() => pressDemoButton('short')}
          onLongPress={() => pressDemoButton('long')}
          className="bg-surface-3 rounded-lg px-3 py-1.5"
        >
          <Text className="text-white text-xs">Press glasses button</Text>
        </TouchableOpacity>
      ) : (
        <Text className="text-muted text-xs">{buttonLabel}</Text>
      )}
    </View>
  );
}
