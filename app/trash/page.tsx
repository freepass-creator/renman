'use client';
import { useCallback, useEffect, useState } from 'react';
import { useSession } from '@/lib/session';
import { getStore } from '@/lib/store';
import { useReloadOnSaved } from '@/lib/use-reload-on-saved';
import { ENTITY_LIST, ENTITIES, type EntityRecord } from '@/lib/intake/entities';
import { companyLabel } from '@/lib/companies';
import { Page, Sec, EmptyState, ListBox, ListRow, Btn, C, PageLoading, useConfirm } from '@/components/ui';
import { WorkbenchBar } from '@/components/WorkbenchBar';

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
      .then((arrs) => { setItems(arrs.flat()); setLoading(false); }).catch(() => setLoading(false));
  }, [companyId]);

  useEffect(() => { load(); }, [load]);
  useReloadOnSaved(useCallback(() => load(true), [load]));

  async function restore(it: Item) {
    if (!(await confirm({ message: '이 항목을 복원할까요?' }))) return;
    await getStore().restore(it.entity, companyId, String(it.rec._key || ''));
    load();
  }

  return (
    <Page title="휴지통" meta={`${companyLabel(companyId)} · ${items.length}건 · 소프트삭제 (복구 가능)`} tools={<WorkbenchBar />}>
      <Sec id="trash-list" title="삭제된 항목" n={items.length} desc="소프트삭제 · 복구 가능">
        {loading ? <PageLoading />
          : items.length === 0 ? <EmptyState>삭제된 항목 없음</EmptyState>
          : (
            <ListBox>
              {items.map((it, i) => {
                const e = ENTITIES[it.entity];
                const name = String(it.rec[e.fields[0].key] || it.rec._key || '');
                const sub = `${String(it.rec.deletedAt || '').slice(0, 16).replace('T', ' ')}${it.rec.deletedReason ? ' · ' + it.rec.deletedReason : ''}${scopeAll ? ' · ' + companyLabel(it.rec.companyId) : ''}`;
                return (
                  <ListRow key={i} badge={e.label} main={name} sub={sub}
                    right={<Btn variant="ghost" onClick={() => restore(it)}><span style={{ color: C.ok }}>복구</span></Btn>} />
                );
              })}
            </ListBox>
          )}
      </Sec>
    </Page>
  );
}
