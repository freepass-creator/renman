'use client';
// 법인 워크스페이스 — 법인 하나의 전용 페이지. 모듈(기본정보·차고지·등록대수·증차신청·공문…)을
// 접기/펼치기 + 카탈로그에서 추가/제거. 자산·자금이 이 법인에 귀속되는 뿌리 설정.
import { useEffect, useState, type CSSProperties } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Plus, X, Trash2, Building2 } from 'lucide-react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { COMPANIES, companyLabel, companyShort } from '@/lib/companies';
import { loadMaster, saveMaster, genId, MODULE_CATALOG, type CompanyMaster, type Garage, type RegApplication, type OfficialDoc } from '@/lib/company-master';
import { Page, Panel, Sec, Btn, Input, Select, C } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';

const lab: CSSProperties = { fontSize: 11.5, color: 'var(--text-sub)', display: 'block', marginBottom: 3 };
const APP_STATUS: RegApplication['status'][] = ['준비', '접수', '승인', '반려'];
const statusTone = (s: RegApplication['status']) => s === '승인' ? C.ok : s === '반려' ? C.danger : s === '접수' ? C.accent : C.mute;

export default function CompanyWorkspace() {
  const { companyId: scope, isOperator } = useSession();
  const params = useParams();
  const router = useRouter();
  const id = String(params.id || '');
  // 법인 소속 직원은 자기 법인만. 본사는 전 법인.
  const allowed = isOperator || scope === id;
  const [m, setM] = useState<CompanyMaster>({});
  const [dirty, setDirty] = useState(false);
  const [owned, setOwned] = useState(0); // 이 법인 보유 차량 수(정합용)

  useEffect(() => { setM(loadMaster(id)); setDirty(false); }, [id]);
  useEffect(() => { getStore().list('vehicle', id).then((v) => setOwned(v.filter((x) => String(x.status || '') !== '매각' && String(x.status || '') !== '말소').length)).catch(() => {}); }, [id]);

  const modules = m.modules || [];
  const set = (patch: Partial<CompanyMaster>) => { setM((p) => ({ ...p, ...patch })); setDirty(true); };
  const save = () => { saveMaster(id, m); setDirty(false); };
  const addModule = (k: string) => set({ modules: [...modules, k] });
  const removeModule = (k: string) => set({ modules: modules.filter((x) => x !== k) });
  const available = MODULE_CATALOG.filter((c) => !modules.includes(c.key));

  if (!allowed) return <Page title="법인관리"><div style={{ padding: 20, color: C.mute }}>이 법인에 접근 권한이 없습니다.</div></Page>;
  if (!COMPANIES.includes(id)) return <Page title="법인관리"><div style={{ padding: 20, color: C.mute }}>존재하지 않는 법인입니다.</div></Page>;

  return (
    <Page title={companyLabel(id)} meta={`법인 워크스페이스 · ${companyShort(id)}`}
      tools={<WorkbenchBar actions={
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          {dirty && <span style={{ fontSize: 12, color: C.warn, fontWeight: 700 }}>저장 안 됨</span>}
          <Btn onClick={save} disabled={!dirty}>저장</Btn>
        </div>
      } />}>

      {/* 법인 스위처 — 본사만 */}
      {isOperator && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap', margin: '4px 0 18px' }}>
          <span style={{ fontSize: 11.5, fontWeight: 700, color: C.faint, marginRight: 2 }}>법인 전환</span>
          {COMPANIES.map((c) => (
            <Btn key={c} size="sm" variant={c === id ? 'solid' : 'ghost'} onClick={() => router.push(`/company/${c}`)}>
              <Building2 size={13} /> {companyShort(c)}
            </Btn>
          ))}
        </div>
      )}

      {modules.map((key) => {
        const cat = MODULE_CATALOG.find((c) => c.key === key);
        if (!cat) return null;
        return (
          <Sec key={key} id={`co-${key}`} title={cat.label} desc={cat.desc}
            right={!cat.core ? <Btn size="sm" variant="ghost" onClick={() => removeModule(key)}><X size={15} /></Btn> : undefined}>
            {renderModule(key, m, set, owned)}
          </Sec>
        );
      })}

      {/* 모듈 추가 카탈로그 */}
      {available.length > 0 && (
        <Panel title="모듈 추가">
          <div style={{ padding: '10px 14px 14px', display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {available.map((c) => (
              <Btn key={c.key} size="sm" variant="ghost" onClick={() => addModule(c.key)}>
                <Plus size={14} /> {c.label}
              </Btn>
            ))}
          </div>
        </Panel>
      )}
    </Page>
  );
}

function renderModule(key: string, m: CompanyMaster, set: (p: Partial<CompanyMaster>) => void, owned: number) {
  if (key === 'basic') return <BasicModule m={m} set={set} />;
  if (key === 'garage') return <GarageModule m={m} set={set} />;
  if (key === 'vehicleReg') return <VehicleRegModule m={m} set={set} owned={owned} />;
  if (key === 'officialDoc') return <OfficialDocModule m={m} set={set} />;
  if (key === 'card') return <CardModule m={m} set={set} />;
  if (key === 'license') return <div style={{ fontSize: 12.5, color: C.faint }}>사업자등록증·대여사업 등록증·정관·등기부 보관 — 문서 시스템 연동 예정.</div>;
  return null;
}

type MP = { m: CompanyMaster; set: (p: Partial<CompanyMaster>) => void };

function BasicModule({ m, set }: MP) {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(210px,1fr))', gap: 10 }}>
      <div><label style={lab}>대표</label><Input value={m.ceo || ''} onChange={(e) => set({ ceo: e.target.value })} style={{ width: '100%' }} /></div>
      <div><label style={lab}>사업자등록번호</label><Input value={m.bizNo || ''} onChange={(e) => set({ bizNo: e.target.value })} style={{ width: '100%' }} /></div>
      <div><label style={lab}>법인등록번호</label><Input value={m.corpNo || ''} onChange={(e) => set({ corpNo: e.target.value })} style={{ width: '100%' }} /></div>
      <div><label style={lab}>대표 전화</label><Input value={m.phone || ''} onChange={(e) => set({ phone: e.target.value })} style={{ width: '100%' }} /></div>
      <div style={{ gridColumn: '1 / -1' }}><label style={lab}>본점(사무실) 소재지</label><Input value={m.address || ''} onChange={(e) => set({ address: e.target.value })} placeholder="예: 김포시 …" style={{ width: '100%' }} /></div>
    </div>
  );
}

function GarageModule({ m, set }: MP) {
  const list = m.garages || [];
  const upd = (i: number, patch: Partial<Garage>) => set({ garages: list.map((g, j) => j === i ? { ...g, ...patch } : g) });
  const totalCap = list.reduce((s, g) => s + (Number(g.capacity) || 0), 0);
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>등록된 차고지 없음. 아래에서 추가하세요.</div>}
      {list.map((g, i) => (
        <div key={g.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={g.name || ''} onChange={(e) => upd(i, { name: e.target.value })} placeholder="차고지명" style={{ width: 130 }} />
          <Input value={g.address || ''} onChange={(e) => upd(i, { address: e.target.value })} placeholder="주소" style={{ flex: 1, minWidth: 200 }} />
          <Input type="number" value={g.capacity ?? ''} onChange={(e) => upd(i, { capacity: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="수용대수" style={{ width: 96 }} />
          <Btn size="sm" variant="ghost" onClick={() => set({ garages: list.filter((_, j) => j !== i) })}><Trash2 size={15} /></Btn>
        </div>
      ))}
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginTop: 4 }}>
        <Btn size="sm" variant="ghost" onClick={() => set({ garages: [...list, { id: genId('gr') }] })}><Plus size={13} /> 차고지 추가</Btn>
        {totalCap > 0 && <span style={{ fontSize: 12, color: C.mute }}>총 수용 <b style={{ fontFamily: 'var(--font-mono)' }}>{totalCap}</b>대</span>}
      </div>
    </div>
  );
}

function VehicleRegModule({ m, set, owned }: MP & { owned: number }) {
  const reg = Number(m.registeredCount) || 0;
  const apps = m.regApplications || [];
  const cap = (m.garages || []).reduce((s, g) => s + (Number(g.capacity) || 0), 0);
  const upd = (i: number, patch: Partial<RegApplication>) => set({ regApplications: apps.map((a, j) => j === i ? { ...a, ...patch } : a) });
  const mism = reg > 0 && owned !== reg;
  const overCap = cap > 0 && reg > cap;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        <div><label style={lab}>등록 대수(관청)</label><Input type="number" value={m.registeredCount ?? ''} onChange={(e) => set({ registeredCount: e.target.value === '' ? undefined : Number(e.target.value) })} style={{ width: 120 }} /></div>
        <div style={{ fontSize: 12.5, color: C.mute }}>보유 차량 <b style={{ fontFamily: 'var(--font-mono)', color: C.ink }}>{owned}</b>대{cap > 0 && <> · 차고지 수용 <b style={{ fontFamily: 'var(--font-mono)' }}>{cap}</b>대</>}</div>
      </div>
      {(mism || overCap) && (
        <div style={{ fontSize: 12, color: C.danger, fontWeight: 600, display: 'flex', flexDirection: 'column', gap: 2 }}>
          {mism && <span>⚠ 등록 대수({reg})와 보유 차량({owned})이 다릅니다 — 증차·감차 신고 확인.</span>}
          {overCap && <span>⚠ 등록 대수({reg})가 차고지 수용({cap})을 초과합니다.</span>}
        </div>
      )}
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: C.mute, marginBottom: 6 }}>증차·감차 신청</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
          {apps.length === 0 && <div style={{ fontSize: 12.5, color: C.faint }}>신청 이력 없음.</div>}
          {apps.map((a, i) => (
            <div key={a.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
              <Input type="date" value={a.date || ''} onChange={(e) => upd(i, { date: e.target.value })} style={{ width: 140 }} />
              <Select value={a.kind} onChange={(e) => upd(i, { kind: e.target.value as RegApplication['kind'] })} style={{ width: 84 }}><option value="증차">증차</option><option value="감차">감차</option></Select>
              <Input type="number" value={a.count ?? ''} onChange={(e) => upd(i, { count: e.target.value === '' ? undefined : Number(e.target.value) })} placeholder="대수" style={{ width: 72 }} />
              <Input value={a.office || ''} onChange={(e) => upd(i, { office: e.target.value })} placeholder="관할관청" style={{ flex: 1, minWidth: 130 }} />
              <Select value={a.status} onChange={(e) => upd(i, { status: e.target.value as RegApplication['status'] })} style={{ width: 92, color: statusTone(a.status), fontWeight: 700 }}>
                {APP_STATUS.map((s) => <option key={s} value={s} style={{ color: C.ink }}>{s}</option>)}
              </Select>
              <Btn size="sm" variant="ghost" onClick={() => set({ regApplications: apps.filter((_, j) => j !== i) })}><Trash2 size={15} /></Btn>
            </div>
          ))}
          <div><Btn size="sm" variant="ghost" onClick={() => set({ regApplications: [...apps, { id: genId('ap'), kind: '증차', status: '준비' }] })}><Plus size={13} /> 신청 추가</Btn></div>
        </div>
      </div>
    </div>
  );
}

function OfficialDocModule({ m, set }: MP) {
  const list = m.officialDocs || [];
  const upd = (i: number, patch: Partial<OfficialDoc>) => set({ officialDocs: list.map((d, j) => j === i ? { ...d, ...patch } : d) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <p style={{ fontSize: 12, color: C.faint, margin: 0 }}>이 법인 명의 발신·수신 공문 대장. 실제 문서 작성은 문서 시스템 연동 예정.</p>
      {list.map((d, i) => (
        <div key={d.id} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input type="date" value={d.date || ''} onChange={(e) => upd(i, { date: e.target.value })} style={{ width: 140 }} />
          <Select value={d.direction} onChange={(e) => upd(i, { direction: e.target.value as OfficialDoc['direction'] })} style={{ width: 84 }}><option value="발신">발신</option><option value="수신">수신</option></Select>
          <Input value={d.title || ''} onChange={(e) => upd(i, { title: e.target.value })} placeholder="제목" style={{ flex: 1, minWidth: 180 }} />
          <Input value={d.counterpart || ''} onChange={(e) => upd(i, { counterpart: e.target.value })} placeholder="상대(수신처/발신처)" style={{ width: 150 }} />
          <Btn size="sm" variant="ghost" onClick={() => set({ officialDocs: list.filter((_, j) => j !== i) })}><Trash2 size={15} /></Btn>
        </div>
      ))}
      <div><Btn size="sm" variant="ghost" onClick={() => set({ officialDocs: [...list, { id: genId('doc'), direction: '발신' }] })}><Plus size={13} /> 공문 추가</Btn></div>
    </div>
  );
}

function CardModule({ m, set }: MP) {
  const list = m.cards || [];
  const upd = (i: number, patch: Partial<{ no: string; alias?: string }>) => set({ cards: list.map((c, j) => j === i ? { ...c, ...patch } : c) });
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {list.map((c, i) => (
        <div key={i} style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <Input value={c.no || ''} onChange={(e) => upd(i, { no: e.target.value })} placeholder="카드번호(끝4자리)" style={{ width: 150 }} />
          <Input value={c.alias || ''} onChange={(e) => upd(i, { alias: e.target.value })} placeholder="별명 (예: 영업용)" style={{ flex: 1, minWidth: 150 }} />
          <Btn size="sm" variant="ghost" onClick={() => set({ cards: list.filter((_, j) => j !== i) })}><Trash2 size={15} /></Btn>
        </div>
      ))}
      <div><Btn size="sm" variant="ghost" onClick={() => set({ cards: [...list, { no: '' }] })}><Plus size={13} /> 카드 추가</Btn></div>
    </div>
  );
}
