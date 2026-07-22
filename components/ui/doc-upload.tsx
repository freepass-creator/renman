'use client';
/**
 * 서류 업로드 공용 원자 — 파일 선택 → (선택)OCR → (선택)Storage 업로드 를 한 덩어리로.
 *
 * 왜 있나: 저수준 엔진(`lib/ocr-client`·`lib/storage`)은 이미 SSOT인데 **그 위 UI가 7벌**이었다.
 *   데이터센터만 FileDrop을 쓰고 나머지(과태료·InfoDoc·WorkForm·수집함…)는 각자 `<input type="file">`을
 *   손롤 → 드래그앤드롭 없음·진행표시 제각각·실패 문구 제각각. 화면마다 다른 업로드처럼 보이던 원인.
 *
 * 쓰는 쪽은 «무엇을 받을지»만 정한다:
 *   <DocUpload accept=".pdf,.jpg" ocrType="penalty" onExtract={...} />           // OCR만
 *   <DocUpload storeAt={{ company, entity:'contract', key }} onUploaded={...} /> // 업로드만
 *   둘 다 주면 OCR 후 업로드까지 한 번에.
 *
 * 이 원자는 «저장 로직»을 모른다 — 레코드 만들기·_docs 붙이기는 호출부(도메인)가 한다.
 * 여기서 하면 엔티티별 규칙이 UI에 스며든다.
 */
import React from 'react';
import FileDrop from '@/components/FileDrop';
import { callOcrExtract, type OcrOriginal } from '@/lib/ocr-client';
import { uploadDoc, docPath, storageReady } from '@/lib/storage';
import { Btn } from './controls';
import { Message } from './misc';
import { Loading } from '../Spinner';
import { C } from './tokens';

export type DocUploadResult = {
  file: File;
  /** OCR 원값 — ocrType 준 경우만. */
  raw?: Record<string, unknown>;
  /** 원본 스냅샷(감사추적) — 수기 교정해도 원본은 남는다. */
  ocrOriginal?: OcrOriginal;
  /** Storage URL — storeAt 준 경우만. 미설정/실패면 ''. */
  url?: string;
};

export function DocUpload({
  accept = '.pdf,.jpg,.jpeg,.png,.webp',
  hint,
  ocrType,
  storeAt,
  label = '올리기',
  autoRun = true,
  disabled,
  onDone,
  style,
}: {
  accept?: string;
  hint?: string;
  /** OCR 프로필(entities.ocrType). 없으면 OCR 건너뜀. */
  ocrType?: string;
  /** Storage 저장 위치. 없으면 업로드 안 하고 파일만 넘김. */
  storeAt?: { company: string; entity: string; key: string };
  label?: string;
  /** 파일 고르면 바로 실행(기본). false면 버튼을 눌러야 진행. */
  autoRun?: boolean;
  disabled?: boolean;
  onDone: (r: DocUploadResult) => void;
  style?: React.CSSProperties;
}) {
  const [file, setFile] = React.useState<File | null>(null);
  const [busy, setBusy] = React.useState('');
  const [err, setErr] = React.useState('');

  const run = React.useCallback(async (f: File) => {
    setErr('');
    const out: DocUploadResult = { file: f };
    if (ocrType) {
      setBusy('읽는 중…');
      try {
        const r = await callOcrExtract(f, ocrType);
        // OCR 실패는 «치명»이 아니다 — 수기 입력으로 이어갈 수 있어야 한다(키 미설정 포함).
        if (r.ok && r.raw) { out.raw = r.raw; out.ocrOriginal = r.ocrOriginal; }
        else setErr(r.error || '자동 인식 실패 — 값을 직접 채워 주세요');
      } catch (e) { setErr((e as Error).message || '자동 인식 실패 — 값을 직접 채워 주세요'); }
    }
    if (storeAt) {
      if (!storageReady()) {
        setErr('저장소(Storage) 미설정 — 파일은 첨부되지 않습니다');
        out.url = '';
      } else {
        setBusy('올리는 중…');
        out.url = (await uploadDoc(f, docPath(storeAt.company, storeAt.entity, storeAt.key, f.name)).catch(() => null)) || '';
        if (!out.url) setErr('업로드 실패 — 파일 없이 저장됩니다');
      }
    }
    setBusy('');
    onDone(out);
  }, [ocrType, storeAt, onDone]);

  const pick = (f: File) => { setFile(f); if (autoRun) void run(f); };

  return (
    <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', flexWrap: 'wrap', ...style }}>
      <FileDrop onFile={pick} file={file} accept={accept} hint={hint} />
      <div style={{ marginTop: 28, display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
        {!autoRun && <Btn variant="solid" onClick={() => file && run(file)} disabled={!file || !!busy || disabled}>{busy || label}</Btn>}
        {busy && <Loading label={busy} color={C.accent} />}
      </div>
      {err && <div style={{ width: '100%' }}><Message variant="warning">{err}</Message></div>}
    </div>
  );
}
