import { getClientIp } from './http.js';

export function recordAudit(db, req, actor, action, entityType, entityId, details = {}) {
  db.prepare(`
    INSERT INTO audit_logs
      (actor_id, action, entity_type, entity_id, details, ip, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(
    actor?.id || null,
    action,
    entityType,
    entityId || null,
    JSON.stringify(details),
    getClientIp(req),
    new Date().toISOString(),
  );
}

export function listAuditLogs(db, limit = 100) {
  return db.prepare(`
    SELECT l.*, u.display_name AS actor_name, u.username AS actor_username
    FROM audit_logs l
    LEFT JOIN users u ON u.id = l.actor_id
    ORDER BY l.id DESC
    LIMIT ?
  `).all(limit).map((row) => ({
    id: Number(row.id),
    actorId: row.actor_id ? Number(row.actor_id) : null,
    actorName: row.actor_name || '系统',
    actorUsername: row.actor_username || '',
    action: row.action,
    entityType: row.entity_type,
    entityId: row.entity_id ? Number(row.entity_id) : null,
    details: safeJson(row.details),
    ip: row.ip,
    createdAt: row.created_at,
  }));
}

function safeJson(value) {
  try {
    return JSON.parse(value);
  } catch {
    return {};
  }
}
