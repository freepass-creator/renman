import { describe, expect, it } from 'vitest';
import {
  backupPrefix,
  collectionIdsFromArgs,
  normalizeGsUri,
  parseGsUri,
  requireExpectedProject,
} from '../scripts/firestore-managed-common.mjs';

describe('Firestore 관리형 백업·복구 가드', () => {
  it('운영 프로젝트 외 대상은 거부한다', () => {
    expect(() => requireExpectedProject({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'other-project' }))
      .toThrow('renman-dd0a2');
    expect(requireExpectedProject({ NEXT_PUBLIC_FIREBASE_PROJECT_ID: 'renman-dd0a2' }))
      .toBe('renman-dd0a2');
  });

  it('버킷명은 gs URI로 정규화하고 잘못된 형식은 거부한다', () => {
    expect(normalizeGsUri('renman-backup.appspot.com/', '버킷'))
      .toBe('gs://renman-backup.appspot.com');
    expect(() => normalizeGsUri('https://example.com/a', '버킷')).toThrow('형식');
    expect(parseGsUri('gs://renman-backup.appspot.com/firestore-managed/backup-1', '백업'))
      .toEqual({
        bucket: 'renman-backup.appspot.com',
        objectPrefix: 'firestore-managed/backup-1',
      });
  });

  it('컬렉션 범위를 중복 없이 파싱한다', () => {
    expect(collectionIdsFromArgs(['--collections=contract,bank_tx,contract']))
      .toEqual(['contract', 'bank_tx']);
    expect(collectionIdsFromArgs([])).toBeUndefined();
  });

  it('백업 경로에 충돌 없는 시각 접두사를 붙인다', () => {
    expect(backupPrefix('gs://bucket', new Date('2026-08-03T02:00:01.234Z')))
      .toBe('gs://bucket/firestore-managed/2026-08-03T02-00-01-234Z');
  });
});
