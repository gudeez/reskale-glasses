// Pre-existing (Reskale), trimmed for this repo: the glasses screens' stack.
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { useGlassesStore } from '@/store/glassesStore';

export default function GlassesLayout() {
  const init = useGlassesStore((s) => s.init);

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: '#000000' },
        headerTintColor: '#fff',
        headerTitleStyle: { fontWeight: '700' },
        contentStyle: { backgroundColor: '#000000' },
      }}
    >
      <Stack.Screen name="index" options={{ title: 'Smart glasses' }} />
    </Stack>
  );
}
