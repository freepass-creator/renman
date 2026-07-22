import { defineConfig } from 'vitest/config';

// 순수 도메인 로직 테스트(미수·상태). @/* alias는 vite 네이티브 tsconfigPaths로 해소.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
  },
});
