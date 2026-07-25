'use client';
/**
 * 360 세부 시안 — 웹=좌레일+우작업면, focus가 작업면 우선(실 VehiclePage와 동일 골격).
 *   DetailShell → 신분/미결/CTA 레일 · 본문 패널(연결 우선).
 */
import { DetailShell, Sec, Cards, Metric, Btn, EmptyState, Message, Badge, SectionLabel, C, SPACE_GROUP_M } from '@/components/ui';
import { openCar, openIngest } from '@/lib/ui-bus';
import type { FleetRow } from '@/lib/sheet-rows';

const amt = (n: number) => (n ? n.toLocaleString('ko-KR') : '—');

export function Sample360Design({
  row, onBack, isNew,
}: {
  row: FleetRow | null;
  onBack: () => void;
  isNew?: boolean;
}) {
  const plate = row?.plate || '';
  const title = isNew
    ? '새 차량'
    : `${row?.company || '—'} · ${plate || '—'}`;

  return (
    <DetailShell
      title={title}
      meta={isNew ? '신규 · 같은 360 규격' : '360 시안 · 실페이지와 별도'}
      onBack={onBack}
      actions={
        <span style={{ display: 'inline-flex', gap: 6 }}>
          {!isNew && plate && (
            <Btn size="sm" variant="ghost" onClick={() => openCar(plate)}>실 360 열기</Btn>
          )}
          <Btn size="sm" variant="ghost" onClick={() => openIngest('vehicle', plate || undefined)}>담기</Btn>
          <Btn size="sm">저장</Btn>
        </span>
      }
      maxWidth={1000}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: SPACE_GROUP_M }}>
        <Message variant="info">
          <b>ERP 워크벤치.</b> 좌=컨텍스트·작업선택 · 우=선택한 작업만. 연결(focus)이 첫 작업 영역을 연다.
        </Message>

        <SectionLabel mt={0}>지금</SectionLabel>
        <Sec id="s360-status" title="현황" desc="한눈 · 계약 있으면 하위">
          {isNew || !row ? (
            <EmptyState variant="sec">차량·계약이 채워지면 상태·미수·만기가 여기 요약됩니다</EmptyState>
          ) : (
            <>
              <Cards min={120} fit>
                <Metric label="상태" value={row.status || '—'} />
                <Metric label="사용처" value={row.customer || '계약없음'} />
                <Metric label="미수" value={amt(row.net)} tone={row.net > 0 ? 'danger' : undefined} />
                <Metric label="만기" value={row.end ? row.end.slice(0, 10) : '—'} />
              </Cards>
              {row.customer ? (
                <div style={{ marginTop: 12, fontSize: 13, color: C.sub }}>
                  <SectionLabel mt={0} mb={6}>계약 조건</SectionLabel>
                  <Badge tone="green">{row.customer}</Badge>
                  <span style={{ marginLeft: 8 }}>{row.start?.slice(0, 10)} ~ {row.end?.slice(0, 10)} · 월 {amt(row.rent)}</span>
                </div>
              ) : null}
            </>
          )}
        </Sec>

        <Sec id="s360-gps" title="GPS · 관제" desc="시동제어 연동(단말 있을 때)">
          <EmptyState variant="sec">단말 등록 시 실페이지와 동일</EmptyState>
        </Sec>

        <SectionLabel>이 차</SectionLabel>
        <Sec id="s360-car" title="차량 정보" desc="제조사 · 세부모델 · 색"
          right={<Btn size="sm" variant="ghost">{isNew || !row ? '+ 입력' : '수정'}</Btn>}>
          {isNew || !row ? (
            <EmptyState variant="sec">스펙을 입력하거나 등록증 OCR로 채웁니다</EmptyState>
          ) : (
            <div style={{ fontSize: 13, color: C.sub, lineHeight: 1.6 }}>
              {[row.maker, row.subModel || row.carName, row.year].filter(Boolean).join(' · ') || '—'}
            </div>
          )}
        </Sec>
        <Sec id="s360-reg" title="등록증" desc="자동차등록증 · 원본(InfoDoc)"
          right={<Btn size="sm" variant="ghost">+ 첨부</Btn>}>
          <EmptyState variant="sec">파일 첨부 · OCR 병합</EmptyState>
        </Sec>
        <Sec id="s360-ins" title="보험" desc="증권 · 만기 · 보험료"
          right={<Btn size="sm" variant="ghost">{row?.insurer ? '수정' : '+ 등록'}</Btn>}>
          {row?.insurer ? (
            <div style={{ fontSize: 13, color: C.sub }}>{row.insurer} · 만기 {row.insEnd?.slice(0, 10) || '—'}</div>
          ) : (
            <EmptyState variant="sec">보험 원자 없음</EmptyState>
          )}
        </Sec>
        <Sec id="s360-buy" title="취득 · 구입" desc="취득가 · 할부 Disclosure"
          right={<Btn size="sm" variant="ghost">수정</Btn>}>
          {row?.loanCompany ? (
            <div style={{ fontSize: 13, color: C.sub }}>{row.loanCompany} · 원금 {amt(row.loanPrincipal)}</div>
          ) : (
            <EmptyState variant="sec">현금/할부 정보</EmptyState>
          )}
        </Sec>
        <Sec id="s360-prod" title="상품 정보" desc="프리패스 매물">
          <EmptyState variant="sec">대여료·보증금 자리</EmptyState>
        </Sec>
        <Sec id="s360-econ" title="자산 손익" desc="수입 · 비용 · 회수율">
          <EmptyState variant="sec">손익 자리</EmptyState>
        </Sec>

        <SectionLabel>수납 · 정산</SectionLabel>
        <Sec id="s360-sch" title="수납 스케줄" desc="회차 · 청구 · 미납">
          {!row?.customer ? (
            <EmptyState variant="sec">계약 후 스케줄 생성</EmptyState>
          ) : (
            <div style={{ fontSize: 13, color: C.sub }}>
              회차 {row.roundTotal ? `${row.roundDue}/${row.roundTotal}` : '—'}
              {row.net > 0 ? ` · 미수 ${amt(row.net)}` : ' · 미수 없음'}
            </div>
          )}
        </Sec>
        <Sec id="s360-dep" title="보증금 정산" desc="반납 후 미정산 시">
          <EmptyState variant="sec">해당 시 노출</EmptyState>
        </Sec>
        <Sec id="s360-hand" title="손바뀜 이력" desc="계약이력 · 재렌트 추천">
          <EmptyState variant="sec">손이 쌓이면 타임라인</EmptyState>
        </Sec>

        <SectionLabel>이력</SectionLabel>
        <Sec id="s360-pen" title="과태료 · 변경부과" desc="실운전자 매칭" right={<Btn size="sm" variant="ghost">+ 추가</Btn>}>
          <EmptyState variant="sec">과태료 목록 자리</EmptyState>
        </Sec>
        <Sec id="s360-work" title="차량 수선 · 정비·사고" desc="WorkForm" right={<Btn size="sm" variant="ghost">+ 수선</Btn>}>
          <EmptyState variant="sec">수선/작업 자리</EmptyState>
        </Sec>
        <Sec id="s360-act" title="활동 · 이력" desc="QuickLog" right={<Btn size="sm" variant="ghost">+ 기록</Btn>}>
          <EmptyState variant="sec">활동 기록 자리</EmptyState>
        </Sec>
      </div>
    </DetailShell>
  );
}
