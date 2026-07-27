export const MAX_DOCUMENT_BYTES = 20 * 1024 * 1024;

const MIME_BY_EXT: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
};

function extension(name: string): string {
  return name.split('.').pop()?.toLowerCase() || '';
}

export function safeDocumentName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed || trimmed.length > 180 || /[\/\\\0-\x1f]/.test(trimmed)) return null;
  return MIME_BY_EXT[extension(trimmed)] ? trimmed : null;
}

export function safeDrivePath(raw: string): string[] | null {
  if (!raw || raw.length > 500) return null;
  const segments = raw.split('/').map((part) => part.trim()).filter(Boolean);
  if (!segments.length || segments.length > 8) return null;
  if (segments.some((part) =>
    part === '.' || part === '..' || part.length > 80 || /[\\\0-\x1f]/.test(part)
  )) return null;
  return segments;
}

export function sniffDocumentMime(bytes: Uint8Array): string | null {
  if (bytes.length >= 5 &&
      bytes[0] === 0x25 && bytes[1] === 0x50 && bytes[2] === 0x44 &&
      bytes[3] === 0x46 && bytes[4] === 0x2d) return 'application/pdf';
  if (bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) return 'image/jpeg';
  if (bytes.length >= 8 &&
      bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47 &&
      bytes[4] === 0x0d && bytes[5] === 0x0a && bytes[6] === 0x1a && bytes[7] === 0x0a) return 'image/png';
  if (bytes.length >= 12 &&
      String.fromCharCode(...bytes.slice(0, 4)) === 'RIFF' &&
      String.fromCharCode(...bytes.slice(8, 12)) === 'WEBP') return 'image/webp';
  return null;
}

export function validateDocument(
  name: string,
  declaredMime: string,
  bytes: Uint8Array,
): { ok: true; mime: string; name: string } | { ok: false; error: string } {
  const safeName = safeDocumentName(name);
  if (!safeName) return { ok: false, error: 'unsupported file name or extension' };
  if (!bytes.length) return { ok: false, error: 'empty file' };
  if (bytes.length > MAX_DOCUMENT_BYTES) return { ok: false, error: 'file exceeds 20MB' };
  const detectedMime = sniffDocumentMime(bytes);
  const expectedMime = MIME_BY_EXT[extension(safeName)];
  if (!detectedMime || detectedMime !== expectedMime) return { ok: false, error: 'file signature mismatch' };
  if (declaredMime && declaredMime !== 'application/octet-stream' && declaredMime !== detectedMime) {
    return { ok: false, error: 'content type mismatch' };
  }
  return { ok: true, mime: detectedMime, name: safeName };
}
