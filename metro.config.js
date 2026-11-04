// Hackathon (Nov 4 2026): written for this repo; the Reskale app's Metro config without Sentry.
const { getDefaultConfig } = require('expo/metro-config');
const { withNativeWind } = require('nativewind/metro');

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' });
