export const DATA_CENTER_TITLE = '데이터센터';
export const DATA_CENTER_QUEUE_TITLE = '원본 처리함';
export const MOBILE_CAPTURE_TITLE = '현장 수집';

export const PROCESSING_STATES = [
  '분석중', '자동반영', '확인필요', '미분류', '중복', '오류', '처리완료',
] as const;

export type ProcessingState = typeof PROCESSING_STATES[number];

export const PROCESSING_STATE_HELP: Record<ProcessingState, string> = {
  분석중: '원본을 보관하고 내용을 판독하는 중',
  자동반영: '고신뢰 분석 결과를 연결 원장에 반영함',
  확인필요: '충돌값이나 복수 연결 후보를 확인해야 함',
  미분류: '자료 종류 또는 연결 대상을 아직 찾지 못함',
  중복: '같은 원본이나 고유번호 자료가 이미 존재함',
  오류: '분석 또는 저장에 실패해 재시도가 필요함',
  처리완료: '확인·연결·반영과 후속조치가 끝남',
};
