'use client';
/** 모바일 단건 입력 — 사진·메모 한 건만. 데이터센터·OCR·대량 투입은 웹 전용. */
import { useState } from 'react';
import { C, Message } from '@/components/ui';
import { MHead } from '@/components/m/MHead';
import { QuickInput } from '@/components/QuickInput';

export default function MEntry() {
  const [formKey, setFormKey] = useState(0);
  const reset = () => setFormKey((key) => key + 1);
  return (
    <>
      <MHead title="단건 입력" sub="현장 메모 · 사진 · 문서 한 건" color="var(--indigo-text)" />
      <div style={{ padding: '12px 14px 24px', display: 'flex', flexDirection: 'column', gap: 10 }}>
        <QuickInput key={formKey} onDone={reset} onCancel={reset} />
        <Message variant="info">
          차량을 고르면 해당 차량 이력에, 고르지 않으면 미분류 대기함에 저장됩니다. 엑셀·여러 문서·OCR 등록은 웹 데이터센터에서 처리합니다.
        </Message>
        <div style={{ fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
          저장한 건은 웹에서 분류·대상 연결·담당 배정을 이어서 완료할 수 있습니다.
        </div>
      </div>
    </>
  );
}
