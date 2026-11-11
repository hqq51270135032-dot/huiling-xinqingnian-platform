import {
  assertSameOrigin,
  HttpError,
  optionalString,
  parsePositiveInt,
  readJson,
  requireOneOf,
  requireString,
  sendJson,
} from '../http.js';
import {
  canReadQuestion,
  hasPermission,
} from '../access.js';
import { recordAudit } from '../audit.js';
import {
  serializeAttachment,
  serializeQuestion,
} from '../serializers.js';

const STATUSES = ['pending', 'processing', 'replied', 'archived'];

function getAttachments(db, questionId) {
  return db.prepare(`
    SELECT * FROM attachments
    WHERE target_type = 'question' AND target_id = ?
    ORDER BY id
  `).all(questionId).map(serializeAttachment);
}

function getQuestionRow(db, id) {
  return db.prepare(`
    SELECT q.*,
           u.display_name AS user_name,
           answerer.display_name AS answerer_name
    FROM questions q
    JOIN users u ON u.id = q.user_id
    LEFT JOIN users answerer ON answerer.id = q.answered_by
    WHERE q.id = ?
  `).get(id);
}

export function createQuestionRoutes({ db, auth }) {
  return async function handle(req, res, url) {
    if (url.pathname === '/api/questions' && req.method === 'GET') {
      const user = auth.requirePermission(req, 'question.view');
      const scope = url.searchParams.get('scope') || 'faq';
      const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
      const category = String(url.searchParams.get('category') || '').trim();
      const status = String(url.searchParams.get('status') || '').trim();
      let rows;
      if (scope === 'manage') {
        auth.requirePermissionForUser(user, 'question.manage');
        rows = db.prepare(`
          SELECT q.*, u.display_name AS user_name,
                 answerer.display_name AS answerer_name
          FROM questions q
          JOIN users u ON u.id = q.user_id
          LEFT JOIN users answerer ON answerer.id = q.answered_by
          ORDER BY CASE q.status
            WHEN 'pending' THEN 0 WHEN 'processing' THEN 1 ELSE 2 END,
            q.updated_at DESC
        `).all();
      } else if (scope === 'mine') {
        rows = db.prepare(`
          SELECT q.*, u.display_name AS user_name,
                 answerer.display_name AS answerer_name
          FROM questions q
          JOIN users u ON u.id = q.user_id
          LEFT JOIN users answerer ON answerer.id = q.answered_by
          WHERE q.user_id = ?
          ORDER BY q.created_at DESC
        `).all(user.id);
      } else {
        rows = db.prepare(`
          SELECT q.*, u.display_name AS user_name,
                 answerer.display_name AS answerer_name
          FROM questions q
          JOIN users u ON u.id = q.user_id
          LEFT JOIN users answerer ON answerer.id = q.answered_by
          WHERE q.is_faq = 1 AND q.status IN ('replied', 'archived')
          ORDER BY q.answered_at DESC, q.id DESC
        `).all();
        rows = rows.filter((row) => canReadQuestion(user, row));
      }

      const filtered = rows.filter((row) => {
        if (search && !`${row.title} ${row.content} ${row.answer}`.toLowerCase().includes(search)) {
          return false;
        }
        if (category && row.category !== category) return false;
        if (status && row.status !== status) return false;
        return true;
      });
      sendJson(res, 200, {
        items: filtered.map((row) => serializeQuestion(row, {
          attachments: getAttachments(db, row.id),
        })),
      });
      return true;
    }

    if (url.pathname === '/api/questions' && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'question.create');
      const input = await readJson(req);
      const title = requireString(input.title, '问题标题', { min: 4, max: 120 });
      const content = requireString(input.content, '问题描述', { min: 10, max: 8000 });
      const category = requireString(input.category, '问题分类', { min: 2, max: 40 });
      const timestamp = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO questions
          (user_id, title, content, category, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, 'pending', ?, ?)
      `).run(user.id, title, content, category, timestamp, timestamp);
      const id = Number(result.lastInsertRowid);
      recordAudit(db, req, user, 'question.create', 'question', id, { title });
      sendJson(res, 201, {
        item: serializeQuestion(getQuestionRow(db, id), {
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    const questionMatch = url.pathname.match(/^\/api\/questions\/(\d+)$/);
    if (questionMatch && req.method === 'GET') {
      const user = auth.requirePermission(req, 'question.view');
      const id = parsePositiveInt(questionMatch[1], '问题 ID');
      const row = getQuestionRow(db, id);
      if (!row) throw new HttpError(404, '问题不存在', 'not_found');
      if (!canReadQuestion(user, row)) {
        throw new HttpError(403, '当前账号不能查看此问题', 'content_forbidden');
      }
      sendJson(res, 200, {
        item: serializeQuestion(row, {
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    if (questionMatch && req.method === 'PATCH') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'question.manage');
      const id = parsePositiveInt(questionMatch[1], '问题 ID');
      const existing = getQuestionRow(db, id);
      if (!existing) throw new HttpError(404, '问题不存在', 'not_found');
      const input = await readJson(req);
      const status = input.status
        ? requireOneOf(input.status, '问题状态', STATUSES)
        : existing.status;
      const answer = input.answer !== undefined
        ? optionalString(input.answer, '回复内容', { max: 10000 })
        : existing.answer;
      if (status === 'replied' && answer.length < 5) {
        throw new HttpError(400, '标记已回复时必须填写回复内容', 'validation_error', {
          field: 'answer',
        });
      }
      const isFaq = input.isFaq === undefined ? Boolean(existing.is_faq) : Boolean(input.isFaq);
      if (isFaq && !['replied', 'archived'].includes(status)) {
        throw new HttpError(400, '只有已回复问题可设为常见问题', 'validation_error');
      }
      const timestamp = new Date().toISOString();
      const answered = input.answer !== undefined || status === 'replied';
      db.prepare(`
        UPDATE questions
        SET status = ?, answer = ?, answered_by = ?, answered_at = ?,
            is_faq = ?, updated_at = ?
        WHERE id = ?
      `).run(
        status,
        answer,
        answered ? user.id : existing.answered_by,
        answered ? timestamp : existing.answered_at,
        isFaq ? 1 : 0,
        timestamp,
        id,
      );
      recordAudit(db, req, user, 'question.update', 'question', id, {
        status,
        isFaq,
      });
      sendJson(res, 200, {
        item: serializeQuestion(getQuestionRow(db, id), {
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    const convertMatch = url.pathname.match(/^\/api\/questions\/(\d+)\/convert$/);
    if (convertMatch && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'question.manage');
      auth.requirePermissionForUser(user, 'knowledge.create');
      const id = parsePositiveInt(convertMatch[1], '问题 ID');
      const question = getQuestionRow(db, id);
      if (!question) throw new HttpError(404, '问题不存在', 'not_found');
      if (!question.answer) {
        throw new HttpError(409, '问题尚未回复，不能转为知识草稿', 'question_not_answered');
      }
      const input = await readJson(req);
      const visibility = requireOneOf(
        input.visibility || 'public',
        '可见范围',
        ['public', 'internal', 'restricted'],
      );
      if (visibility === 'internal' && !hasPermission(user, 'knowledge.internal.view')) {
        throw new HttpError(403, '没有内部资料权限', 'permission_denied');
      }
      if (visibility === 'restricted' && !hasPermission(user, 'knowledge.restricted.view')) {
        throw new HttpError(403, '没有受限案例权限', 'permission_denied');
      }
      const title = requireString(
        input.title || question.title,
        '知识标题',
        { min: 2, max: 120 },
      );
      const content = [
        '【问题】',
        question.content,
        '',
        '【答复】',
        question.answer,
        '',
        '【整理说明】',
        '本内容由志愿者提问整理，发布前需核验事实并完成编辑审核。',
      ].join('\n');
      const timestamp = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO knowledge
          (title, summary, content, category, tags, visibility, status,
           author_id, created_at, updated_at, source_type, source_id)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 'question', ?)
      `).run(
        title,
        `由问题“${question.title}”及其答复整理的知识草稿。`,
        content,
        input.category || question.category,
        '常见问题,答疑',
        visibility,
        user.id,
        timestamp,
        timestamp,
        id,
      );
      const knowledgeId = Number(result.lastInsertRowid);
      recordAudit(db, req, user, 'question.convert', 'question', id, {
        knowledgeId,
      });
      sendJson(res, 201, { knowledgeId, status: 'draft' });
      return true;
    }

    return false;
  };
}
