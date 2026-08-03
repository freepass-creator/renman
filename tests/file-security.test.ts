import { describe, expect, it } from 'vitest';
import { safeDocumentName, safeDrivePath, sniffDocumentMime, validateDocument } from '@/lib/file-security';

const pdf = new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37]);
const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

describe('문서 업로드 보안', () => {
  it('확장자와 실제 시그니처가 일치하는 문서만 허용한다', () => {
    expect(validateDocument('contract.pdf', 'application/pdf', pdf)).toMatchObject({ ok: true, mime: 'application/pdf' });
    expect(validateDocument('fake.jpg', 'image/jpeg', pdf)).toMatchObject({ ok: false });
    expect(validateDocument('image.png', 'application/pdf', png)).toMatchObject({ ok: false });
  });

  it('실행 파일·경로 문자가 포함된 이름을 차단한다', () => {
    expect(safeDocumentName('payload.exe')).toBeNull();
    expect(safeDocumentName('../contract.pdf')).toBeNull();
    expect(safeDocumentName('folder\\contract.pdf')).toBeNull();
  });

  it('Drive 경로의 순회·과도한 중첩을 차단한다', () => {
    expect(safeDrivePath('prime/vehicle/12가3456')).toEqual(['prime', 'vehicle', '12가3456']);
    expect(safeDrivePath('prime/../secret')).toBeNull();
    expect(safeDrivePath(Array(10).fill('a').join('/'))).toBeNull();
  });

  it('지원 파일의 매직 바이트를 식별한다', () => {
    expect(sniffDocumentMime(pdf)).toBe('application/pdf');
    expect(sniffDocumentMime(png)).toBe('image/png');
    expect(sniffDocumentMime(new Uint8Array([1, 2, 3]))).toBeNull();
  });
});
