import { defineConfig } from 'vitest/config';

// Firestore Rules 전용 — 에뮬레이터(FIRESTORE_EMULATOR_HOST) 위에서만 의미. `npm run test:rules` 경유.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/rules/**/*.test.ts'],
    testTimeout: 20000, // 에뮬레이터 왕복 여유
    fileParallelism: false,
  },
});
