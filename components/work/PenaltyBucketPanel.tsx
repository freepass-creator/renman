'use client';

/**
 * 과태료 집계(버킷) 상세 — 유형별 섹션으로 고지서 목록.
 * CMS집금 패널과 대칭: 펼쳐 보기 · 개별 행 열기/삭제 · 처리는 «과태료» 구분에서.
 */
import { Badge, Btn, C, won } from '@/components/ui';
import { FileText, Trash2, UploadCloud, X } from 'lucide-react';
import {
  groupPenaltiesByKind,
  type PenaltyWorkRow,
} from '@/lib/penalty-work';

export function PenaltyBucketPanel({
  rows,
  onClose,
  onOpenItem,
  onRemoveItem,
  onUpload,
  onDocs,
  matchedDocs,
}: {
  rows: PenaltyWorkRow[];
  onClose: () => void;
  onOpenItem: (row: PenaltyWorkRow) => void;
  /** 개별 고지서 소프트삭제(확인·commit은 페이지). */
  onRemoveItem?: (row: PenaltyWorkRow) => void;
  onUpload: () => void;
  onDocs: () => void;
  matchedDocs: number;
}) {
  const groups = groupPenaltiesByKind(rows);
  const openN = rows.filter((r) => r.process !== '종결').length;

  return (
    <section className="ledger-record-panel" aria-label="과태료 집계 상세">
      <header className="ledger-record-panel__header">
        <div className="ledger-record-panel__heading">
          <div className="ledger-record-panel__title">과태료</div>
          <div className="ledger-record-panel__subtitle">
            {rows.length}건 · 미처리 {openN} · 유형별 조회
          </div>
        </div>
        <button type="button" className="ledger-record-panel__close" onClick={onClose} aria-label="상세패널 닫기">
          <X size={14} />
        </button>
      </header>

      <div className="ledger-record-panel__body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Btn size="sm" variant="ghost" onClick={onUpload}><UploadCloud size={14} /> 대량 업로드</Btn>
          {matchedDocs > 0 && (
            <Btn size="sm" variant="ghost" onClick={onDocs}><FileText size={14} /> 변경부과 공문 ({matchedDocs})</Btn>
          )}
        </div>

        {groups.length === 0 ? (
          <div style={{ fontSize: 13, color: C.mute, padding: '8px 0' }}>고지서가 없습니다.</div>
        ) : groups.map((g) => (
          <div key={g.kind}>
            <div style={{
              fontSize: 12, fontWeight: 800, color: C.ink, marginBottom: 8,
              display: 'flex', alignItems: 'baseline', gap: 8,
            }}>
              {g.kind}
              <span style={{ fontSize: 11, fontWeight: 600, color: C.mute }}>{g.rows.length}건</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {g.rows.map((r) => (
                <div
                  key={r.id}
                  style={{
                    border: `1px solid ${C.line}`,
                    borderRadius: 'var(--radius)',
                    background: C.card,
                    padding: '10px 12px',
                    display: 'grid',
                    gridTemplateColumns: onRemoveItem ? '1fr auto auto' : '1fr auto',
                    gap: 8,
                    alignItems: 'center',
                  }}
                >
                  <button
                    type="button"
                    onClick={() => onOpenItem(r)}
                    style={{
                      textAlign: 'left',
                      border: 'none',
                      background: 'transparent',
                      padding: 0,
                      cursor: 'pointer',
                      minWidth: 0,
                    }}
                  >
                    <div style={{ fontSize: 13, fontWeight: 700, color: C.ink }}>
                      {r.plate || '차번 없음'} · {r.violationDate || '—'}
                    </div>
                    <div style={{ fontSize: 11.5, color: C.mute, marginTop: 3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {r.title} · {r.driverName}
                    </div>
                  </button>
                  <div style={{ textAlign: 'right', display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4 }}>
                    <Badge tone={r.process === '종결' ? 'green' : r.process === '미매칭' ? 'red' : 'amber'}>{r.status}</Badge>
                    <span style={{ fontSize: 12, fontWeight: 700, color: C.warn }}>{won(r.amount)}</span>
                  </div>
                  {onRemoveItem ? (
                    <Btn
                      size="sm"
                      variant="ghost"
                      tip="삭제"
                      aria-label="과태료 삭제"
                      onClick={() => onRemoveItem(r)}
                    >
                      <Trash2 size={14} />
                    </Btn>
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
