'use client';
/** 모바일 업무 생성 — 웹과 같은 폼·저장 규칙, 파일/OCR 게이트웨이는 노출하지 않는다. */
import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { LedgerCreatePanel, PageLoading } from '@/components/ui';
import { WORK_SECTIONS_BY_KIND } from '@/lib/work-form-sections';
import { todayKST } from '@/lib/contracts/dates';
import { mobileVehicleHref } from '@/lib/mobile-routes';

function MWorkNewInner() {
  const router = useRouter();
  const params = useSearchParams();
  const plate = params.get('plate') || '';
  const companyId = params.get('company') || '';
  const close = () => router.replace(plate ? mobileVehicleHref(plate, companyId) : '/m/work');
  return (
    <div style={{ height: 'calc(100dvh - var(--fp-bar-h) - env(safe-area-inset-bottom))', background: 'var(--bg-card)' }}>
      <LedgerCreatePanel
        entityKey="work_item"
        title="업무 생성"
        sectionsByKind={WORK_SECTIONS_BY_KIND}
        kindField="category"
        fallbackKind="기타"
        kindGateways={{
          과태료: {
            sectionTitle: '웹에서 등록',
            message: '과태료 고지서는 OCR과 계약 매칭이 필요한 원본 자료입니다. 웹 데이터센터에서 등록하세요.',
          },
        }}
        quick
        continuable
        initial={{ date: todayKST(), status: '미배정', category: '', workType: '', title: '', plate, companyId }}
        onClose={close}
        onSaved={close}
      />
    </div>
  );
}

export default function MWorkNew() {
  return <Suspense fallback={<PageLoading label="업무 생성 준비 중…" />}><MWorkNewInner /></Suspense>;
}
