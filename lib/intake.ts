/**
 * 통합 인제스천 파이프라인 (single intake pipeline) — 모든 입력 지점의 단일 통로.
 *
 * 원칙: 어디서 넣든(데이터센터 개별폼 · 대량 OCR/엑셀 · 맥락 인라인) 데이터는 같은 길을 지난다.
 *   1) 앵커키 정규화(plate/contractNo/contractorName) — 오타·표기차로 안 갈리게.
 *   2) 저장            — getStore().save (자연키 dedup · 캐시 무효화는 store.ts가 이미 처리).
 *   3) 부수효과(side-effect) — 엔티티/종류별 후속처리(수선→차량상태 전이 등). 확장 레지스트리.
 *   4) 반영(reflect)    — notifySaved() → 'jpk:saved' → 전 화면 재조회.
 *
 * 프레임워크 무관(React 비의존) — 폼·다이얼로그·업로더 어디서든 호출.
 */
import { getStore, type SaveResult } from './store';
import { notifySaved } from './ui-bus';
import type { EntityRecord } from './intake/entities';
import { workStatusPatch, canApplyWorkStatus } from './work-ops';
import { normPlate, findVehicleByPlate, vehicleMatchesPlate, deriveVehicleStatusFromContract } from './plate';

// ── 앵커키 정규화 ──────────────────────────────────────────────────────────
/** 차량번호 정규화 — plate SSOT(normPlate) 위임. 공백·OCR O/0·I/1 통일. */
export function normalizePlate(s: unknown): string {
  return normPlate(s);
}
/** 식별/이름 계열 — 양끝 trim + 내부 연속공백 1칸으로. 보수적(포맷 파괴·퍼지재작성 안 함). */
function collapseWs(s: string): string {
  return s.trim().replace(/\s+/g, ' ');
}

// 정규화 대상 = "앵커(연결)"에 쓰이는 필드만. 나머지 데이터는 손대지 않는다(형태 보존).
const ANCHOR_NORMALIZERS: { key: string; fn: (s: string) => string }[] = [
  { key: 'plate', fn: (s) => normalizePlate(s) },
  { key: 'contractNo', fn: collapseWs },
  { key: 'contractorName', fn: collapseWs },
];

/** 레코드 앵커키 정규화 — 바뀐 게 있을 때만 얕은 복사(불필요 복제 방지, 입력 불변). */
export function normalizeRecord(rec: EntityRecord): EntityRecord {
  let out: EntityRecord | null = null;
  for (const { key, fn } of ANCHOR_NORMALIZERS) {
    const v = rec[key];
    if (typeof v !== 'string') continue;
    const nv = fn(v);
    if (nv !== v) { out = out || { ...rec }; out[key] = nv; }
  }
  return out || rec;
}

/** 앵커 해석 — plate 질의로 기존 차량(번호변경 이력 포함). 없으면 null(=신규). */
export function resolveAnchor(vehicles: EntityRecord[], query: string): EntityRecord | null {
  return findVehicleByPlate(vehicles, query) || null;
}

// ── 부수효과 레지스트리 ────────────────────────────────────────────────────
/** 파이프라인이 부수효과에 넘기는 맥락(앵커 등). 저장 레코드 밖의 정보는 여기로. */
export type IntakeContext = {
  vehicle?: EntityRecord | null; // 앵커 차량(수선→상태전이용). _key·status 보유.
  idle?: boolean;                // 앵커 차량이 유휴(활성계약 없음)인가 → 상태전이 가드.
  // 확장 여지: contracts?(과태료→계약 매칭), schedule 등.
};

type SideEffectArgs = { entityKey: string; companyId: string; records: EntityRecord[]; context: IntakeContext };
type SideEffectFn = (args: SideEffectArgs) => Promise<string[]>; // 적용한 효과 라벨들 반환

/**
 * 수선(_kind:'work') → 차량 자산상태 파생 전이. WorkForm이 오늘 하던 로직을 그대로 이관.
 *   · 유휴차(활성계약 없음) && 처분 전 상태에서만 전이(운행·처분 중인 차는 기록만).
 *   · 앵커 차량(context.vehicle._key) 없으면 기록만 남기고 전이 생략.
 * activity 로그('정비' 등 카테고리 겹침)는 _kind!=='work'라 여기서 절대 트리거되지 않음.
 */
const workStatusSideEffect: SideEffectFn = async ({ companyId, records, context }) => {
  const applied: string[] = [];
  const vehicle = context.vehicle;
  if (!vehicle || !vehicle._key) return applied;
  const idle = !!context.idle;
  const current = String(vehicle.status || '');
  for (const rec of records) {
    if (rec._kind !== 'work') continue;
    const target = workStatusPatch(String(rec.category || ''), String(rec.work_status || ''));
    if (target && canApplyWorkStatus(idle, current) && target !== current) {
      await getStore().update('vehicle', companyId, String(vehicle._key), { status: target });
      applied.push(`vehicle-status→${target}`);
      break; // WorkForm은 1건 저장 — 상태는 한 번만 전이.
    }
  }
  return applied;
};

/**
 * 보험 저장 → 차량 보험 denorm(만기·보험사·증권번호)을 "최신 만기 증권"으로 동기화.
 *   갱신 후 옛 증권이 vehicle.insuranceExpiryDate에 남아 "만기 경과" 오탐을 쏘는 문제를 소스에서 해소.
 *   능동지능(컴플라이언스·대시보드)은 vehicle.insuranceExpiryDate를 보므로, 이 denorm이 항상 최신이어야 신뢰가 산다.
 */
const insuranceDenormSideEffect: SideEffectFn = async ({ companyId, records }) => {
  const applied: string[] = [];
  const plates = [...new Set(records.map((r) => normalizePlate(r.plate)).filter(Boolean))];
  if (!plates.length) return applied;
  const [vehicles, allIns] = await Promise.all([getStore().list('vehicle', companyId), getStore().list('insurance', companyId)]);
  for (const plate of plates) {
    const veh = findVehicleByPlate(vehicles, plate);
    if (!veh?._key) continue;
    // 이 차의 최신 만기 증권 1건 (현재번호·이력 plate 모두)
    const latest = allIns.filter((i) => vehicleMatchesPlate(veh, i.plate) || normalizePlate(i.plate) === plate)
      .sort((a, b) => String(b.endDate || '').localeCompare(String(a.endDate || '')))[0];
    if (!latest) continue;
    const patch: EntityRecord = {};
    if (latest.endDate && veh.insuranceExpiryDate !== latest.endDate) patch.insuranceExpiryDate = latest.endDate;
    if (latest.insurer && veh.insuranceCompany !== latest.insurer) patch.insuranceCompany = latest.insurer;
    if (latest.policyNo && veh.insurancePolicyNo !== latest.policyNo) patch.insurancePolicyNo = latest.policyNo;
    if (Object.keys(patch).length) { await getStore().update('vehicle', companyId, String(veh._key), patch); applied.push(`insurance-denorm:${plate}`); }
  }
  return applied;
};

/**
 * 엔티티별 부수효과. 새 후속처리는 여기에만 꽂으면 전 입력지점에 자동 적용된다.
 *   history   : 수선→차량상태 전이 (배선 완료)
 *   insurance : 보험→차량 만기 denorm 동기화(최신 증권) — 만기 오탐 제거
 *   penalty   : 과태료→계약(임차인) 매칭 — 지금은 PenaltyUpload가 저장 전에 자체 수행(현행 유지: 리스크 회피).
 */
/**
 * 계약 저장 → 그 차량이 없으면 자동 생성(원자 사슬: plate가 차량↔계약을 잇는 물리 축).
 *   "어디서 입력하든 차량이 살아남" — 신규 계약 담기 시 ghost(계약만 있고 차량 없음)를 원천 제거.
 *   plate 정규성으로 status 자동(구매대기/등록대기/휴차). 이미 있으면 생성 안 함(normPlate 관대 매칭).
 *   ※ 대량 seed·엑셀 업로드는 store.save 직접이라 이 통로를 안 타므로 보유대수 부풀림 없음.
 */
const contractVehicleSyncSideEffect: SideEffectFn = async ({ companyId, records }) => {
  const applied: string[] = [];
  const vehicles = await getStore().list('vehicle', companyId);
  for (const rec of records) {
    const plate = String(rec.plate || '').trim();
    if (!plate || plate === '미정') continue;
    if (findVehicleByPlate(vehicles, plate)) continue; // 이미 있음
    const draft: EntityRecord = { plate, status: deriveVehicleStatusFromContract(plate), _autoCreatedFrom: 'contract' };
    if (rec.carName) draft.carName = rec.carName;
    if (rec.maker) draft.maker = rec.maker;
    if (rec.contractNo) draft.currentContractNo = rec.contractNo;
    await getStore().save('vehicle', companyId, [draft]);
    vehicles.push(draft); // 같은 배치 내 중복 생성 방지
    applied.push(`vehicle-created:${plate}`);
  }
  return applied;
};

const SIDE_EFFECTS: Record<string, SideEffectFn[]> = {
  history: [workStatusSideEffect],
  insurance: [insuranceDenormSideEffect],
  contract: [contractVehicleSyncSideEffect],
};

// ── 단일 통로 ──────────────────────────────────────────────────────────────
export type IntakeOptions = {
  context?: IntakeContext;
  notify?: boolean; // 기본 true. 상위가 이미 notifySaved하면 false로 이중반영 방지.
};
export type IntakeResult = {
  save: SaveResult;         // getStore().save 결과(saved/duplicates/backend)
  records: EntityRecord[];  // 정규화되어 저장에 넘어간 레코드
  sideEffects: string[];    // 적용된 부수효과 라벨
};

/**
 * 모든 입력이 지나는 단일 통로.
 * @param entityKey ENTITIES 키('vehicle'|'history'|'penalty'|…)
 * @param companyId 귀속 회사(ALL 금지 — 저장 대상 회사 확정 후 호출)
 * @param records   저장할 레코드들(정규화 전 원본)
 */
export async function saveIntake(
  entityKey: string,
  companyId: string,
  records: EntityRecord[],
  opts: IntakeOptions = {},
): Promise<IntakeResult> {
  const normalized = records.map(normalizeRecord);
  const save = await getStore().save(entityKey, companyId, normalized);

  const sideEffects: string[] = [];
  for (const fn of SIDE_EFFECTS[entityKey] || []) {
    try {
      const applied = await fn({ entityKey, companyId, records: normalized, context: opts.context || {} });
      sideEffects.push(...applied);
    } catch (e) {
      // 부수효과 실패가 저장을 되돌리진 않는다(저장은 이미 성공). 로그만.
      console.warn(`intake 부수효과(${entityKey}) 실패:`, (e as Error).message);
    }
  }

  if (opts.notify !== false) notifySaved();
  return { save, records: normalized, sideEffects };
}
