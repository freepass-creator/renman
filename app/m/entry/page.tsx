'use client';
/** Mobile entry hub: route each field task directly to its focused workflow. */
import { useRouter } from 'next/navigation';
import { Camera, Upload, PenLine, ReceiptText } from 'lucide-react';
import { ActionGrid, ActionTile, C } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MEntry() {
  const router = useRouter();
  return (
    <>
      <MHead title="입력" color="var(--indigo-text)" />
      <div style={{ padding: 14 }}>
        <ActionGrid>
          <ActionTile icon={<Camera size={24} />} label="현장 수집" desc="사진·문서·서명을 먼저 등록" onClick={() => router.push('/inbox')} />
          <ActionTile icon={<Upload size={24} />} label="차량 등록" desc="등록증 OCR 또는 직접 입력" onClick={() => router.push('/ingest?type=vehicle')} />
          <ActionTile icon={<PenLine size={24} />} label="계약 등록" desc="계약서 OCR 또는 직접 입력" onClick={() => router.push('/ingest?type=contract')} />
          <ActionTile icon={<ReceiptText size={24} />} label="과태료 등록" desc="고지서 촬영 및 책임자 매칭" onClick={() => router.push('/ingest?type=penalty')} />
        </ActionGrid>
        <div style={{ marginTop: 12, fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
          현장 업무별 입력 화면으로 바로 이동합니다. 인도·반납은 배차관리에서 차량과 계약을 확인한 뒤 처리하세요.
        </div>
      </div>
    </>
  );
}
