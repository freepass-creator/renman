'use client';
/**
 * 표준 확인·입력 다이얼로그 (UIUX-SPEC 공통원칙) — window.confirm/prompt 금지, 이걸로 통일.
 *   const confirm = useConfirm(); if (!(await confirm({ message, danger: true }))) return;
 *   const prompt  = usePrompt();  const r = await prompt({ message, required: true }); if (r == null) return;
 * Promise 기반이라 동기 confirm 호출부를 «async + await» 로 거의 그대로 치환한다(Modal 원자 위).
 * Provider 는 app/layout 에 전역 마운트 — 어느 컴포넌트에서든 훅 호출.
 */
import { createContext, useCallback, useContext, useState, type ReactNode } from 'react';
import { Modal } from './overlays';
import { Btn, Input } from './controls';
import { C } from './tokens';

export type ConfirmOpts = { title?: string; message: ReactNode; confirmLabel?: string; cancelLabel?: string; danger?: boolean };
export type PromptOpts = { title?: string; message?: ReactNode; placeholder?: string; initial?: string; confirmLabel?: string; required?: boolean };

type Pending =
  | { kind: 'confirm'; opts: ConfirmOpts; resolve: (v: boolean) => void }
  | { kind: 'prompt'; opts: PromptOpts; resolve: (v: string | null) => void };

type Api = { confirm: (o: ConfirmOpts) => Promise<boolean>; prompt: (o: PromptOpts) => Promise<string | null> };
const Ctx = createContext<Api | null>(null);

export function ConfirmProvider({ children }: { children: ReactNode }) {
  const [pending, setPending] = useState<Pending | null>(null);
  const [val, setVal] = useState('');

  const confirm = useCallback((opts: ConfirmOpts) => new Promise<boolean>((resolve) => setPending({ kind: 'confirm', opts, resolve })), []);
  const prompt = useCallback((opts: PromptOpts) => new Promise<string | null>((resolve) => { setVal(opts.initial ?? ''); setPending({ kind: 'prompt', opts, resolve }); }), []);

  const finish = (result: boolean | string | null) => {
    if (pending) (pending.resolve as (v: boolean | string | null) => void)(result);
    setPending(null);
  };
  const cancel = () => finish(pending?.kind === 'prompt' ? null : false);
  const promptBlocked = pending?.kind === 'prompt' && !!pending.opts.required && !val.trim();

  return (
    <Ctx.Provider value={{ confirm, prompt }}>
      {children}
      {pending && (
        <Modal
          title={pending.opts.title ?? (pending.kind === 'confirm' ? '확인' : '입력')}
          onClose={cancel}
          width={420}
          footer={
            <>
              <Btn variant="ghost" onClick={cancel}>{(pending.kind === 'confirm' && pending.opts.cancelLabel) || '취소'}</Btn>
              <span style={{ flex: 1 }} />
              <Btn
                variant={pending.kind === 'confirm' && pending.opts.danger ? 'danger' : 'solid'}
                disabled={promptBlocked}
                onClick={() => finish(pending.kind === 'confirm' ? true : val)}
              >
                {pending.opts.confirmLabel ?? '확인'}
              </Btn>
            </>
          }
        >
          {pending.opts.message != null && (
            <div style={{ whiteSpace: 'pre-wrap', fontSize: 13.5, lineHeight: 1.5, color: C.ink }}>{pending.opts.message}</div>
          )}
          {pending.kind === 'prompt' && (
            <Input
              autoFocus
              value={val}
              onChange={(e) => setVal(e.target.value)}
              placeholder={pending.opts.placeholder}
              style={{ width: '100%', marginTop: pending.opts.message ? 10 : 0 }}
            />
          )}
        </Modal>
      )}
    </Ctx.Provider>
  );
}

export function useConfirm() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ConfirmProvider 필요(app/layout 마운트)');
  return c.confirm;
}
export function usePrompt() {
  const c = useContext(Ctx);
  if (!c) throw new Error('ConfirmProvider 필요(app/layout 마운트)');
  return c.prompt;
}
