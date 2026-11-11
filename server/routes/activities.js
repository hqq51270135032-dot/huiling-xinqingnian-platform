import {
  assertSameOrigin,
  HttpError,
  optionalString,
  parseDate,
  parsePositiveInt,
  readJson,
  requireOneOf,
  requireString,
  sendJson,
} from '../http.js';
import { hasPermission } from '../access.js';
import { recordAudit } from '../audit.js';
import {
  serializeActivity,
  serializeAttachment,
} from '../serializers.js';

const STATUSES = ['draft', 'published', 'completed', 'cancelled'];

function getAttachments(db, activityId) {
  return db.prepare(`
    SELECT * FROM attachments
    WHERE target_type = 'activity' AND target_id = ?
    ORDER BY id
  `).all(activityId).map(serializeAttachment);
}

function getActivityRow(db, id) {
  return db.prepare(`
    SELECT a.*,
           creator.display_name AS creator_name,
           (SELECT COUNT(*) FROM activity_participants p
            WHERE p.activity_id = a.id AND p.status = 'joined') AS participant_count
    FROM activities a
    JOIN users creator ON creator.id = a.created_by
    WHERE a.id = ?
  `).get(id);
}

function getActivityPersonalState(db, userId, activityId) {
  const joined = db.prepare(`
    SELECT 1 FROM activity_participants
    WHERE activity_id = ? AND user_id = ? AND status = 'joined'
  `).get(activityId, userId);
  const feedback = db.prepare(`
    SELECT id FROM feedback WHERE activity_id = ? AND user_id = ?
    ORDER BY id DESC LIMIT 1
  `).get(activityId, userId);
  return { isJoined: Boolean(joined), myFeedbackId: feedback?.id || null };
}

function validateActivityInput(input, partial = false) {
  const data = {};
  if (!partial || input.title !== undefined) {
    data.title = requireString(input.title, '活动名称', { min: 2, max: 100 });
  }
  if (!partial || input.startsAt !== undefined) {
    data.startsAt = parseDate(input.startsAt, '开始时间');
  }
  if (!partial || input.endsAt !== undefined) {
    data.endsAt = parseDate(input.endsAt, '结束时间');
  }
  if (!partial || input.location !== undefined) {
    data.location = requireString(input.location, '活动地点', { min: 2, max: 120 });
  }
  if (!partial || input.introduction !== undefined) {
    data.introduction = requireString(input.introduction, '活动介绍', { min: 5, max: 3000 });
  }
  if (!partial || input.content !== undefined) {
    data.content = requireString(input.content, '活动内容', { min: 5, max: 10000 });
  }
  if (!partial || input.requirements !== undefined) {
    data.requirements = optionalString(input.requirements, '参与要求', { max: 3000 });
  }
  if (!partial || input.notes !== undefined) {
    data.notes = optionalString(input.notes, '注意事项', { max: 3000 });
  }
  if (!partial || input.status !== undefined) {
    data.status = requireOneOf(input.status || 'draft', '活动状态', STATUSES);
  }
  return data;
}

export function createActivityRoutes({ db, auth }) {
  return async function handle(req, res, url) {
    if (url.pathname === '/api/activities' && req.method === 'GET') {
      const user = auth.requirePermission(req, 'activity.view');
      const scope = url.searchParams.get('scope') || 'volunteer';
      const manageScope = scope === 'manage';
      if (manageScope) auth.requirePermissionForUser(user, 'activity.manage');
      const status = String(url.searchParams.get('status') || '').trim();
      const search = String(url.searchParams.get('search') || '').trim().toLowerCase();

      const rows = db.prepare(`
        SELECT a.*,
               creator.display_name AS creator_name,
               (SELECT COUNT(*) FROM activity_participants p
                WHERE p.activity_id = a.id AND p.status = 'joined') AS participant_count
        FROM activities a
        JOIN users creator ON creator.id = a.created_by
        ORDER BY a.starts_at DESC, a.id DESC
      `).all();

      const filtered = rows.filter((row) => {
        if (!manageScope && !['published', 'completed'].includes(row.status)) return false;
        if (status && row.status !== status) return false;
        if (search && !`${row.title} ${row.location} ${row.introduction}`.toLowerCase().includes(search)) {
          return false;
        }
        return true;
      });

      sendJson(res, 200, {
        items: filtered.map((row) => {
          const personal = getActivityPersonalState(db, user.id, row.id);
          return serializeActivity(row, {
            ...personal,
            attachments: getAttachments(db, row.id),
          });
        }),
      });
      return true;
    }

    const activityMatch = url.pathname.match(/^\/api\/activities\/(\d+)$/);
    if (activityMatch && req.method === 'GET') {
      const user = auth.requirePermission(req, 'activity.view');
      const id = parsePositiveInt(activityMatch[1], '活动 ID');
      const row = getActivityRow(db, id);
      if (!row) throw new HttpError(404, '活动不存在', 'not_found');
      const canManage = hasPermission(user, 'activity.manage');
      if (!canManage && !['published', 'completed'].includes(row.status)) {
        throw new HttpError(403, '当前账号不能查看此活动', 'content_forbidden');
      }
      const participants = canManage
        ? db.prepare(`
            SELECT u.id, u.phone, u.display_name, p.joined_at
            FROM activity_participants p
            JOIN users u ON u.id = p.user_id
            WHERE p.activity_id = ? AND p.status = 'joined'
            ORDER BY p.joined_at DESC
          `).all(id).map((item) => ({
            id: Number(item.id),
            phone: item.phone || '',
            displayName: item.display_name,
            joinedAt: item.joined_at,
          }))
        : [];
      sendJson(res, 200, {
        item: serializeActivity(row, {
          ...getActivityPersonalState(db, user.id, id),
          attachments: getAttachments(db, id),
        }),
        participants,
      });
      return true;
    }

    if (url.pathname === '/api/activities' && req.method === 'POST') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'activity.manage');
      const input = await readJson(req);
      const data = validateActivityInput(input);
      if (new Date(data.endsAt) <= new Date(data.startsAt)) {
        throw new HttpError(400, '结束时间必须晚于开始时间', 'validation_error', {
          field: 'endsAt',
        });
      }
      const timestamp = new Date().toISOString();
      const result = db.prepare(`
        INSERT INTO activities
          (title, starts_at, ends_at, location, introduction, content,
           requirements, notes, status, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        data.title,
        data.startsAt,
        data.endsAt,
        data.location,
        data.introduction,
        data.content,
        data.requirements,
        data.notes,
        data.status,
        user.id,
        timestamp,
        timestamp,
      );
      const id = Number(result.lastInsertRowid);
      recordAudit(db, req, user, 'activity.create', 'activity', id, {
        title: data.title,
        status: data.status,
      });
      sendJson(res, 201, {
        item: serializeActivity(getActivityRow(db, id), {
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    if (activityMatch && req.method === 'PATCH') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'activity.manage');
      const id = parsePositiveInt(activityMatch[1], '活动 ID');
      const existing = getActivityRow(db, id);
      if (!existing) throw new HttpError(404, '活动不存在', 'not_found');
      const input = await readJson(req);
      const data = validateActivityInput(input, true);
      const startsAt = data.startsAt || existing.starts_at;
      const endsAt = data.endsAt || existing.ends_at;
      if (new Date(endsAt) <= new Date(startsAt)) {
        throw new HttpError(400, '结束时间必须晚于开始时间', 'validation_error', {
          field: 'endsAt',
        });
      }
      db.prepare(`
        UPDATE activities
        SET title = ?, starts_at = ?, ends_at = ?, location = ?,
            introduction = ?, content = ?, requirements = ?, notes = ?,
            status = ?, updated_at = ?
        WHERE id = ?
      `).run(
        data.title ?? existing.title,
        startsAt,
        endsAt,
        data.location ?? existing.location,
        data.introduction ?? existing.introduction,
        data.content ?? existing.content,
        data.requirements ?? existing.requirements,
        data.notes ?? existing.notes,
        data.status ?? existing.status,
        new Date().toISOString(),
        id,
      );
      recordAudit(db, req, user, 'activity.update', 'activity', id, {
        title: data.title ?? existing.title,
        status: data.status ?? existing.status,
      });
      sendJson(res, 200, {
        item: serializeActivity(getActivityRow(db, id), {
          ...getActivityPersonalState(db, user.id, id),
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    if (activityMatch && req.method === 'DELETE') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'activity.manage');
      const id = parsePositiveInt(activityMatch[1], '活动 ID');
      const existing = getActivityRow(db, id);
      if (!existing) throw new HttpError(404, '活动不存在', 'not_found');
      const feedbackCount = db.prepare(
        'SELECT COUNT(*) AS count FROM feedback WHERE activity_id = ?',
      ).get(id).count;
      if (Number(feedbackCount) > 0) {
        throw new HttpError(409, '该活动已有反馈，不能删除，可改为取消活动', 'has_feedback');
      }
      db.prepare('DELETE FROM activities WHERE id = ?').run(id);
      recordAudit(db, req, user, 'activity.delete', 'activity', id, {
        title: existing.title,
      });
      sendJson(res, 200, { ok: true });
      return true;
    }

    const joinMatch = url.pathname.match(/^\/api\/activities\/(\d+)\/join$/);
    if (joinMatch && ['POST', 'DELETE'].includes(req.method)) {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'activity.join');
      const id = parsePositiveInt(joinMatch[1], '活动 ID');
      const activity = getActivityRow(db, id);
      if (!activity) throw new HttpError(404, '活动不存在', 'not_found');
      if (!['published', 'completed'].includes(activity.status)) {
        throw new HttpError(409, '当前活动状态不可报名', 'invalid_activity_status');
      }
      if (req.method === 'POST' && activity.status === 'completed') {
        throw new HttpError(409, '活动已结束，不能报名', 'activity_completed');
      }
      if (req.method === 'POST') {
        db.prepare(`
          INSERT INTO activity_participants (activity_id, user_id, status, joined_at)
          VALUES (?, ?, 'joined', ?)
          ON CONFLICT(activity_id, user_id) DO UPDATE SET
            status = 'joined', joined_at = excluded.joined_at
        `).run(id, user.id, new Date().toISOString());
      } else {
        db.prepare(`
          UPDATE activity_participants SET status = 'cancelled'
          WHERE activity_id = ? AND user_id = ?
        `).run(id, user.id);
      }
      recordAudit(
        db,
        req,
        user,
        req.method === 'POST' ? 'activity.join' : 'activity.leave',
        'activity',
        id,
      );
      sendJson(res, 200, {
        joined: req.method === 'POST',
        item: serializeActivity(getActivityRow(db, id), {
          ...getActivityPersonalState(db, user.id, id),
          attachments: getAttachments(db, id),
        }),
      });
      return true;
    }

    return false;
  };
}
