import { defineConfig } from 'vitest/config';

// 순수 도메인 로직 테스트(미수·상태). @/* alias는 vite 네이티브 tsconfigPaths로 해소.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Rules 테스트는 Firestore 에뮬레이터 필요 → 기본 실행 제외. `npm run test:rules`로만.
    exclude: ['tests/rules/**', 'node_modules/**'],
  },
});
