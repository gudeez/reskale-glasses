import { View, Text, TouchableOpacity } from 'react-native';
import { router } from 'expo-router';
import { useGlassesStore } from '@/store/glassesStore';

function Pill({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  return (
    <TouchableOpacity
      onPress={onPress}
      className={`px-3 py-1.5 rounded-full ${on ? 'bg-brand-500' : 'bg-black/50'}`}
      accessibilityRole="switch"
      accessibilityState={{ checked: on }}
      accessibilityLabel={label}
    >
      <Text className="text-white text-xs font-semibold">{label}</Text>
    </TouchableOpacity>
  );
}

/** Glasses mode's switches, under the Scan tab's header: what the phone shows, and whether results are spoken. */
export function GlassesToggles({
  liveView,
  onLiveView,
  boxOn,
  onBox,
  speak,
  onSpeak,
}: {
  liveView: boolean;
  onLiveView: (on: boolean) => void;
  boxOn: boolean;
  onBox: (on: boolean) => void;
  speak: boolean;
  onSpeak: (on: boolean) => void;
}) {
  const battery = useGlassesStore((s) => s.batteryPercent);
  return (
    <View className="flex-row flex-wrap items-center gap-2 mt-2">
      <Pill label="Live view" on={liveView} onPress={() => onLiveView(!liveView)} />
      {liveView && <Pill label="Scan box" on={boxOn} onPress={() => onBox(!boxOn)} />}
      <Pill label={speak ? '🔊 Speak' : '🔇 Speak'} on={speak} onPress={() => onSpeak(!speak)} />
      {battery != null && (
        <Text className="text-white/80 text-xs bg-black/50 px-2.5 py-1.5 rounded-full">🔋 {battery}%</Text>
      )}
    </View>
  );
}

/** In place of the camera while the glasses aren't connected. */
export function GlassesConnectPrompt() {
  const connection = useGlassesStore((s) => s.connection);
  const connecting = connection === 'connecting';
  return (
    <TouchableOpacity
      onPress={() => router.push('/glasses')}
      className="bg-black/70 rounded-2xl px-5 py-4 mx-6 items-center"
      accessibilityRole="button"
    >
      <Text className="text-3xl mb-1">🕶️</Text>
      <Text className="text-white font-bold text-base">{connecting ? 'Connecting to your glasses…' : 'Connect your glasses'}</Text>
      <Text className="text-white/70 text-sm text-center mt-1">
        {connecting ? 'Keep them on and close by.' : 'Tap to open Smart glasses and pair them, then come back here.'}
      </Text>
    </TouchableOpacity>
  );
}
