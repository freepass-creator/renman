/** 화면과 서버가 같이 쓰는 모양 — 여기엔 서버 코드가 없다.
 *  (클라이언트 컴포넌트가 'server-only' 모듈을 타입으로라도 참조하면 번들이 막힌다) */
export type 할일 = {
  행: number;
  완료: boolean;
  순서: string;
  회사명: string;
  업무분류: string;
  담당: string;
  업무내용: string;
  업무페이지: string;
  업무페이지이름: string;
  백데이터: string;
  백데이터이름: string;
  담당자의견: string;
};

export type 사람셈 = { 이름: string; 건수: number; 먼저: number };
