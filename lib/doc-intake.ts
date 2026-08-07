/**
 * 문서 투입 공통 규격 — 「원장 생성 패널에 문서를 올리면 그 자리에서 OCR·매칭·저장」.
 *
 * ## 왜 있나
 *   과태료(고지서)·계약(계약서)·차량(등록증)이 하는 일이 똑같다:
 *     파일 → OCR → 엔티티매핑 → 다른 원장과 대조 → 못 읽은 칸 수기보완 → 저장.
 *   패널을 원장마다 복사하면 250줄짜리가 계속 늘고, 「미완 건은 폐기 금지」·
 *   「실패도 수기로 채우면 done 으로 올린다」 같은 규칙이 한쪽만 고쳐진다.
 *   화면은 하나(components/ui/doc-intake-panel), **원장은 «규격(spec)»만 준다.**
 *
 * ## 원장이 정하는 것
 *   무슨 문서를 읽는지(ocrType) · 무엇이 있어야 저장되는지(missing) ·
 *   어떤 원장과 대조하는지(refEntities·derive) · 저장 레코드를 어떻게 만드는지(build).
 *   ★도메인 판단은 전부 각 원장의 *-intake 모듈에 남는다. 여기엔 «흐름»만 있다.
 */
import type { EntityRecord } from '@/lib/intake/entities';
import type { CrosscheckResult } from '@/lib/ocr-crosscheck';
import { ocrBatch, mapOcrToEntity } from '@/lib/ocr-client';

export type DocIntakeStatus = 'pending' | 'done' | 'failed';

export type DocIntakeRow = {
  id: string;
  fileName: string;
  file: File;
  status: DocIntakeStatus;
  rec: EntityRecord;
  ocrOriginal?: unknown;
  crosscheck?: CrosscheckResult;
  error?: string;
};

export type DocIntakeBadge = { t: string; tone: 'gray' | 'green' | 'amber' | 'red' };

/** 대조 결과 — 저장을 막는 것은 `dup` 하나뿐. 나머지는 «알리되 막지 않는다». */
export type DocIntakeVerdict = {
  dup: boolean;
  badges: DocIntakeBadge[];
};

export type DocIntakeManualField = {
  key: string;
  label: string;
  type?: 'text' | 'date';
  placeholder?: string;
};

export type DocIntakeSpec = {
  /** 저장 대상 엔티티 key. */
  entityKey: string;
  /** OCR 종류 — 엔티티의 `ocrType`. ★엔티티 key 와 다를 수 있다(contract → rental_contract). */
  ocrType: string;
  /** 한 번에 분석할 최대 파일 수. */
  max: number;
  /** FileDrop 안내문. */
  hint: string;
  /** 대조용으로 미리 읽어 둘 다른 원장들. `derive` 가 같은 순서로 받는다. */
  refEntities: string[];
  /** 아직 못 채운 필수 항목 이름. 빈 배열이면 저장 가능. */
  missing: (rec: EntityRecord) => string[];
  /** 다른 원장과 대조한 판정(중복·경고 배지). */
  derive: (rec: EntityRecord, refs: EntityRecord[][]) => DocIntakeVerdict;
  /** 못 읽었을 때 그 줄에서 채우는 칸. */
  manual: DocIntakeManualField[];
  /** 행 오른쪽 요약(한 줄). */
  summary: (rec: EntityRecord) => string;
  /** 저장 레코드 생성 — 파일 업로드·기본값 채우기 포함. */
  build: (rows: DocIntakeRow[], companyId: string, refs: EntityRecord[][]) => Promise<EntityRecord[]>;
  /** 저장 실행. */
  save: (companyId: string, records: EntityRecord[]) => Promise<number>;
  savedToast: (count: number, companyId: string) => string;
  /** 등록 버튼 문구. */
  saveLabel: (count: number) => string;
  /** 미완 건 안내문. */
  incompleteNote: (count: number) => string;
};

export function makeDocIntakeRows(files: File[], prefix: string, stamp = Date.now()): DocIntakeRow[] {
  return files.map((f, i) => ({
    id: `${prefix}-${stamp}-${i}`,
    fileName: f.name,
    file: f,
    status: 'pending' as const,
    rec: {},
  }));
}

/** OCR 배치 실행 후 행 상태 갱신. 실패해도 행을 버리지 않는다(수기 보완 대상). */
export async function ocrDocFiles(
  spec: Pick<DocIntakeSpec, 'entityKey' | 'ocrType'>,
  files: File[],
  baseRows: DocIntakeRow[],
): Promise<DocIntakeRow[]> {
  const results = await ocrBatch(files, spec.ocrType);
  return baseRows.map((row, i) => {
    const res = results[i];
    if (res?.ok && res.raw) {
      return {
        ...row,
        status: 'done' as const,
        rec: mapOcrToEntity(spec.entityKey, res.raw),
        ocrOriginal: res.ocrOriginal,
        crosscheck: res.crosscheck,
      };
    }
    return { ...row, status: 'failed' as const, error: res?.error };
  });
}

export function isDocIntakeReady(spec: Pick<DocIntakeSpec, 'missing'>, row: DocIntakeRow): boolean {
  return spec.missing(row.rec).length === 0;
}
