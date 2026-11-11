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
  canReadCommunityPost,
  hasPermission,
} from '../access.js';
import { recordAudit } from '../audit.js';
import {
  serializeAttachment,
  serializePost,
} from '../serializers.js';

function getAttachments(db, postId) {
  return db.prepare(`
    SELECT * FROM attachments
    WHERE target_type = 'community' AND target_id = ?
    ORDER BY id
  `).all(postId).map(serializeAttachment);
}

function getPostRow(db, id) {
  return db.prepare(`
    SELECT p.*,
           u.display_name AS user_name,
           a.title AS activity_title,
           reviewer.display_name AS reviewer_name,
           (SELECT COUNT(*) FROM comments c
            WHERE c.post_id = p.id AND c.status = 'published') AS comment_count
    FROM community_posts p
    JOIN users u ON u.id = p.user_id
    LEFT JOIN activities a ON a.id = p.activity_id
    LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id
    WHERE p.id = ?
  `).get(id);
}

function getComments(db, postId) {
  return db.prepare(`
    SELECT c.*, u.display_name AS user_name
    FROM comments c
    JOIN users u ON u.id = c.user_id
    WHERE c.post_id = ? AND c.status = 'published'
    ORDER BY c.created_at ASC
  `).all(postId).map((row) => ({
    id: Number(row.id),
    userId: Number(row.user_id),
    userName: row.user_name,
    content: row.content,
    createdAt: row.created_at,
  }));
}

export function createCommunityRoutes({ db, auth }) {
  return async function handle(req, res, url) {
    if (url.pathname === '/api/community' && req.method === 'GET') {
      const user = auth.requirePermission(req, 'community.view');
      const scope = url.searchParams.get('scope') || 'public';
      const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
      const category = String(url.searchParams.get('category') || '').trim();
      let rows;
      if (scope === 'review') {
        auth.requirePermissionForUser(user, 'community.moderate');
        rows = db.prepare(`
          SELECT p.*, u.display_name AS user_name,
                 a.title AS activity_title,
                 reviewer.display_name AS reviewer_name,
                 (SELECT COUNT(*) FROM comments c
                  WHERE c.post_id = p.id AND c.status = 'published') AS comment_count
          FROM community_posts p
          JOIN users u ON u.id = p.user_id
          LEFT JOIN activities a ON a.id = p.activity_id
          LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id
          ORDER BY CASE p.status WHEN 'pending' THEN 0 ELSE 1 END,
                   p.created_at DESC
        `).all();
      } else if (scope === 'mine') {
        rows = db.prepare(`
          SELECT p.*, u.display_name AS user_name,
                 a.title AS activity_title,
                 reviewer.display_name AS reviewer_name,
                 (SELECT COUNT(*) FROM comments c
                  WHERE c.post_id = p.id AND c.status = 'published') AS comment_count
          FROM community_posts p
          JOIN users u ON u.id = p.user_id
          LEFT JOIN activities a ON a.id = p.activity_id
          LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id
          WHERE p.user_id = ?
          ORDER BY p.created_at DESC
        `).all(user.id);
      } else {
        rows = db.prepare(`
          SELECT p.*, u.display_name AS user_name,
                 a.title AS activity_title,
                 reviewer.display_name AS reviewer_name,
                 (SELECT COUNT(*) FROM comments c
                  WHERE c.post_id = p.id AND c.status = 'published') AS comment_count
          FROM community_posts p
          JOIN users u ON u.id = p.user_id
          LEFT JOIN activities a ON a.id = p.activity_id
          LEFT JOIN users reviewer ON reviewer.id = p.reviewer_id
          WHERE p.status = 'published'
          ORDER BY p.created_at DESC
        `).all();
        rows = rows.filter((row) => canReadCommunityPost(user, row));
      }

      const filtered = rows.filter((row) => {
        if (search && !`${row.title} ${row.content}`.toLowerCase().includes(search)) return false;
        if (category && row.category !== category) return false;
        return true;
      });
      sendJson(res, 200, {
        items: filtered.map((row) => serializePost(row, {
          attachments: getAttachments(db, row.id),
          comments: getComments(db, row.id),
        })),
      });
      return true;
    }

    if (url.pathname === '/api/community' && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'community.create');
      const input = await readJson(req, 2_000_000);
      const title = requireString(input.title, '标题', { min: 4, max: 120 });
      const content = requireString(input.content, '正文', { min: 10, max: 20000 });
      const category = requireString(input.category || '经验分享', '分类', {
        min: 2,
        max: 40,
      });
      let activityId = null;
      if (input.activityId) {
        activityId = parsePositiveInt(input.activityId, '活动 ID');
        const activity = db.prepare('SELECT id FROM activities WHERE id = ?').get(activityId);
        if (!activity) throw new HttpError(400, '关联活动不存在', 'validation_error');
      }
      const timestamp = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO community_posts
          (user_id, activity_id, title, content, category, status, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'pending', ?, ?)
      `).run(user.id, activityId, title, content, category, timestamp, timestamp);
      const id = Number(result.lastInsertRowid);
      recordAudit(db, req, user, 'community.create', 'community_post', id, {
        title,
        activityId,
      });
      sendJson(res, 201, {
        item: serializePost(getPostRow(db, id), {
          attachments: getAttachments(db, id),
          comments: [],
        }),
      });
      return true;
    }

    const postMatch = url.pathname.match(/^\/api\/community\/(\d+)$/);
    if (postMatch && req.method === 'GET') {
      const user = auth.requirePermission(req, 'community.view');
      const id = parsePositiveInt(postMatch[1], '社群内容 ID');
      const row = getPostRow(db, id);
      if (!row) throw new HttpError(404, '社群内容不存在', 'not_found');
      if (!canReadCommunityPost(user, row)) {
        throw new HttpError(403, '当前账号不能查看此内容', 'content_forbidden');
      }
      sendJson(res, 200, {
        item: serializePost(row, {
          attachments: getAttachments(db, id),
          comments: getComments(db, id),
        }),
      });
      return true;
    }

    const reviewMatch = url.pathname.match(/^\/api\/community\/(\d+)\/review$/);
    if (reviewMatch && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'community.moderate');
      const id = parsePositiveInt(reviewMatch[1], '社群内容 ID');
      const existing = getPostRow(db, id);
      if (!existing) throw new HttpError(404, '社群内容不存在', 'not_found');
      const input = await readJson(req);
      const status = requireOneOf(input.status, '审核状态', ['published', 'rejected', 'hidden']);
      const note = optionalString(input.reviewNote, '审核说明', { max: 2000 });
      const timestamp = new Date().toISOString();
      db.prepare(`
        UPDATE community_posts
        SET status = ?, review_note = ?, reviewer_id = ?, reviewed_at = ?, updated_at = ?
        WHERE id = ?
      `).run(status, note, user.id, timestamp, timestamp, id);
      recordAudit(db, req, user, 'community.review', 'community_post', id, {
        status,
      });
      sendJson(res, 200, {
        item: serializePost(getPostRow(db, id), {
          attachments: getAttachments(db, id),
          comments: getComments(db, id),
        }),
      });
      return true;
    }

    const commentMatch = url.pathname.match(/^\/api\/community\/(\d+)\/comments$/);
    if (commentMatch && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'community.view');
      const id = parsePositiveInt(commentMatch[1], '社群内容 ID');
      const post = getPostRow(db, id);
      if (!post) throw new HttpError(404, '社群内容不存在', 'not_found');
      if (!canReadCommunityPost(user, post) || post.status !== 'published') {
        throw new HttpError(403, '当前内容不可评论', 'content_forbidden');
      }
      const input = await readJson(req);
      const content = requireString(input.content, '评论内容', { min: 2, max: 2000 });
      db.prepare(`
        INSERT INTO comments (post_id, user_id, content, status, created_at)
        VALUES (?, ?, ?, 'published', ?)
      `).run(id, user.id, content, new Date().toISOString());
      recordAudit(db, req, user, 'community.comment', 'community_post', id);
      sendJson(res, 201, { comments: getComments(db, id) });
      return true;
    }

    return false;
  };
}
