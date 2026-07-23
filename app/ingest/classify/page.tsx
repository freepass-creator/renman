'use client';
/**
 * 차종 분류(마스터 매칭) — 기존 차량의 차명·연식을 차종마스터(erp3 로컬 403)에 스냅해
 *   제조사·모델·세부모델을 자동 추천 → 검토 후 확인한 것만 일괄 반영(실 함대 안전).
 *   파워트레인·트림은 차명에 없어 비움(수기/후속). 팝업 아닌 페이지.
 */
import { useEffect, useMemo, useState } from 'react';
import { Wand2 } from 'lucide-react';
import { useSession } from '@/lib/session';
import { useEntityLists } from '@/lib/use-entity-lists';
import { type EntityRecord } from '@/lib/intake/entities';
import { ensureCatalog, classifyVehicle, type ClassifyResult } from '@/lib/domain/vehicle-master';
import { commitUpdate } from '@/lib/commit';
import { NEED_COMPANY } from '@/lib/scope';
import { companyLabel } from '@/lib/companies';
import { Page, Panel, Btn, Badge, EmptyState, DataTable, IconSeg, C, SPACE_M, type Col, PageLoading } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';
import { toast } from '@/lib/toast';

type View = '미분류' | '전체';
const VIEWS: View[] = ['미분류', '전체'];

type Row = {
  key: string;
  veh: EntityRecord;
  plate: string;
  carName: string;
  cur: { maker: string; modelLine: string; subModel: string };
  classified: boolean;   // 현재 세부모델까지 채워졌나
  sug: ClassifyResult;
};

const confTone = (c: ClassifyResult['confidence']) => (c === 'high' ? 'green' : c === 'review' ? 'amber' : 'gray');
const confLabel = (c: ClassifyResult['confidence']) => (c === 'high' ? '높음' : c === 'review' ? '검토' : '미매칭');

export default function ClassifyPage() {
  const { companyId, scopeAll } = useSession();
  const { data: [vs = []], loading } = useEntityLists(['vehicle']);
  const [ready, setReady] = useState(false);
  const [view, setView] = useState<View>('미분류');
  const [checked, setChecked] = useState<Set<string>>(new Set());
  const [initialized, setInitialized] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    let live = true;
    ensureCatalog().then(() => { if (live) setReady(true); }).catch((e) => toast('차종마스터 로드 실패: ' + (e as Error).message, 'error'));
    return () => { live = false; };
  }, []);

  const allRows = useMemo<Row[]>(() => {
    if (!ready) return [];
    return vs.map((veh): Row => {
      const carName = String(veh.carName || '');
      const cur = { maker: String(veh.maker || ''), modelLine: String(veh.modelLine || ''), subModel: String(veh.subModel || '') };
      const sug = classifyVehicle(carName, String(veh.firstReg || veh.yearMonth || ''));
      return { key: String(veh._key || veh.plate || ''), veh, plate: String(veh.plate || ''), carName, cur, classified: !!cur.subModel, sug };
    });
  }, [vs, ready]);

  // 기본 선택 = 고신뢰 & 아직 미분류(세부모델 없음). 1회 초기화 후 사용자가 자유 토글.
  useEffect(() => {
    if (ready && !initialized && allRows.length) {
      setChecked(new Set(allRows.filter((r) => r.sug.confidence === 'high' && !r.classified).map((r) => r.key)));
      setInitialized(true);
    }
  }, [ready, initialized, allRows]);

  const rows = useMemo(() => (view === '미분류' ? allRows.filter((r) => !r.classified) : allRows), [allRows, view]);

  const stat = useMemo(() => {
    const high = allRows.filter((r) => r.sug.confidence === 'high').length;
    const review = allRows.filter((r) => r.sug.confidence === 'review').length;
    const none = allRows.filter((r) => r.sug.confidence === 'none').length;
    const done = allRows.filter((r) => r.classified).length;
    return { high, review, none, done };
  }, [allRows]);

  const toggle = (key: string) => setChecked((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n; });
  const selectHigh = () => setChecked(new Set(rows.filter((r) => r.sug.confidence === 'high' && r.sug.subModel).map((r) => r.key)));
  const clearSel = () => setChecked(new Set());

  const applySel = async () => {
    const targets = allRows.filter((r) => checked.has(r.key) && r.sug.confidence !== 'none' && r.sug.subModel);
    if (!targets.length) { toast('반영할 건이 없습니다', 'error'); return; }
    setBusy(true);
    let ok = 0, fail = 0;
    for (const r of targets) {
      try {
        await commitUpdate({
          entity: 'vehicle', sessionCompanyId: companyId, rec: r.veh, key: r.key,
          patch: { maker: r.sug.maker, modelLine: r.sug.modelLine, subModel: r.sug.subModel },
        });
        ok++;
      } catch { fail++; }
    }
    setBusy(false);
    setChecked((s) => { const n = new Set(s); targets.forEach((r) => n.delete(r.key)); return n; });
    toast(`${ok}건 반영${fail ? ` · 실패 ${fail}(${NEED_COMPANY})` : ''}`, fail ? 'error' : 'success');
  };

  const five = (m: string, ml: string, sm: string) => [m, ml, sm].filter(Boolean).join(' · ') || '—';

  const cols: Col<Row>[] = [
    {
      key: '_ck', label: '', render: (r) => r.sug.confidence !== 'none' && r.sug.subModel
        ? <input type="checkbox" checked={checked.has(r.key)} onChange={() => toggle(r.key)} onClick={(e) => e.stopPropagation()} style={{ width: 16, height: 16, cursor: 'pointer' }} />
        : <span style={{ color: C.faint }}>—</span>,
    },
    ...(scopeAll ? [{ key: '_co', label: '회사', render: (r: Row) => <span style={{ color: C.mute }}>{companyLabel(r.veh.companyId)}</span> }] : []),
    { key: 'plate', label: '차량번호', render: (r) => <span style={{ fontFamily: 'var(--font-mono)' }}>{r.plate || '—'}</span> },
    { key: 'carName', label: '차명(등록증)', render: (r) => r.carName || <span style={{ color: C.faint }}>미상</span> },
    { key: 'cur', label: '현재', render: (r) => <span style={{ color: r.classified ? C.ink : C.faint }}>{five(r.cur.maker, r.cur.modelLine, r.cur.subModel)}</span> },
    { key: 'sug', label: '추천(제조사·모델·세부모델)', render: (r) => r.sug.confidence === 'none'
        ? <span style={{ color: C.danger }}>매칭 없음</span>
        : <span style={{ color: C.ink }}>{five(r.sug.maker, r.sug.modelLine, r.sug.subModel)}</span> },
    { key: 'conf', label: '신뢰도', render: (r) => <Badge tone={confTone(r.sug.confidence)}>{confLabel(r.sug.confidence)}</Badge> },
  ];

  const selCount = allRows.filter((r) => checked.has(r.key) && r.sug.confidence !== 'none' && r.sug.subModel).length;

  return (
    <Page
      title="차종 분류"
      tools={
        <WorkbenchBar
          tabs={VIEWS.map((v) => ({ key: v, label: v }))}
          tab={view}
          onTab={(k) => setView(k as View)}
          mid={<span style={{ fontSize: 12.5, color: C.faint, whiteSpace: 'nowrap' }}>{`${scopeAll ? '전체 회사' : companyLabel(companyId)} · 높음 ${stat.high} · 검토 ${stat.review} · 미매칭 ${stat.none} · 분류됨 ${stat.done}`}</span>}
        />
      }
    >
      {loading || !ready ? <PageLoading />
        : (
          <Panel title="차명·연식 → 차종마스터 매칭">
            <p style={{ fontSize: 12.5, color: C.mute, margin: '0 0 10px', lineHeight: 1.6 }}>
              등록증 <b>차명</b>과 <b>연식</b>으로 제조사·모델·세부모델을 자동 추천합니다. 검토 후 <b>선택 반영</b>하면 원장에 채워집니다.
              파워트레인·세부트림은 차명에 없어 비웁니다(수기/후속). 신뢰도 <b>높음</b>=연식이 세대에 정확히 들어맞음 · <b>검토</b>=최근 세대 추정.
              {scopeAll && <span style={{ color: C.warn }}> · 회사 전체 대상.</span>}
            </p>
            <div style={{ display: 'flex', gap: SPACE_M, marginBottom: 12, flexWrap: 'wrap', alignItems: 'center' }}>
              <Btn onClick={applySel} disabled={busy || selCount === 0}><Wand2 size={15} /> {busy ? '반영 중…' : `선택 ${selCount}건 반영`}</Btn>
              <Btn variant="ghost" onClick={selectHigh} disabled={busy}>이 목록 높음만 선택</Btn>
              <Btn variant="ghost" onClick={clearSel} disabled={busy || checked.size === 0}>선택 해제</Btn>
            </div>
            {rows.length === 0 ? <EmptyState>{view === '미분류' ? '미분류 차량이 없습니다' : '표시할 차량이 없습니다'}</EmptyState>
              : <DataTable cols={cols} rows={rows} />}
          </Panel>
        )}
    </Page>
  );
}
