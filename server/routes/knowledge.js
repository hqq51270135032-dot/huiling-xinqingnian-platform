import {
  assertSameOrigin,
  HttpError,
  normalizeTags,
  optionalString,
  parsePositiveInt,
  readJson,
  requireOneOf,
  requireString,
  sendJson,
} from '../http.js';
import {
  assertCanReadKnowledge,
  canManageKnowledge,
  canReadKnowledge,
  hasPermission,
} from '../access.js';
import { recordAudit } from '../audit.js';
import {
  serializeAttachment,
  serializeKnowledge,
} from '../serializers.js';

const VISIBILITIES = ['public', 'internal', 'restricted'];
const STATUSES = ['draft', 'pending', 'published', 'archived'];

function getAttachments(db, targetType, targetId) {
  return db.prepare(`
    SELECT * FROM attachments
    WHERE target_type = ? AND target_id = ?
    ORDER BY id
  `).all(targetType, targetId).map(serializeAttachment);
}

function getKnowledgeRow(db, id) {
  return db.prepare(`
    SELECT k.*,
           author.display_name AS author_name,
           reviewer.display_name AS reviewer_name
    FROM knowledge k
    JOIN users author ON author.id = k.author_id
    LEFT JOIN users reviewer ON reviewer.id = k.reviewer_id
    WHERE k.id = ?
  `).get(id);
}

function getAclUserIds(db, knowledgeId) {
  return db.prepare(
    'SELECT user_id FROM knowledge_acl WHERE knowledge_id = ? ORDER BY user_id',
  ).all(knowledgeId).map((row) => Number(row.user_id));
}

function ensureVisibilityPermission(user, visibility) {
  if (visibility === 'internal' && !hasPermission(user, 'knowledge.internal.view')) {
    throw new HttpError(403, '当前账号不能发布内部资料', 'permission_denied');
  }
  if (visibility === 'restricted' && !hasPermission(user, 'knowledge.restricted.view')) {
    throw new HttpError(403, '当前账号不能发布受限案例', 'permission_denied');
  }
}

function validateKnowledgeInput(input, partial = false) {
  const data = {};
  if (!partial || input.title !== undefined) {
    data.title = requireString(input.title, '标题', { min: 2, max: 120 });
  }
  if (!partial || input.summary !== undefined) {
    data.summary = optionalString(input.summary, '摘要', { max: 300 });
  }
  if (!partial || input.content !== undefined) {
    data.content = requireString(input.content, '正文', { min: 10, max: 80000 });
  }
  if (!partial || input.category !== undefined) {
    data.category = requireString(input.category, '分类', { min: 2, max: 40 });
  }
  if (!partial || input.tags !== undefined) {
    data.tags = normalizeTags(input.tags);
  }
  if (!partial || input.visibility !== undefined) {
    data.visibility = requireOneOf(input.visibility, '可见范围', VISIBILITIES);
  }
  if (!partial || input.status !== undefined) {
    data.status = requireOneOf(input.status || 'draft', '状态', STATUSES);
  }
  return data;
}

export function createKnowledgeRoutes({ db, auth }) {
  return async function handle(req, res, url) {
    if (url.pathname === '/api/knowledge' && req.method === 'GET') {
      const user = auth.requireUser(req);
      const scope = url.searchParams.get('scope') || 'library';
      const manageScope = scope === 'manage';
      if (manageScope && !canManageKnowledge(user) && !hasPermission(user, 'knowledge.review')) {
        throw new HttpError(403, '没有知识管理权限', 'permission_denied');
      }

      const search = String(url.searchParams.get('search') || '').trim();
      const category = String(url.searchParams.get('category') || '').trim();
      const visibility = String(url.searchParams.get('visibility') || '').trim();
      const status = String(url.searchParams.get('status') || '').trim();
      const favoritesOnly = url.searchParams.get('favorites') === '1';
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 50, 1), 100);

      const rows = db.prepare(`
        SELECT k.*,
               author.display_name AS author_name,
               reviewer.display_name AS reviewer_name,
               f.created_at AS favorite_at,
               rh.last_read_at,
               rh.read_count
        FROM knowledge k
        JOIN users author ON author.id = k.author_id
        LEFT JOIN users reviewer ON reviewer.id = k.reviewer_id
        LEFT JOIN favorites f ON f.knowledge_id = k.id AND f.user_id = ?
        LEFT JOIN reading_history rh ON rh.knowledge_id = k.id AND rh.user_id = ?
        ORDER BY COALESCE(k.published_at, k.updated_at) DESC, k.id DESC
      `).all(user.id, user.id);

      const filtered = rows.filter((row) => {
        if (!canReadKnowledge(db, user, row)) return false;
        if (!manageScope && row.status !== 'published') return false;
        if (search) {
          const haystack = `${row.title} ${row.summary} ${row.content} ${row.category} ${row.tags}`.toLowerCase();
          if (!haystack.includes(search.toLowerCase())) return false;
        }
        if (category && row.category !== category) return false;
        if (visibility && row.visibility !== visibility) return false;
        if (status && row.status !== status) return false;
        if (favoritesOnly && !row.favorite_at) return false;
        return true;
      }).slice(0, limit);

      const categories = [...new Set(
        rows
          .filter((row) => canReadKnowledge(db, user, row) && row.status === 'published')
          .map((row) => row.category),
      )];

      sendJson(res, 200, {
        items: filtered.map((row) => serializeKnowledge(row, {
          isFavorite: Boolean(row.favorite_at),
          readCount: row.read_count,
          lastReadAt: row.last_read_at,
          attachments: getAttachments(db, 'knowledge', row.id),
          aclUserIds: manageScope ? getAclUserIds(db, row.id) : [],
        })),
        total: filtered.length,
        categories,
      });
      return true;
    }

    const knowledgeMatch = url.pathname.match(/^\/api\/knowledge\/(\d+)$/);
    if (knowledgeMatch && req.method === 'GET') {
      const user = auth.requireUser(req);
      const id = parsePositiveInt(knowledgeMatch[1], '知识 ID');
      const row = getKnowledgeRow(db, id);
      if (!row) throw new HttpError(404, '知识内容不存在', 'not_found');
      assertCanReadKnowledge(db, user, row);

      if (row.status === 'published') {
        db.prepare('UPDATE knowledge SET view_count = view_count + 1 WHERE id = ?').run(id);
        row.view_count = Number(row.view_count) + 1;
      }
      const timestamp = new Date().toISOString();
      db.prepare(`
        INSERT INTO reading_history (user_id, knowledge_id, last_read_at, read_count)
        VALUES (?, ?, ?, 1)
        ON CONFLICT(user_id, knowledge_id) DO UPDATE SET
          last_read_at = excluded.last_read_at,
          read_count = reading_history.read_count + 1
      `).run(user.id, id, timestamp);

      const favorite = db.prepare(
        'SELECT 1 FROM favorites WHERE user_id = ? AND knowledge_id = ?',
      ).get(user.id, id);
      const history = db.prepare(
        'SELECT * FROM reading_history WHERE user_id = ? AND knowledge_id = ?',
      ).get(user.id, id);
      sendJson(res, 200, {
        item: serializeKnowledge(row, {
          isFavorite: Boolean(favorite),
          readCount: history?.read_count || 1,
          lastReadAt: history?.last_read_at || timestamp,
          attachments: getAttachments(db, 'knowledge', id),
          aclUserIds: canManageKnowledge(user) ? getAclUserIds(db, id) : [],
        }),
      });
      return true;
    }

    if (url.pathname === '/api/knowledge' && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'knowledge.create');
      const input = await readJson(req, 2_000_000);
      const data = validateKnowledgeInput(input);
      ensureVisibilityPermission(user, data.visibility);
      if (data.status === 'published' && !hasPermission(user, 'knowledge.review')) {
        data.status = 'pending';
      }

      const timestamp = new Date().toISOString();
      const publishedAt = data.status === 'published' ? timestamp : null;
      const reviewerId = data.status === 'published' ? user.id : null;
      const reviewedAt = data.status === 'published' ? timestamp : null;
      const result = db.prepare(`
        INSERT INTO knowledge
          (title, summary, content, category, tags, visibility, status,
           author_id, reviewer_id, reviewed_at, created_at, updated_at, published_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.title,
        data.summary,
        data.content,
        data.category,
        data.tags,
        data.visibility,
        data.status,
        user.id,
        reviewerId,
        reviewedAt,
        timestamp,
        timestamp,
        publishedAt,
      );
      const id = Number(result.lastInsertRowid);
      updateKnowledgeAcl(db, user, id, input.aclUserIds, data.visibility);
      recordAudit(db, req, user, 'knowledge.create', 'knowledge', id, {
        title: data.title,
        visibility: data.visibility,
        status: data.status,
      });
      sendJson(res, 201, {
        item: serializeKnowledge(getKnowledgeRow(db, id), {
          attachments: getAttachments(db, 'knowledge', id),
          aclUserIds: getAclUserIds(db, id),
        }),
      });
      return true;
    }

    if (knowledgeMatch && req.method === 'PATCH') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'knowledge.edit');
      const id = parsePositiveInt(knowledgeMatch[1], '知识 ID');
      const existing = getKnowledgeRow(db, id);
      if (!existing) throw new HttpError(404, '知识内容不存在', 'not_found');
      const input = await readJson(req, 2_000_000);
      const data = validateKnowledgeInput(input, true);
      if (data.visibility) ensureVisibilityPermission(user, data.visibility);
      const visibility = data.visibility || existing.visibility;
      const status = data.status || existing.status;
      if (status === 'published' && existing.status !== 'published' && !hasPermission(user, 'knowledge.review')) {
        throw new HttpError(403, '没有审核发布权限', 'permission_denied');
      }

      const timestamp = new Date().toISOString();
      const publishedAt =
        status === 'published'
          ? existing.published_at || timestamp
          : existing.published_at;
      db.prepare(`
        UPDATE knowledge
        SET title = ?, summary = ?, content = ?, category = ?, tags = ?,
            visibility = ?, status = ?, updated_at = ?, published_at = ?,
            reviewer_id = ?, reviewed_at = ?
        WHERE id = ?
      `).run(
        data.title ?? existing.title,
        data.summary ?? existing.summary,
        data.content ?? existing.content,
        data.category ?? existing.category,
        data.tags ?? existing.tags,
        visibility,
        status,
        timestamp,
        publishedAt,
        status === 'published' ? (existing.reviewer_id || user.id) : existing.reviewer_id,
        status === 'published' ? (existing.reviewed_at || timestamp) : existing.reviewed_at,
        id,
      );
      if (input.aclUserIds !== undefined) {
        updateKnowledgeAcl(db, user, id, input.aclUserIds, visibility);
      }
      recordAudit(db, req, user, 'knowledge.update', 'knowledge', id, {
        title: data.title ?? existing.title,
        status,
      });
      sendJson(res, 200, {
        item: serializeKnowledge(getKnowledgeRow(db, id), {
          attachments: getAttachments(db, 'knowledge', id),
          aclUserIds: getAclUserIds(db, id),
        }),
      });
      return true;
    }

    if (knowledgeMatch && req.method === 'DELETE') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'knowledge.delete');
      const id = parsePositiveInt(knowledgeMatch[1], '知识 ID');
      const existing = getKnowledgeRow(db, id);
      if (!existing) throw new HttpError(404, '知识内容不存在', 'not_found');
      db.prepare('DELETE FROM knowledge WHERE id = ?').run(id);
      recordAudit(db, req, user, 'knowledge.delete', 'knowledge', id, {
        title: existing.title,
      });
      sendJson(res, 200, { ok: true });
      return true;
    }

    const reviewMatch = url.pathname.match(/^\/api\/knowledge\/(\d+)\/review$/);
    if (reviewMatch && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'knowledge.review');
      const id = parsePositiveInt(reviewMatch[1], '知识 ID');
      const existing = getKnowledgeRow(db, id);
      if (!existing) throw new HttpError(404, '知识内容不存在', 'not_found');
      const input = await readJson(req);
      const decision = requireOneOf(input.decision, '审核决定', ['published', 'draft', 'archived']);
      const timestamp = new Date().toISOString();
      db.prepare(`
        UPDATE knowledge
        SET status = ?, reviewer_id = ?, reviewed_at = ?, updated_at = ?,
            published_at = CASE WHEN ? = 'published' THEN COALESCE(published_at, ?) ELSE published_at END
        WHERE id = ?
      `).run(decision, user.id, timestamp, timestamp, decision, timestamp, id);
      recordAudit(db, req, user, 'knowledge.review', 'knowledge', id, {
        decision,
        note: optionalString(input.note, '审核说明', { max: 1000 }),
      });
      sendJson(res, 200, {
        item: serializeKnowledge(getKnowledgeRow(db, id), {
          attachments: getAttachments(db, 'knowledge', id),
          aclUserIds: getAclUserIds(db, id),
        }),
      });
      return true;
    }

    const favoriteMatch = url.pathname.match(/^\/api\/knowledge\/(\d+)\/favorite$/);
    if (favoriteMatch && ['POST', 'DELETE'].includes(req.method)) {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'knowledge.favorite');
      const id = parsePositiveInt(favoriteMatch[1], '知识 ID');
      const row = getKnowledgeRow(db, id);
      if (!row) throw new HttpError(404, '知识内容不存在', 'not_found');
      assertCanReadKnowledge(db, user, row);
      if (req.method === 'POST') {
        db.prepare(`
          INSERT OR IGNORE INTO favorites (user_id, knowledge_id, created_at)
          VALUES (?, ?, ?)
        `).run(user.id, id, new Date().toISOString());
      } else {
        db.prepare('DELETE FROM favorites WHERE user_id = ? AND knowledge_id = ?')
          .run(user.id, id);
      }
      sendJson(res, 200, { favorite: req.method === 'POST' });
      return true;
    }

    const aclMatch = url.pathname.match(/^\/api\/knowledge\/(\d+)\/acl$/);
    if (aclMatch && req.method === 'PUT') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'knowledge.edit');
      const id = parsePositiveInt(aclMatch[1], '知识 ID');
      const row = getKnowledgeRow(db, id);
      if (!row) throw new HttpError(404, '知识内容不存在', 'not_found');
      if (row.visibility !== 'restricted') {
        throw new HttpError(400, '仅受限内容需要配置个案授权', 'validation_error');
      }
      const input = await readJson(req);
      updateKnowledgeAcl(db, user, id, input.userIds, row.visibility);
      recordAudit(db, req, user, 'knowledge.acl_update', 'knowledge', id, {
        userIds: normalizeUserIds(input.userIds),
      });
      sendJson(res, 200, { userIds: getAclUserIds(db, id) });
      return true;
    }

    return false;
  };
}

function normalizeUserIds(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.map(Number).filter((id) => Number.isInteger(id) && id > 0))];
}

function updateKnowledgeAcl(db, actor, knowledgeId, userIds, visibility) {
  if (visibility !== 'restricted') {
    if (userIds !== undefined) {
      db.prepare('DELETE FROM knowledge_acl WHERE knowledge_id = ?').run(knowledgeId);
    }
    return;
  }
  if (userIds === undefined) return;
  const ids = normalizeUserIds(userIds);
  const existingIds = db.prepare(
    'SELECT user_id FROM knowledge_acl WHERE knowledge_id = ?',
  ).all(knowledgeId).map((row) => Number(row.user_id));
  for (const userId of existingIds) {
    if (!ids.includes(userId)) {
      db.prepare('DELETE FROM knowledge_acl WHERE knowledge_id = ? AND user_id = ?')
        .run(knowledgeId, userId);
    }
  }
  const insert = db.prepare(`
    INSERT OR IGNORE INTO knowledge_acl
      (knowledge_id, user_id, granted_by, created_at)
    VALUES (?, ?, ?, ?)
  `);
  for (const userId of ids) {
    const targetUser = db.prepare("SELECT id FROM users WHERE id = ? AND status = 'active'").get(userId);
    if (targetUser) insert.run(knowledgeId, userId, actor.id, new Date().toISOString());
  }
}
