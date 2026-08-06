'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { useReloadOnSaved } from '@/lib/use-reload-on-saved';
import { ENTITY_LIST, ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import { companyLabel, companyShort } from '@/lib/companies';
import { Page, Sec, EmptyState, ListBox, ListRow, Btn, C, PageLoading, useConfirm } from '@/components/ui';
import { toast } from '@/lib/toast';

type Item = { entity: string; rec: EntityRecord };

export default function TrashPage() {
  const { companyId, scopeAll } = useSession();
  const confirm = useConfirm();
  const [items, setItems] = useState<Item[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback((silent = false) => {
    if (!silent) setLoading(true);
    const store = getStore();
    Promise.all(ENTITY_LIST.map((e) => store.listDeleted(e.key, companyId).then((rs) => rs.map((rec) => ({ entity: e.key, rec })))))
      .then((arrs) => {
        setItems(arrs.flat().sort((a, b) => String(b.rec.deletedAt || '').localeCompare(String(a.rec.deletedAt || ''))));
        setLoading(false);
      }).catch(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);
  useReloadOnSaved(useCallback(() => load(true), [load]));

  async function restore(it: Item) {
    const e = ENTITIES[it.entity];
    const name = String(it.rec[e.fields[0].key] || it.rec._key || '');
    const owner = String(it.rec.companyId || companyId);
    if (!(await confirm({
      title: '삭제 항목 복구',
      message: `${companyShort(owner)} · ${e.label} · ${name}\n원래 원장으로 복구합니까?`,
      confirmLabel: '복구',
    }))) return;
    try {
      // 전체 회사 모드에서 key로 법인을 재탐색하지 않는다.
      // 법인 간 동일 key가 있어도 삭제 레코드의 소유 법인으로만 복구한다.
      await getStore().restore(it.entity, owner, String(it.rec._key || ''));
      toast(`${e.label} 복구 완료 · ${name}`, 'success');
      load();
    } catch (error) {
      toast(`복구 실패 — ${(error as Error).message || '잠시 후 다시 시도해 주세요'}`, 'error');
    }
  }

  return (
    <Page title="휴지통" meta={`${items.length}건 · 소프트삭제 (복구 가능)`}>
      <Sec id="trash-list" title="삭제된 항목" n={items.length} desc="소프트삭제 · 복구 가능">
        {loading ? <PageLoading />
          : items.length === 0 ? <EmptyState>삭제된 항목 없음</EmptyState>
          : (
            <ListBox>
              {items.map((it, i) => {
                const e = ENTITIES[it.entity];
                const name = String(it.rec[e.fields[0].key] || it.rec._key || '');
                const sub = `${String(it.rec.deletedAt || '').slice(0, 16).replace('T', ' ')}${it.rec.deletedReason ? ' · ' + it.rec.deletedReason : ''}${scopeAll ? ' · ' + companyShort(it.rec.companyId) : ''}`;
                return (
                  <ListRow key={`${it.entity}:${String(it.rec.companyId || '')}:${String(it.rec._key || i)}`} badge={e.label} main={name} sub={sub}
                    right={<Btn size="sm" variant="ghost" onClick={() => restore(it)}><span style={{ color: C.ok }}>복구</span></Btn>} />
                );
              })}
            </ListBox>
          )}
      </Sec>
    </Page>
  );
}
