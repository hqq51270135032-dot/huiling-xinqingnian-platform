import {
  assertSameOrigin,
  HttpError,
  normalizeTags,
  optionalString,
  parseDate,
  parsePositiveInt,
  readJson,
  requireOneOf,
  requireString,
  sendJson,
} from '../http.js';
import {
  canReadFeedback,
  hasPermission,
} from '../access.js';
import { recordAudit } from '../audit.js';
import {
  serializeAttachment,
  serializeFeedback,
} from '../serializers.js';

const REVIEW_STATUSES = ['approved', 'rejected', 'revision'];

function getAttachments(db, feedbackId) {
  return db.prepare(`
    SELECT * FROM attachments
    WHERE target_type = 'feedback' AND target_id = ?
    ORDER BY id
  `).all(feedbackId).map(serializeAttachment);
}

function getFeedbackRow(db, id) {
  return db.prepare(`
    SELECT f.*,
           a.title AS activity_title,
           u.display_name AS user_name,
           reviewer.display_name AS reviewer_name
    FROM feedback f
    JOIN activities a ON a.id = f.activity_id
    JOIN users u ON u.id = f.user_id
    LEFT JOIN users reviewer ON reviewer.id = f.reviewer_id
    WHERE f.id = ?
  `).get(id);
}

function validateFeedbackInput(input) {
  const data = {
    participationDate: parseDate(input.participationDate, '参与时间'),
    problems: optionalString(input.problems, '遇到的问题', { max: 5000 }),
    observations: requireString(input.observations, '值得关注的表现', { min: 5, max: 8000 }),
    communicationDifficulties: optionalString(
      input.communicationDifficulties,
      '沟通或互动困难',
      { max: 5000 },
    ),
    learnings: optionalString(input.learnings, '学习收获', { max: 5000 }),
    newUnderstanding: optionalString(input.newUnderstanding, '新的认识', { max: 5000 }),
    suggestions: optionalString(input.suggestions, '组织建议', { max: 5000 }),
    additional: optionalString(input.additional, '其他补充', { max: 5000 }),
  };
  return data;
}

function canEditFeedback(feedback, user) {
  return (
    Number(feedback.user_id) === Number(user.id) &&
    ['pending', 'revision', 'rejected'].includes(feedback.status)
  );
}

export function createFeedbackRoutes({ db, auth }) {
  return async function handle(req, res, url) {
    if (url.pathname === '/api/feedback' && req.method === 'GET') {
      const user = auth.requireUser(req);
      const scope = url.searchParams.get('scope') || 'mine';
      const status = String(url.searchParams.get('status') || '').trim();
      const activityId = Number(url.searchParams.get('activityId') || 0);
      const featured = url.searchParams.get('featured') === '1';

      let rows;
      if (scope === 'review') {
        auth.requirePermissionForUser(user, 'feedback.review');
        rows = db.prepare(`
          SELECT f.*, a.title AS activity_title, u.display_name AS user_name,
                 reviewer.display_name AS reviewer_name
          FROM feedback f
          JOIN activities a ON a.id = f.activity_id
          JOIN users u ON u.id = f.user_id
          LEFT JOIN users reviewer ON reviewer.id = f.reviewer_id
          ORDER BY CASE f.status
            WHEN 'pending' THEN 0 WHEN 'revision' THEN 1 ELSE 2 END,
            f.submitted_at DESC
        `).all();
      } else if (scope === 'public') {
        auth.requirePermissionForUser(user, 'community.view');
        rows = db.prepare(`
          SELECT f.*, a.title AS activity_title, u.display_name AS user_name,
                 reviewer.display_name AS reviewer_name
          FROM feedback f
          JOIN activities a ON a.id = f.activity_id
          JOIN users u ON u.id = f.user_id
          LEFT JOIN users reviewer ON reviewer.id = f.reviewer_id
          WHERE f.status = 'approved' AND f.visibility = 'public'
          ORDER BY f.featured DESC, f.reviewed_at DESC
        `).all();
      } else {
        auth.requirePermissionForUser(user, 'feedback.own.view');
        rows = db.prepare(`
          SELECT f.*, a.title AS activity_title, u.display_name AS user_name,
                 reviewer.display_name AS reviewer_name
          FROM feedback f
          JOIN activities a ON a.id = f.activity_id
          JOIN users u ON u.id = f.user_id
          LEFT JOIN users reviewer ON reviewer.id = f.reviewer_id
          WHERE f.user_id = ?
          ORDER BY f.submitted_at DESC
        `).all(user.id);
      }

      const filtered = rows.filter((row) => {
        if (status && row.status !== status) return false;
        if (activityId && Number(row.activity_id) !== activityId) return false;
        if (featured && !row.featured) return false;
        return canReadFeedback(db, user, row);
      });
      sendJson(res, 200, {
        items: filtered.map((row) => serializeFeedback(row, {
          attachments: getAttachments(db, row.id),
        })),
      });
      return true;
    }

    if (url.pathname === '/api/feedback' && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'feedback.create');
      const input = await readJson(req, 2_000_000);
      const activityId = parsePositiveInt(input.activityId, '活动 ID');
      const activity = db.prepare('SELECT * FROM activities WHERE id = ?').get(activityId);
      if (!activity) throw new HttpError(404, '活动不存在', 'not_found');
      if (activity.status !== 'completed') {
        throw new HttpError(409, '活动结束后才能提交反馈', 'activity_not_completed');
      }
      const existing = db.prepare(
        'SELECT id FROM feedback WHERE activity_id = ? AND user_id = ?',
      ).get(activityId, user.id);
      if (existing) {
        throw new HttpError(409, '该活动已有反馈，可在个人中心查看', 'feedback_exists', {
          feedbackId: Number(existing.id),
        });
      }
      const data = validateFeedbackInput(input);
      const timestamp = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO feedback
          (activity_id, user_id, participation_date, problems, observations,
           communication_difficulties, learnings, new_understanding, suggestions,
           additional, status, visibility, submitted_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', 'private', ?)
      `).run(
        activityId,
        user.id,
        data.participationDate,
        data.problems,
        data.observations,
        data.communicationDifficulties,
        data.learnings,
        data.newUnderstanding,
        data.suggestions,
        data.additional,
        timestamp,
      );
      const id = Number(result.lastInsertRowid);
      recordAudit(db, req, user, 'feedback.create', 'feedback', id, {
        activityId,
      });
      sendJson(res, 201, {
        item: serializeFeedback(getFeedbackRow(db, id), {
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    const feedbackMatch = url.pathname.match(/^\/api\/feedback\/(\d+)$/);
    if (feedbackMatch && req.method === 'GET') {
      const user = auth.requireUser(req);
      const id = parsePositiveInt(feedbackMatch[1], '反馈 ID');
      const row = getFeedbackRow(db, id);
      if (!row) throw new HttpError(404, '反馈不存在', 'not_found');
      if (!canReadFeedback(db, user, row)) {
        throw new HttpError(403, '当前账号不能查看此反馈', 'content_forbidden');
      }
      sendJson(res, 200, {
        item: serializeFeedback(row, { attachments: getAttachments(db, id) }),
      });
      return true;
    }

    if (feedbackMatch && req.method === 'PATCH') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'feedback.create');
      const id = parsePositiveInt(feedbackMatch[1], '反馈 ID');
      const existing = getFeedbackRow(db, id);
      if (!existing) throw new HttpError(404, '反馈不存在', 'not_found');
      if (!canEditFeedback(existing, user)) {
        throw new HttpError(403, '当前反馈状态不允许修改', 'feedback_locked');
      }
      const input = await readJson(req, 2_000_000);
      const data = validateFeedbackInput({ ...existing, ...input });
      db.prepare(`
        UPDATE feedback
        SET participation_date = ?, problems = ?, observations = ?,
            communication_difficulties = ?, learnings = ?, new_understanding = ?,
            suggestions = ?, additional = ?, status = 'pending', submitted_at = ?
        WHERE id = ?
      `).run(
        data.participationDate,
        data.problems,
        data.observations,
        data.communicationDifficulties,
        data.learnings,
        data.newUnderstanding,
        data.suggestions,
        data.additional,
        new Date().toISOString(),
        id,
      );
      recordAudit(db, req, user, 'feedback.resubmit', 'feedback', id);
      sendJson(res, 200, {
        item: serializeFeedback(getFeedbackRow(db, id), {
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    const reviewMatch = url.pathname.match(/^\/api\/feedback\/(\d+)\/review$/);
    if (reviewMatch && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'feedback.review');
      const id = parsePositiveInt(reviewMatch[1], '反馈 ID');
      const existing = getFeedbackRow(db, id);
      if (!existing) throw new HttpError(404, '反馈不存在', 'not_found');
      const input = await readJson(req);
      const status = requireOneOf(input.status, '审核状态', REVIEW_STATUSES);
      const visibility = status === 'approved'
        ? requireOneOf(input.visibility || 'private', '公开状态', ['private', 'public'])
        : 'private';
      const reviewNote = optionalString(input.reviewNote, '审核说明', { max: 2000 });
      const adminReply = optionalString(input.adminReply, '管理员回复', { max: 3000 });
      const tags = normalizeTags(input.tags);
      const featured = status === 'approved' && Boolean(input.featured);
      const timestamp = new Date().toISOString();
      db.prepare(`
        UPDATE feedback
        SET status = ?, visibility = ?, reviewer_id = ?, review_note = ?,
            admin_reply = ?, tags = ?, featured = ?, reviewed_at = ?
        WHERE id = ?
      `).run(
        status,
        visibility,
        user.id,
        reviewNote,
        adminReply,
        tags,
        featured ? 1 : 0,
        timestamp,
        id,
      );
      recordAudit(db, req, user, 'feedback.review', 'feedback', id, {
        status,
        visibility,
        featured,
      });
      sendJson(res, 200, {
        item: serializeFeedback(getFeedbackRow(db, id), {
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    const convertMatch = url.pathname.match(/^\/api\/feedback\/(\d+)\/convert$/);
    if (convertMatch && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'feedback.review');
      auth.requirePermissionForUser(user, 'knowledge.create');
      const id = parsePositiveInt(convertMatch[1], '反馈 ID');
      const feedback = getFeedbackRow(db, id);
      if (!feedback) throw new HttpError(404, '反馈不存在', 'not_found');
      if (feedback.status !== 'approved') {
        throw new HttpError(409, '反馈审核通过后才能转为知识草稿', 'feedback_not_approved');
      }
      const input = await readJson(req);
      const title = requireString(
        input.title || `服务复盘：${feedback.activity_title}`,
        '知识标题',
        { min: 2, max: 120 },
      );
      const category = requireString(input.category || '服务案例', '分类', {
        min: 2,
        max: 40,
      });
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
      const content = [
        `原活动：${feedback.activity_title}`,
        `参与时间：${feedback.participation_date}`,
        '',
        '【客观观察】',
        feedback.observations || '未记录',
        '',
        '【遇到的问题】',
        feedback.problems || '未记录',
        '',
        '【沟通与互动困难】',
        feedback.communication_difficulties || '未记录',
        '',
        '【学习收获】',
        feedback.learnings || '未记录',
        '',
        '【新的认识】',
        feedback.new_understanding || '未记录',
        '',
        '【改进建议】',
        feedback.suggestions || '未记录',
        '',
        '【整理说明】',
        '本内容由活动反馈转为知识草稿，编辑发布前必须完成匿名化、事实核验与专业审核。个人感受和主观判断不得直接作为专业知识传播。',
      ].join('\n');
      const timestamp = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO knowledge
          (title, summary, content, category, tags, visibility, status,
           author_id, created_at, updated_at, source_type, source_id)
        VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?, ?, 'feedback', ?)
      `).run(
        title,
        `由活动反馈「${feedback.activity_title}」整理的知识草稿，待匿名化与审核。`,
        content,
        category,
        feedback.tags || '',
        visibility,
        user.id,
        timestamp,
        timestamp,
        id,
      );
      const knowledgeId = Number(result.lastInsertRowid);
      recordAudit(db, req, user, 'feedback.convert', 'feedback', id, {
        knowledgeId,
      });
      sendJson(res, 201, { knowledgeId, status: 'draft' });
      return true;
    }

    return false;
  };
}
