'use client';
/** /m 입력 (D) — 2열 액션 타일. 전용 폼(memo·deliver·return·penalty·doc)은 P2 후반. 지금은 기존 흐름 연결. */
import { useRouter } from 'next/navigation';
import { Camera, Upload, PenLine } from 'lucide-react';
import { ActionGrid, ActionTile, C } from '@/components/ui';
import { MHead } from '@/components/m/MHead';

export default function MEntry() {
  const router = useRouter();
  return (
    <>
      <MHead title="입력" color="var(--indigo-text)" />
      <div style={{ padding: '14px' }}>
        <ActionGrid>
          <ActionTile icon={<Camera size={24} />} label="촬영·증빙" desc="계약서·현장 사진 올리기" onClick={() => router.push('/inbox')} />
          <ActionTile icon={<Upload size={24} />} label="데이터센터" desc="엑셀·OCR 대량 투입" onClick={() => router.push('/ingest')} />
          <ActionTile icon={<PenLine size={24} />} label="직접 입력" desc="차량·계약 추가" onClick={() => router.push('/ingest')} />
        </ActionGrid>
        <div style={{ marginTop: 12, fontSize: 11.5, color: C.faint, lineHeight: 1.5 }}>
          ※ 임시로 데스크톱 입력 화면에 연결됩니다. 촬영·인도/반납 전용 폼은 다음 단계에서.
        </div>
      </div>
    </>
  );
}
