// Pre-existing (Reskale), trimmed for this repo: connect Meta glasses.
import { View, Text, ScrollView, TouchableOpacity, ActivityIndicator, Alert } from 'react-native';
import { router } from 'expo-router';
import { Chevron, Row, Section } from '@/components/ui/SettingsList';
import { ensureGlassesPermissions } from '@/lib/glasses/permissions';
import { useGlassesStore } from '@/store/glassesStore';

const STATUS_COPY = {
  unavailable: 'Not available on this device',
  disconnected: 'Not connected',
  scanning: 'Looking for glasses…',
  connecting: 'Connecting…',
  connected: 'Connected',
} as const;

const HELP =
  'Works with Ray-Ban Meta and Oakley Meta glasses through the Meta AI app. The first time, Connect to Meta AI opens the Meta AI app so you can let Reskale use your glasses. If Meta AI says it can’t open the link, turn Developer Mode off and on in Meta AI (Settings → App info) and try again. Wear your glasses while you connect and scan: Meta glasses only work while they’re on your face. Keep Reskale open on your phone.';

export default function GlassesHubScreen() {
  const g = useGlassesStore();
  const connected = g.connection === 'connected';
  const busy = g.connection === 'scanning' || g.connection === 'connecting';
  const mock = g.kind === 'meta-mock';

  /** Finding and reconnecting need Bluetooth permission, which can be revoked at any time. */
  async function withPermission(work: () => Promise<void>) {
    try {
      await ensureGlassesPermissions();
    } catch (err) {
      Alert.alert('Permission needed', err instanceof Error ? err.message : 'Allow Nearby devices and try again.');
      return;
    }
    await work();
  }

  function confirmForget() {
    Alert.alert('Forget these glasses?', 'You’ll need to connect them again to use them with Reskale.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Forget', style: 'destructive', onPress: () => void g.forget() },
    ]);
  }

  return (
    <ScrollView className="flex-1 bg-surface-0" contentContainerStyle={{ padding: 16 }}>
      <Section title={mock ? 'Test Meta glasses' : 'Meta glasses'}>
        <Row
          label={g.deviceName ?? g.saved?.device.name ?? 'Your glasses'}
          right={
            <View className="flex-row items-center gap-2">
              {busy && <ActivityIndicator size="small" color="#0ea5e9" />}
              <Text className={connected ? 'text-success text-sm' : 'text-muted text-sm'}>{STATUS_COPY[g.connection]}</Text>
            </View>
          }
        />
        {connected && (
          <Row
            label="Battery"
            right={
              <Text className="text-muted text-sm">
                {g.batteryPercent === null ? '—' : `${g.batteryPercent}%${g.charging ? ' · charging' : ''}`}
              </Text>
            }
          />
        )}
      </Section>

      {g.error && (
        <TouchableOpacity onPress={g.clearError} className="bg-danger/15 rounded-xl p-3 mb-4">
          <Text className="text-danger text-sm">{g.error}</Text>
        </TouchableOpacity>
      )}

      {!connected && (
        <Section title="Connect">
          {g.saved && g.saved.kind === g.kind && (
            <Row label={`Reconnect ${g.saved.device.name}`} right={<Chevron />} onPress={() => void withPermission(g.reconnect)} />
          )}
          <Row
            label={busy ? 'Searching…' : mock ? 'Find test glasses' : 'Connect to Meta AI'}
            right={<Chevron />}
            onPress={busy ? undefined : () => void withPermission(g.scan)}
          />
          {g.found.map((device) => (
            <Row key={device.id} label={device.name} right={<Text className="text-brand-400">Connect</Text>} onPress={() => void g.connect(device)} />
          ))}
        </Section>
      )}

      {connected && (
        <Section title="Use your glasses">
          <Row label="Source — scan items, get buy or pass" right={<Chevron />} onPress={() => router.back()} />
        </Section>
      )}

      <Text className="text-muted text-xs mb-6 px-1">{mock ? 'Test glasses: your phone’s back camera stands in for the glasses camera.' : HELP}</Text>

      {(connected || g.saved) && (
        <Section title="Manage">
          {connected && <Row label="Disconnect" onPress={() => void g.disconnect()} />}
          {g.saved && <Row label="Forget these glasses" danger onPress={confirmForget} />}
        </Section>
      )}

      {__DEV__ && (
        <Section title="Developer">
          <Row
            label={mock ? 'Use real Meta glasses' : 'Use test glasses (phone camera)'}
            right={<Chevron />}
            onPress={() => void g.switchTransport(mock ? 'meta' : 'meta-mock')}
          />
        </Section>
      )}
    </ScrollView>
  );
}
