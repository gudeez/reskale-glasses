import { defineConfig } from 'vitest/config';
import path from 'node:path';

// .mts so it is always loaded as ESM regardless of package.json "type": "commonjs".
// Vitest runs the pure-logic units (no React Native / Expo runtime needed); the
// '@' alias mirrors tsconfig so imports like '@/lib/automotive/types' resolve.
export default defineConfig({
  test: {
    environment: 'node',
    include: ['lib/**/*.test.ts'],
  },
  resolve: {
    alias: { '@': path.resolve(import.meta.dirname, '.') },
  },
});
