'use client';
/**
 * MonthCalendar — 월간 일정 달력 공용 원자.
 *   데이터는 밖에서 date→items 맵으로 주입(집계 손롤 금지 — agendaByDate 등 도메인 SSOT 사용).
 *   웹=칸마다 항목 라벨, 모바일=색점+건수만. 항목 클릭=딥링크, 초과분은 «+N».
 */
import { useMemo, type CSSProperties } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { C, R, NUM } from './tokens';
import { Btn } from './controls';
import { useIsMobile } from '@/lib/use-mobile';

export type CalendarItem = {
  key: string;
  label: string;
  tone: 'red' | 'amber' | 'green' | 'gray';
  onClick?: () => void;
};

const TONE_COLOR: Record<CalendarItem['tone'], string> = {
  red: C.danger, amber: C.warn, green: C.ok, gray: C.mute,
};

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

const ymAdd = (ym: string, delta: number): string => {
  const [y, m] = ym.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + delta, 1));
  return `${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`;
};

export function MonthCalendar({
  ym, onYm, today, items, maxPerDay = 3, onMore, fill = false,
}: {
  /** 표시 월 'YYYY-MM' */
  ym: string;
  onYm: (ym: string) => void;
  /** 오늘 'YYYY-MM-DD' — 칸 강조 */
  today: string;
  /** date('YYYY-MM-DD') → 그날 항목들 */
  items: Map<string, CalendarItem[]>;
  maxPerDay?: number;
  /** «+N» 클릭 시 (date) — 미지정이면 표기만 */
  onMore?: (date: string) => void;
  /**
   * 담긴 칸의 높이를 그대로 채운다(주 행이 남은 높이를 균등 분배).
   * 대시보드처럼 «화면 한 판»인 자리용 — 안 쓰면 종전대로 내용 높이.
   */
  fill?: boolean;
}) {
  const mobile = useIsMobile();
  const [year, month] = ym.split('-').map(Number);

  const cells = useMemo(() => {
    const first = new Date(Date.UTC(year, month - 1, 1));
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const lead = first.getUTCDay();
    const out: Array<string | null> = Array.from({ length: lead }, () => null);
    for (let d = 1; d <= daysInMonth; d++) {
      out.push(`${ym}-${String(d).padStart(2, '0')}`);
    }
    while (out.length % 7 !== 0) out.push(null);
    return out;
  }, [ym, year, month]);

  const weekRows = cells.length / 7;
  const cellBase: CSSProperties = {
    // fill 이면 남은 높이를 나눠 가지므로 하한만 둔다(내용이 많은 칸은 칸 안에서 잘림 → «+N»으로 안내).
    minHeight: fill ? (mobile ? 40 : 52) : (mobile ? 52 : 88),
    padding: mobile ? '4px 4px' : '5px 6px',
    borderTop: `1px solid ${C.line2}`,
    display: 'flex', flexDirection: 'column', gap: 2,
    minWidth: 0,
    ...(fill ? { overflow: 'hidden' } : null),
  };

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minWidth: 0,
      ...(fill ? { height: '100%', minHeight: 0 } : null),
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, paddingBottom: 8 }}>
        <Btn size="sm" variant="ghost" iconOnly tip="이전 달" onClick={() => onYm(ymAdd(ym, -1))}>
          <ChevronLeft size={14} />
        </Btn>
        <span style={{ fontSize: 13, fontWeight: 800, color: C.ink, fontFamily: NUM, minWidth: 76, textAlign: 'center' }}>
          {year}년 {month}월
        </span>
        <Btn size="sm" variant="ghost" iconOnly tip="다음 달" onClick={() => onYm(ymAdd(ym, 1))}>
          <ChevronRight size={14} />
        </Btn>
        {ym !== today.slice(0, 7) && (
          <Btn size="sm" variant="ghost" onClick={() => onYm(today.slice(0, 7))}>이번달</Btn>
        )}
      </div>
      <div style={{
        border: `1px solid ${C.line2}`, borderRadius: R, overflow: 'hidden',
        ...(fill ? { flex: '1 1 auto', minHeight: 0, display: 'flex', flexDirection: 'column' } : null),
      }}>
        <div style={{
          display: 'grid', gridTemplateColumns: 'repeat(7, minmax(0, 1fr))',
          ...(fill ? { flex: '1 1 auto', minHeight: 0, gridTemplateRows: `auto repeat(${weekRows}, minmax(0, 1fr))` } : null),
        }}>
          {WEEKDAYS.map((w, i) => (
            <div key={w} style={{
              padding: '5px 6px', fontSize: 10.5, fontWeight: 700, textAlign: 'center',
              color: i === 0 ? C.danger : C.sub, background: 'var(--bg-header)',
            }}>
              {w}
            </div>
          ))}
          {cells.map((date, i) => {
            if (!date) return <div key={`empty-${i}`} style={{ ...cellBase, background: 'var(--bg-stripe)' }} />;
            const day = Number(date.slice(8, 10));
            const isToday = date === today;
            const dayItems = items.get(date) || [];
            const shown = dayItems.slice(0, maxPerDay);
            const rest = dayItems.length - shown.length;
            return (
              <div key={date} style={cellBase}>
                <span style={{
                  fontSize: 10.5, fontWeight: isToday ? 800 : 600, fontFamily: NUM, lineHeight: 1,
                  color: isToday ? '#fff' : i % 7 === 0 ? C.danger : C.sub,
                  background: isToday ? C.accent : 'transparent',
                  borderRadius: 999, padding: '2px 5px', alignSelf: 'flex-start',
                }}>
                  {day}
                </span>
                {mobile ? (
                  dayItems.length > 0 && (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 2, flexWrap: 'wrap' }}>
                      {shown.map((it) => (
                        <i key={it.key} style={{
                          width: 6, height: 6, borderRadius: 3, background: TONE_COLOR[it.tone], display: 'inline-block',
                        }} />
                      ))}
                      {rest > 0 && <small style={{ fontSize: 9, color: C.mute, fontFamily: NUM }}>+{rest}</small>}
                    </span>
                  )
                ) : (
                  <>
                    {shown.map((it) => (
                      <button
                        key={it.key}
                        type="button"
                        onClick={it.onClick}
                        title={it.label}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 4, width: '100%', minWidth: 0,
                          border: 'none', background: 'transparent', padding: 0, textAlign: 'left',
                          cursor: it.onClick ? 'pointer' : 'default', fontFamily: 'inherit',
                        }}
                      >
                        <i style={{ width: 6, height: 6, borderRadius: 3, background: TONE_COLOR[it.tone], flex: 'none' }} />
                        <span style={{
                          fontSize: 10.5, color: C.ink, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        }}>
                          {it.label}
                        </span>
                      </button>
                    ))}
                    {rest > 0 && (
                      <button
                        type="button"
                        onClick={onMore ? () => onMore(date) : undefined}
                        style={{
                          border: 'none', background: 'transparent', padding: 0, textAlign: 'left',
                          fontSize: 10, color: C.mute, cursor: onMore ? 'pointer' : 'default', fontFamily: 'inherit',
                        }}
                      >
                        +{rest}건
                      </button>
                    )}
                  </>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
