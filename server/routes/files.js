import { createReadStream, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { extname, join, resolve } from 'node:path';
import { randomUUID } from 'node:crypto';
import {
  assertSameOrigin,
  HttpError,
  parsePositiveInt,
  readFormData,
  sendJson,
} from '../http.js';
import {
  canAttachToTarget,
  canManageAttachmentTarget,
} from '../access.js';
import { recordAudit } from '../audit.js';
import { serializeAttachment } from '../serializers.js';

const MIME_BY_EXTENSION = new Map([
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.png', 'image/png'],
  ['.webp', 'image/webp'],
  ['.gif', 'image/gif'],
  ['.mp4', 'video/mp4'],
  ['.webm', 'video/webm'],
  ['.pdf', 'application/pdf'],
  ['.doc', 'application/msword'],
  ['.docx', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
  ['.ppt', 'application/vnd.ms-powerpoint'],
  ['.pptx', 'application/vnd.openxmlformats-officedocument.presentationml.presentation'],
  ['.xls', 'application/vnd.ms-excel'],
  ['.xlsx', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
  ['.txt', 'text/plain; charset=utf-8'],
]);

const TARGET_TYPES = ['knowledge', 'activity', 'feedback', 'question', 'community'];

function cleanOriginalName(name) {
  return String(name || 'file')
    .replace(/[\u0000-\u001f\u007f/\\]/g, '_')
    .slice(0, 180) || 'file';
}

export function createFileRoutes({ db, auth, uploadDir }) {
  const safeUploadDir = resolve(uploadDir);
  mkdirSync(safeUploadDir, { recursive: true });

  return async function handle(req, res, url) {
    if (url.pathname === '/api/files' && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requireUser(req);
      const form = await readFormData(req, 51_000_000);
      const file = form.get('file');
      const targetType = String(form.get('targetType') || '');
      const targetId = parsePositiveInt(form.get('targetId'), '目标 ID');
      if (!TARGET_TYPES.includes(targetType)) {
        throw new HttpError(400, '附件目标类型不合法', 'validation_error');
      }
      if (!file || typeof file.arrayBuffer !== 'function') {
        throw new HttpError(400, '请选择要上传的文件', 'file_required');
      }
      if (!canAttachToTarget(db, user, targetType, targetId)) {
        throw new HttpError(403, '没有向此内容添加附件的权限', 'permission_denied');
      }
      const originalName = cleanOriginalName(file.name);
      const extension = extname(originalName).toLowerCase();
      const mimeType = MIME_BY_EXTENSION.get(extension);
      if (!mimeType) {
        throw new HttpError(
          400,
          '不支持该文件类型，请上传图片、PDF、Office 文档或 TXT 文件',
          'unsupported_file_type',
        );
      }
      if (file.size <= 0) {
        throw new HttpError(400, '文件内容为空', 'empty_file');
      }
      if (file.size > 50 * 1024 * 1024) {
        throw new HttpError(413, '单个文件不能超过 50MB', 'file_too_large');
      }
      const storedName = `${randomUUID()}${extension}`;
      const filePath = join(safeUploadDir, storedName);
      const buffer = Buffer.from(await file.arrayBuffer());
      writeFileSync(filePath, buffer, { flag: 'wx' });
      let attachment;
      try {
        const timestamp = new Date().toISOString();
        const result = db.prepare(`
          INSERT INTO attachments
            (target_type, target_id, owner_id, original_name, stored_name,
             mime_type, size_bytes, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        `).run(
          targetType,
          targetId,
          user.id,
          originalName,
          storedName,
          mimeType,
          file.size,
          timestamp,
        );
        attachment = db.prepare('SELECT * FROM attachments WHERE id = ?')
          .get(Number(result.lastInsertRowid));
      } catch (error) {
        rmSync(filePath, { force: true });
        throw error;
      }
      recordAudit(db, req, user, 'file.upload', targetType, targetId, {
        attachmentId: Number(attachment.id),
        originalName,
        sizeBytes: Number(file.size),
      });
      sendJson(res, 201, { item: serializeAttachment(attachment) });
      return true;
    }

    const fileMatch = url.pathname.match(/^\/api\/files\/(\d+)$/);
    if (fileMatch && req.method === 'GET') {
      const user = auth.requireUser(req);
      const id = parsePositiveInt(fileMatch[1], '附件 ID');
      const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
      if (!attachment) throw new HttpError(404, '附件不存在', 'not_found');
      if (!canManageAttachmentTarget(db, user, attachment)) {
        throw new HttpError(403, '当前账号不能查看此附件', 'content_forbidden');
      }
      const filePath = resolve(join(safeUploadDir, attachment.stored_name));
      if (!filePath.startsWith(`${safeUploadDir}\\`) && !filePath.startsWith(`${safeUploadDir}/`)) {
        throw new HttpError(404, '附件不存在', 'not_found');
      }
      const isInline =
        attachment.mime_type.startsWith('image/') ||
        attachment.mime_type.startsWith('video/') ||
        attachment.mime_type === 'application/pdf';
      res.writeHead(200, {
        'Content-Type': attachment.mime_type,
        'Content-Length': Number(attachment.size_bytes),
        'Content-Disposition': `${isInline ? 'inline' : 'attachment'}; filename*=UTF-8''${encodeURIComponent(attachment.original_name)}`,
        'Cache-Control': 'private, max-age=300',
        'X-Content-Type-Options': 'nosniff',
      });
      createReadStream(filePath).on('error', () => {
        if (!res.headersSent) {
          sendJson(res, 404, { error: '附件文件不存在', code: 'not_found' });
        } else {
          res.destroy();
        }
      }).pipe(res);
      return true;
    }

    if (fileMatch && req.method === 'DELETE') {
      assertSameOrigin(req);
      const user = auth.requireUser(req);
      const id = parsePositiveInt(fileMatch[1], '附件 ID');
      const attachment = db.prepare('SELECT * FROM attachments WHERE id = ?').get(id);
      if (!attachment) throw new HttpError(404, '附件不存在', 'not_found');
      const canDelete =
        Number(attachment.owner_id) === Number(user.id) ||
        canAttachToTarget(db, user, attachment.target_type, attachment.target_id);
      if (!canDelete) {
        throw new HttpError(403, '没有删除此附件的权限', 'permission_denied');
      }
      db.prepare('DELETE FROM attachments WHERE id = ?').run(id);
      rmSync(join(safeUploadDir, attachment.stored_name), { force: true });
      recordAudit(db, req, user, 'file.delete', attachment.target_type, attachment.target_id, {
        attachmentId: id,
        originalName: attachment.original_name,
      });
      sendJson(res, 200, { ok: true });
      return true;
    }

    return false;
  };
}
