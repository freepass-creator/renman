'use client';
/**
 * 빠른입력 — 차번 검색·선택 후 요약(회사·차번·차종·계약상태) + 아래 텍스트·파일.
 *   웹: 입력 옆 요약 · 모바일: 입력 아래 요약. 텍스트|파일 = 웹 좌우 · 모바일 상하.
 */
import { useEffect, useMemo, useRef, useState } from 'react';
import { X } from 'lucide-react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { type EntityRecord } from '@/lib/intake/entities';
import { matchVehicles, type VehicleSearchHit } from '@/lib/search-match';
import { normPlate } from '@/lib/plate';
import { saveIntake } from '@/lib/intake';
import { uploadToInbox, saveInboxNote } from '@/lib/inbox-upload';
import { resolveWriteCompany, NEED_COMPANY } from '@/lib/scope';
import { todayKST } from '@/lib/contracts/dates';
import { toast } from '@/lib/toast';
import FileDrop from '@/components/FileDrop';
import { Btn, Input, TextArea, Badge, C, SPACE_M } from '@/components/ui';
import { companyDisplay, companyTone } from '@/lib/companies';
import { useIsMobile } from '@/lib/use-mobile';

function contractStatus(plate: string, veh: EntityRecord | undefined, contracts: EntityRecord[]): string {
  const np = normPlate(plate);
  const active = contracts.find((c) => normPlate(c.plate) === np && !c.returnedDate);
  if (active) {
    const who = String(active.contractorName || '').trim();
    return who ? `운행중 · ${who}` : '운행중';
  }
  const s = String(veh?.status || '');
  if (/정비|수리/.test(s)) return '정비';
  if (/처분/.test(s)) return s || '처분';
  return '휴차';
}

export function QuickInput({ onDone, onCancel }: { onDone: () => void; onCancel: () => void }) {
  const { user, companyId } = useSession();
  const mobile = useIsMobile();
  const [q, setQ] = useState('');
  const [picked, setPicked] = useState<VehicleSearchHit | null>(null);
  const [text, setText] = useState('');
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [listOpen, setListOpen] = useState(false);
  const [sel, setSel] = useState(0);
  const [vehicles, setVehicles] = useState<EntityRecord[]>([]);
  const [contracts, setContracts] = useState<EntityRecord[]>([]);
  const wrap = useRef<HTMLDivElement>(null);

  const plate = picked?.plate || q.trim();
  const plateCo = picked?.companyId || '';
  const target = resolveWriteCompany(companyId, plateCo ? { companyId: plateCo } : null);
  const textTrim = text.trim();
  const hits = useMemo(() => matchVehicles(q, vehicles, contracts, 10), [q, vehicles, contracts]);
  const showHits = listOpen && !picked && q.trim().length > 0;
  const status = picked ? contractStatus(picked.plate, picked.veh, contracts) : '';
  const carName = picked ? String(picked.veh.carName || '').trim() : '';

  useEffect(() => {
    const store = getStore();
    Promise.all([store.list('vehicle', companyId), store.list('contract', companyId)])
      .then(([vs, cs]) => { setVehicles(vs); setContracts(cs); })
      .catch(() => {});
  }, [companyId]);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (!wrap.current?.contains(e.target as Node)) setListOpen(false);
    }
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, []);

  useEffect(() => { if (sel >= hits.length) setSel(0); }, [hits.length, sel]);

  function pick(hit: VehicleSearchHit) {
    setPicked(hit);
    setQ(hit.plate);
    setListOpen(false);
    setSel(0);
  }

  function clearPick() {
    setPicked(null);
    setQ('');
    setListOpen(true);
  }

  async function save() {
    if (!target) { toast(NEED_COMPANY, 'error'); return; }
    if (!textTrim && !file) return;
    setBusy(true);
    try {
      const notes: string[] = [];
      if (textTrim) {
        if (plate) {
          await saveIntake('history', target, [{
            plate, category: '메모', title: textTrim, date: todayKST(),
            author: user.name, companyId: target, _kind: 'activity',
          }]);
          notes.push(`${plate} 메모`);
        } else {
          const r = await saveInboxNote(textTrim, target, String(user.name || ''));
          if (!r.ok) { toast(r.reason || '메모 저장 실패', 'error'); return; }
          notes.push('대기함 메모');
        }
      }
      if (file) {
        const r = await uploadToInbox(file, '기타', target, String(user.name || ''), {
          plate: plate || undefined,
          note: textTrim || undefined,
        });
        if (!r.ok) {
          toast(r.reason === 'unconfigured' ? '저장소 미설정 — Firebase 필요' : '업로드 실패', 'error');
          return;
        }
        notes.push(plate ? `${plate} 파일` : '대기함 파일');
      }
      toast(notes.join(' · ') + ' 저장', 'success');
      onDone();
    } finally { setBusy(false); }
  }

  const canSave = !!textTrim || !!file;
  return (
    <div style={{
      border: `1px solid ${C.line}`, borderRadius: 'var(--radius)', background: C.card,
      padding: '12px 14px', boxSizing: 'border-box',
    }}>
      <div ref={wrap} style={{ marginBottom: 10 }}>
        <div style={{
          display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center',
        }}>
          <Input
            size="sm"
            value={picked ? picked.plate : q}
            readOnly={!!picked}
            onChange={(e) => { setQ(e.target.value); setPicked(null); setSel(0); setListOpen(true); }}
            onFocus={() => { if (!picked) setListOpen(true); }}
            onKeyDown={(e) => {
              if (picked) return;
              if (e.key === 'Escape') { setListOpen(false); return; }
              if (!showHits || !hits.length) return;
              if (e.key === 'ArrowDown') { e.preventDefault(); setSel((i) => Math.min(i + 1, hits.length - 1)); }
              else if (e.key === 'ArrowUp') { e.preventDefault(); setSel((i) => Math.max(i - 1, 0)); }
              else if (e.key === 'Enter' && hits[sel]) { e.preventDefault(); pick(hits[sel]); }
            }}
            placeholder="차량번호 검색"
            style={{ width: mobile ? '100%' : 180, background: picked ? C.bg : C.card, fontFamily: picked ? 'var(--font-mono)' : 'inherit', fontWeight: picked ? 700 : 400 }}
          />

          {picked ? (
            <div style={{
              display: 'inline-flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
              flex: 1, minWidth: mobile ? '100%' : 200,
              padding: mobile ? '8px 10px' : '4px 8px',
              borderRadius: 'var(--radius)', background: C.bg,
            }}>
              {picked.companyId ? <Badge tone={companyTone(picked.companyId)}>{companyDisplay(picked.companyId)}</Badge> : null}
              <span style={{ fontSize: 13, fontWeight: 800, color: C.ink, fontFamily: 'var(--font-mono)' }}>{picked.plate}</span>
              {carName ? <span style={{ fontSize: 12.5, color: C.mute }}>{carName}</span> : null}
              <Badge tone={/운행/.test(status) ? 'green' : /정비/.test(status) ? 'amber' : 'gray'}>{status}</Badge>
              <span style={{ marginLeft: 'auto' }}><Btn size="sm" variant="ghost" iconOnly tip="선택 해제" onClick={clearPick}><X size={14} /></Btn></span>
            </div>
          ) : null}
        </div>

        {showHits && (
          <div style={{
            marginTop: 6,
            border: `1px solid ${C.line}`, borderRadius: 'var(--radius)',
            background: C.bg, overflow: 'hidden', maxHeight: 220, overflowY: 'auto',
          }}>
            {hits.length === 0 ? (
              <div style={{ padding: '10px 12px', fontSize: 12.5, color: C.faint }}>일치 차량 없음 · 차번 없이 저장 가능</div>
            ) : hits.map((hit, i) => {
              const st = contractStatus(hit.plate, hit.veh, contracts);
              return (
                <button
                  key={`${hit.plate}-${i}`}
                  type="button"
                  onMouseEnter={() => setSel(i)}
                  onClick={() => pick(hit)}
                  style={{
                    width: '100%', display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap',
                    padding: mobile ? '12px 14px' : '8px 12px', border: 'none',
                    borderTop: i ? `1px solid ${C.line2}` : 'none',
                    background: sel === i ? C.hover : 'transparent', cursor: 'pointer', textAlign: 'left',
                    fontFamily: 'inherit', WebkitTapHighlightColor: 'transparent',
                  }}
                >
                  {hit.companyId ? <Badge tone={companyTone(hit.companyId)}>{companyDisplay(hit.companyId)}</Badge> : null}
                  <span style={{ fontSize: mobile ? 14 : 13, fontWeight: 700, color: C.ink, fontFamily: 'var(--font-mono)' }}>{hit.plate}</span>
                  {hit.veh.carName ? <span style={{ fontSize: 12, color: C.mute }}>{String(hit.veh.carName)}</span> : null}
                  <span style={{ fontSize: 11.5, color: C.faint }}>{st}</span>
                </button>
              );
            })}
          </div>
        )}
      </div>

      <div style={{
        display: 'grid',
        gridTemplateColumns: mobile ? '1fr' : '1fr 1fr',
        gap: mobile ? SPACE_M : 10,
        alignItems: 'stretch',
      }}>
        <TextArea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={plate ? `${plate}에 남길 내용` : '텍스트 (차번 없으면 대기함)'}
          style={{ minHeight: mobile ? 88 : 120 }}
        />
        <FileDrop
          onFile={setFile}
          file={file}
          accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
          hint="PDF·사진"
        />
      </div>

      <div style={{ display: 'flex', gap: 8, alignItems: 'center', marginTop: 10, flexWrap: 'wrap' }}>
        <Btn size="sm" onClick={save} disabled={busy || !canSave}>{busy ? '저장 중…' : '저장'}</Btn>
        <Btn size="sm" variant="ghost" onClick={onCancel}>취소</Btn>
      </div>
    </div>
  );
}
