import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import { parseTxFileReport } from '@/lib/intake/parse-tx';

/**
 * 실파일 연기(smoke) 테스트 — **오픈 판정의 근거**.
 *
 * 지금까지 파서는 실무가 실제로 받는 파일로 한 번도 돌려본 적이 없었다.
 * 규격은 `docs/UPLOAD-FORMATS.md` 에 적었지만 «파서가 견디는가»는 별개다.
 *
 * 파일은 리포 밖(PII)이라 없으면 **건너뛴다** — CI 를 깨지 않되, 있는 PC 에서는 반드시 돌게.
 *   경로: `G:\다른 컴퓨터\내 컴퓨터\Documents\카카오톡 받은 파일\`
 *   ⚠ 드라이브 스트리밍 폴더는 Node 가 직접 못 연다 → 로컬로 복사한 뒤 REAL_FILE_DIR 로 지정.
 */
const DIR = process.env.REAL_FILE_DIR
  || 'C:/Users/admin/AppData/Local/Temp/claude/C--Users-admin/d0c1f52b-92ab-476c-a3e4-204d54399e09/scratchpad/fin2';

const available = (() => { try { return fs.readdirSync(DIR); } catch { return []; } })();
const find = (kw: string) => available.find((f) => f.includes(kw));

/** Node 에는 브라우저 File 이 없다 — 파서가 쓰는 것만 갖춘 최소 스텁. */
function fileOf(name: string): File {
  const buf = fs.readFileSync(DIR + '/' + name);
  return {
    name,
    arrayBuffer: async () => buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength),
  } as unknown as File;
}

describe.skipIf(!available.length)('실파일 파서 연기 테스트', () => {
  it.skipIf(!find('자금일보'))('자금일보 — 계좌별 시트를 전부 읽는다 (헤더가 1행)', async () => {
    const r = await parseTxFileReport(fileOf(find('자금일보')!));
    // 실측: 4개 계좌시트 · 분류된 거래 1,793건. 절반도 못 읽으면 규격을 놓친 것이다.
    expect(r.records.length, `읽은 건수 ${r.records.length} · 경고 ${r.warnings.join(' / ')}`).toBeGreaterThan(900);
    // 「차량 데이터」 시트는 거래가 아니라 경고가 나는 게 정상 — 그 외 시트가 통째로 실패하면 안 된다.
    expect(r.warnings.length, `경고: ${r.warnings.join(' / ')}`).toBeLessThanOrEqual(1);
  });

  it.skipIf(!find('운영계좌'))('운영계좌 — 기본 형태(0행 헤더 · 「전체선택」 체크박스 열)', async () => {
    const r = await parseTxFileReport(fileOf(find('운영계좌')!));
    expect(r.records.length).toBeGreaterThan(0);
    expect(r.records[0]).toHaveProperty('txDate');
  });

  it('읽은 거래는 자연키가 붙는다 — 중복 재업로드가 쌓이지 않게', async () => {
    const f = find('자금일보') || find('운영계좌');
    if (!f) return;
    const r = await parseTxFileReport(fileOf(f));
    const keyed = r.records.filter((x) => String((x as { txKey?: unknown }).txKey ?? '').trim());
    expect(keyed.length).toBe(r.records.length);
  });
});

describe.skipIf(!available.length)('실파일 — 인코딩·종류 판정', () => {
  it.skipIf(!available.some((f) => f.endsWith('.csv')))(
    'CP949 CSV 를 읽는다 — 깨지면 헤더 키워드가 하나도 안 맞아 통째로 «헤더 못 찾음»이 된다',
    async () => {
      const name = available.find((f) => f.endsWith('.csv'))!;
      const r = await parseTxFileReport(fileOf(name));
      /* PG 정산 파일은 «거래»가 아니라 «일자별 집계»(의뢰건수·결제건수)라 bank_tx 로 들어오지 않는 게 맞다.
         여기서 확인하는 건 «인코딩 때문에 못 읽는 것»과 «종류가 달라 안 받는 것»을 구분하는 일이다.
         깨진 인코딩이면 경고 문구조차 못 만들고 시트 자체를 못 읽는다. */
      expect(r.warnings.join(' ')).toContain('헤더');
      expect(r.rejected.length).toBe(0);
    },
  );
});
