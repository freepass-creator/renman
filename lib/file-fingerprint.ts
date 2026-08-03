/** 원본 내용 기반 SHA-256. 파일명 변경과 무관한 중복 식별용이며 원본을 대체하지 않는다. */
export async function sha256Hex(data: ArrayBuffer): Promise<string> {
  if (!globalThis.crypto?.subtle) return '';
  const digest = await globalThis.crypto.subtle.digest('SHA-256', data);
  return [...new Uint8Array(digest)].map((byte) => byte.toString(16).padStart(2, '0')).join('');
}

export async function fingerprintFile(file: File): Promise<string> {
  try {
    return await sha256Hex(await file.arrayBuffer());
  } catch {
    // 해시 실패가 원본 보관을 막아서는 안 된다.
    return '';
  }
}

export function findOriginalByHash<T extends Record<string, unknown>>(hash: string, records: T[]): T | undefined {
  if (!hash) return undefined;
  return records.find((record) => String(record.originalHash || '') === hash);
}
