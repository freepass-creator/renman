import { describe, expect, it } from 'vitest';
import { findOriginalByHash, sha256Hex } from '@/lib/file-fingerprint';

describe('원본 파일 지문', () => {
  it('같은 내용은 같은 SHA-256을 만든다', async () => {
    const bytes = new TextEncoder().encode('같은 원본 내용').buffer;
    const first = await sha256Hex(bytes);
    const second = await sha256Hex(bytes.slice(0));
    expect(first).toHaveLength(64);
    expect(second).toBe(first);
  });

  it('파일명이 아니라 내용이 바뀌면 지문이 달라진다', async () => {
    const first = await sha256Hex(new TextEncoder().encode('원본 A').buffer);
    const second = await sha256Hex(new TextEncoder().encode('원본 B').buffer);
    expect(second).not.toBe(first);
  });

  it('저장된 원본 중 같은 지문을 찾는다', () => {
    const records = [{ _key: 'one', originalHash: 'abc' }, { _key: 'two', originalHash: 'def' }];
    expect(findOriginalByHash('def', records)?._key).toBe('two');
    expect(findOriginalByHash('', records)).toBeUndefined();
  });
});
