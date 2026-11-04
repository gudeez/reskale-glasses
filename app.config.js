// Hackathon (Nov 4 2026): written for this repo, in place of the Reskale app's app.json and app.config.js.
// Reskale Glasses: a hands-free sourcing agent for Meta Ray-Ban glasses.
//
// The identity (package, scheme, version, Meta DAT options) matches the
// "Reskale Glasses" development build, so the build already registered with
// Meta AI on the test phone runs this repo straight from Metro. No native
// rebuild was needed for the hackathon.

const DAT_BLUETOOTH =
  'Reskale connects to your smart glasses over Bluetooth so you can scan items hands-free.';

module.exports = () => ({
  name: 'Reskale Glasses',
  slug: 'reseller-hub',
  version: '1.3.0',
  orientation: 'portrait',
  userInterfaceStyle: 'dark',
  scheme: 'reskale',
  runtimeVersion: { policy: 'appVersion' },
  experiments: { typedRoutes: true },
  web: { bundler: 'metro', output: 'server' },
  android: {
    package: 'com.reskale.app.glasses',
    permissions: [
      'android.permission.CAMERA',
      'android.permission.BLUETOOTH_SCAN',
      'android.permission.BLUETOOTH_CONNECT',
    ],
  },
  ios: {
    bundleIdentifier: 'com.reskale.app.glasses',
    infoPlist: {
      NSCameraUsageDescription: 'Reskale uses your camera to identify items.',
      NSMicrophoneUsageDescription: 'Reskale uses your microphone for voice commands.',
      NSSpeechRecognitionUsageDescription: 'Allow Reskale to use speech recognition for voice commands.',
      NSBluetoothAlwaysUsageDescription: DAT_BLUETOOTH,
      ITSAppUsesNonExemptEncryption: false,
    },
  },
  plugins: [
    'expo-router',
    ['expo-camera', { cameraPermission: 'Allow Reskale to access your camera to identify items.' }],
    'expo-secure-store',
    'expo-speech-recognition',
    [
      'expo-build-properties',
      {
        android: {
          minSdkVersion: 31,
          packagingOptions: {
            pickFirst: ['**/libc++_shared.so', '**/libonnxruntime.so', '**/libonnxruntime4j_jni.so'],
          },
        },
      },
    ],
    [
      '@chrisgocode/expo-meta-wearables-dat',
      {
        urlScheme: 'reskale-meta',
        bluetoothUsageDescription: DAT_BLUETOOTH,
        clientToken: '0',
        crashReportingOptOut: true,
      },
    ],
    './plugins/withLinkingAfterSubscribers',
    './plugins/withSingleProtobufRuntime',
  ],
});
