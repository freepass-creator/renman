import { defineConfig } from 'vitest/config';

// 순수 도메인 로직 테스트(미수·상태). @/* alias는 vite 네이티브 tsconfigPaths로 해소.
export default defineConfig({
  resolve: { tsconfigPaths: true },
  /* tsconfig 는 Next 규약상 jsx: 'preserve' 라서 vite 가 .tsx 를 못 읽는다.
     열 카탈로그(*-cols.tsx)를 규격 테스트에서 직접 import 하려면 여기서 JSX 변환을 켜야 한다.
     React 를 import 하지 않는 파일도 있어 automatic 런타임을 쓴다. */
  oxc: { jsx: 'automatic' },
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // Rules 테스트는 Firestore 에뮬레이터 필요 → 기본 실행 제외. `npm run test:rules`로만.
    exclude: ['tests/rules/**', 'node_modules/**'],
  },
});
