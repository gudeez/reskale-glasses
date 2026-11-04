/** @type {import('tailwindcss').Config} */
// Colors and the text scale live in constants/theme.js — the one place
// they're written down (ENG-259). Add a color there, never here.
const { palette, fontSize } = require('./constants/theme');

module.exports = {
  // lib/ too: helpers there hand back class names (lib/trend.ts → text-up),
  // and a class Tailwind never sees in these files is never generated.
  content: [
    './app/**/*.{js,jsx,ts,tsx}',
    './components/**/*.{js,jsx,ts,tsx}',
    './lib/**/*.{js,jsx,ts,tsx}',
  ],
  presets: [require('nativewind/preset')],
  theme: {
    extend: {
      colors: palette,
      fontSize,
      fontFamily: {
        sans: ['System'],
      },
    },
  },
  plugins: [],
};
