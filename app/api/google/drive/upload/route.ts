/**
 * Google Drive 업로드 API — ERP 서류(등록증·보험증권·할부·계약서 등)를 회사 워크스페이스 Drive에 저장. (jpkerp5 이식)
 *
 * POST /api/google/drive/upload  (multipart/form-data: file, path, fileName)
 *   response: { ok, fileId, webViewLink, folderPath }
 * 폴더 구조: {ROOT}/자산/{회사}/{차량번호}/등록증.pdf  ·  계약/{회사}/{차번}/{계약번호}/계약서.pdf
 *
 * 파일=Drive(회사 워크스페이스), 데이터=Firebase. 미러 성격이라 실패해도 ERP 흐름 무관.
 */
import { NextResponse, type NextRequest } from 'next/server';
import { getDriveClient, workspaceConfigured } from '@/lib/google/client';
import { requireAuth } from '@/lib/api-auth';
import { Readable } from 'stream';

export const runtime = 'nodejs';
export const maxDuration = 60;

const ROOT_FOLDER_ID = process.env.GOOGLE_DRIVE_ROOT_FOLDER_ID;
// 공유 드라이브(팀 워크스페이스) — files.list/create 에 supportsAllDrives 필요. jpkerp5 값 기본.
const SHARED_DRIVE_ID = process.env.GOOGLE_DRIVE_SHARED_DRIVE_ID ?? '0ALp5cUm1kqTvUk9PVA';

/** path 의 각 segment 폴더를 Drive 에 생성/조회. 마지막 folder ID 반환. */
async function ensureFolderPath(drive: ReturnType<typeof getDriveClient>, segments: string[]): Promise<string> {
  if (!ROOT_FOLDER_ID) throw new Error('GOOGLE_DRIVE_ROOT_FOLDER_ID 미설정');
  let parentId = ROOT_FOLDER_ID;
  for (const name of segments) {
    if (!name.trim()) continue;
    const escName = name.replace(/'/g, "\\'");
    const q = `name='${escName}' and mimeType='application/vnd.google-apps.folder' and '${parentId}' in parents and trashed=false`;
    const list = await drive.files.list({
      q, fields: 'files(id,name)', pageSize: 1,
      supportsAllDrives: true, includeItemsFromAllDrives: true,
      corpora: 'drive', driveId: SHARED_DRIVE_ID,
    });
    const existing = list.data.files?.[0];
    if (existing?.id) { parentId = existing.id; continue; }
    const created = await drive.files.create({
      requestBody: { name, mimeType: 'application/vnd.google-apps.folder', parents: [parentId] },
      fields: 'id', supportsAllDrives: true,
    });
    if (!created.data.id) throw new Error(`폴더 생성 실패: ${name}`);
    parentId = created.data.id;
  }
  return parentId;
}

export async function POST(req: NextRequest) {
  const cfg = workspaceConfigured();
  if (!cfg.ok) return NextResponse.json({ ok: false, error: `Workspace 미설정: ${cfg.missing.join(', ')}` }, { status: 500 });

  const actor = await requireAuth();
  if (actor instanceof NextResponse) return actor;

  try {
    const form = await req.formData();
    const file = form.get('file');
    const pathRaw = String(form.get('path') ?? '').trim();
    const fileName = String(form.get('fileName') ?? '').trim();
    if (!(file instanceof File)) return NextResponse.json({ ok: false, error: 'file 필수' }, { status: 400 });
    if (!pathRaw) return NextResponse.json({ ok: false, error: 'path 필수' }, { status: 400 });
    if (!fileName) return NextResponse.json({ ok: false, error: 'fileName 필수' }, { status: 400 });

    const segments = pathRaw.split('/').map((s) => s.trim()).filter(Boolean);
    const drive = getDriveClient();
    const folderId = await ensureFolderPath(drive, segments);

    const buffer = Buffer.from(await file.arrayBuffer());
    const created = await drive.files.create({
      requestBody: { name: fileName, parents: [folderId] },
      media: { mimeType: file.type || 'application/octet-stream', body: Readable.from(buffer) },
      fields: 'id,webViewLink,webContentLink',
      supportsAllDrives: true,
    });

    return NextResponse.json({
      ok: true,
      fileId: created.data.id,
      webViewLink: created.data.webViewLink,
      folderPath: pathRaw,
      uploadedAt: new Date().toISOString(),
      uploadedBy: actor.email,
    });
  } catch (e) {
    console.error('[drive/upload]', e);
    return NextResponse.json({ ok: false, error: (e as Error).message ?? String(e) }, { status: 500 });
  }
}
