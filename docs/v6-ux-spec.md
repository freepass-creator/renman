# jpkerp6 UI/UX 재편 스펙 — jpkerp5 계승 + 개선

> 근거: jpkerp5(상용 렌터카매니저 v5.0.42) 로그인 + 실제 화면 캡처 + 소스 7영역 병렬 정밀분석(디자인토큰·셸·테이블·상세·페이지·마이크로). v6의 존재 이유 = jpkerp5의 완성된 디자인 언어를 **계승하되 구조부채를 재건축**해 UX를 개선.

## 1. jpkerp5 완성도 평가 (verdict)
**상용 production 급 백오피스 ERP 디자인 시스템.** 시맨틱 토큰 레이어(색/타이포/밀도/반경/그림자) + `:root[data-theme]` 6종 테마 스왑 + 통일 인터랙션 시스템(default/hover/active/focus-visible/disabled)이 CSS로 명문화되고, PageShell·page-actions·FilterSelect·StatusBadge·DetailDialogShell·EntityFormDialog 프리미티브 3~4층이 SSOT로 강제되어 "같은 기능=같은 자리·아이콘·라벨"이 지켜진다. 30px 고밀도 그리드 + 상태배지 톤매핑 + 3단계 미입력표시 + 라이프사이클 지능형 자동정렬 + 관용입력 + 막다른 KPI 배제(전부 drill-down) → **더존/SAP급 밀도 + Linear/Notion급 폴리시 동시 달성.**

**단, 구조부채 누적**: 토큰 SSOT 이중정의(CSS↔Tailwind: --fw-medium 500 선언 후 400 덮음), page.tsx 1240줄 모놀리스(컬럼정의 3곳 분산), 인라인스타일 자기위반, WCAG 대비 미달(text-weak 2.3:1), 가상화 부재, 이중 편집모델, 접근성 공백, 레거시 3093줄.

→ **v6가 "예쁘게 만드는 한계"였던 진짜 이유 = 내가 인라인 스타일로 손코딩(토대 부재).** jpkerp5는 Tailwind+CSS토큰+Radix. 토대를 바꾸면 상한이 열린다.

## 2. 채택 (jpkerp5 → v6 그대로 이식)
- 시맨틱 토큰 + `:root[data-theme]` 색스왑 테마(레이아웃·간격·폰트 불변) 6종 구조
- 컴팩트 밀도 SSOT: row 30 / input·button 26 / cell 6·8 / sidebar 172(접힘 56) / topbar 48 / bottombar 42
- 액센트 팔레트(8색 × {pastel bg + saturated text + soft border})를 status·tag·kpi·alert가 전부 재사용
- 상태배지 SSOT 3층(StatusBadge+badge-base+status-tones 톤매핑) · 차량 라이프사이클 hue 그라데이션
- 3단계 미입력(필수누락=빨강/비필수=회색/좁은셀) 능동지능 · 뷰별 지능형 자동정렬 + 3클릭 수동
- PageShell/page-actions 하단바(좌=액션클러스터 canonical순서, 우=읽기전용 PageStats) · NewButton 맥락라벨(`{페이지} 등록`)
- FilterSelect 커스텀 listbox(키보드완전) · DetailDialogShell(hero+mode accent+탭+Ctrl+S+닫기가드)
- detail-primitives(Section/Field/Grid2/Stack) · EntityFormDialog 스키마구동(required·dirty·Ctrl+S·멱등가드)
- 관용입력(DateInput 260520→ISO / MoneyInput 콤마 / IdentInput 하이픈) · showConfirm Promise · ContextMenu
- **더블클릭=상세(페이지네비 금지)** · 우클릭 메뉴 · Ctrl/Shift 다중선택 · **우측 320px 액션 대기열 패널**(반납/만기·출고예정·회수미완료)

## 3. 개선 (v6가 jpkerp5보다 낫게)
- **토큰 SSOT 단일화**: font-weight 진짜 3단(400/500/600) 부활로 최소 위계를 굵기로, 죽은 --fw-* 제거. Tailwind fontSize/radius가 CSS var 참조(이중정의 제거)
- **접근성 대비 상향**: text-weak #a1a1aa(2.3:1) → sub #52525b급(WCAG AA 4.5:1)
- **밀도 토글**(`data-density` compact 30 / comfortable 34) · **selected가 hover에 안 덮이게**(좌측 brand accent 유지)
- **단일 in-place 인라인 편집모델**로 일원화(수정버튼 vs 클릭 충돌 해소) + 낙관적저장·롤백·undo·감사
- **행 가상화**(react-virtual) 1000대+ 성능 · **선언형 컬럼 스키마**(폭/정렬/렌더/applicable 한 배열) → 모놀리스 해소
- **반응형 단일 데이터표면**(같은 행 뷰모델, 넓으면 테이블/좁으면 카드) → 웹·모바일 이중코드 드리프트 제거
- 선언형 nav config · 접근성 그리드(aria-sort·키보드 셀이동·색맹 보강) · 액션색 --action-* 토큰화
- KpiCard tone enum + 델타 + drill-down · **topbar/toolbar 2단 분리**(헤더→퀵필터툴바→그리드)

## 4. v6 스택
Next.js 14 App Router + Firebase(회사별 격리) + Vercel. **Tailwind + CSS변수 토큰을 단일 SSOT**(Tailwind가 var() 참조, 이중정의 금지) + **Radix**(Dialog/Tabs/DropdownMenu/Popover) 위 자체 래핑. **인라인스타일 전면 폐기** → 토큰 클래스/data속성. 상태는 도메인 SSOT 엔진(LIFECYCLE·contract-stage·status-tones)에서만 파생. 행 가상화 react-virtual. 아이콘 phosphor 슬롯 주입.

## 5. 착수 순서
1. **토큰 SSOT 재건축**: clean globals(CSS var 단일소스 → Tailwind 브릿지, weight 3단·타이포·radius·색 이중정의 제거, 대비 상향, --action-* 신설, data-theme 6 + data-density 2), 레거시 전량 삭제
2. **도메인 SSOT 엔진**: LIFECYCLE·contract-stage 파생·status-tones·행 뷰모델 빌더(능동 이상감지) → 페이지는 소비만
3. **프리미티브**: AppShell(slot) + Sidebar(config) + StatusBadge + Field 통합 + 입력3종 + showConfirm/ContextMenu/PageLoading/EmptyRow/KpiCard(tone enum)
4. **DataGrid 핵심**: 선언형 컬럼 + 가상화 + aria/키보드 + 정렬2단 + 반응형 테이블↔카드 + skeleton + page-actions 하단바 + FilterSelect + QuickFilterChips
5. **대표 운영 3면**: 운영현황/대시보드/리스크현황 재구현 + ActionQueuePanel 우측 대기열 + drill-down
6. **상세/편집**: DetailDialogShell + detail-primitives + EntityFormDialog + 단일 in-place 인라인편집(낙관저장·undo·감사)
7. **파워유저·접근성·성능 마감**: 컬럼 리사이즈/재정렬/숨김/고정 + 저장뷰 + 밀도토글 + UI store + 접근성 전수 + O(N) 인덱스
