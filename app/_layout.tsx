// Hackathon (Nov 4 2026): the app's root. One stack: Scan, and the glasses connect screens.
import '../global.css';
import { useEffect } from 'react';
import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { useGlassesVoiceLaunch } from '@/hooks/useGlassesVoiceLaunch';
import { useGlassesStore } from '@/store/glassesStore';

export default function RootLayout() {
  const init = useGlassesStore((s) => s.init);
  useGlassesVoiceLaunch();

  useEffect(() => {
    void init();
  }, [init]);

  return (
    <GestureHandlerRootView style={{ flex: 1, backgroundColor: '#000000' }}>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: '#000000' } }}>
        <Stack.Screen name="index" />
        <Stack.Screen name="glasses" />
      </Stack>
    </GestureHandlerRootView>
  );
}
