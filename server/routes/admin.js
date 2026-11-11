import {
  assertSameOrigin,
  HttpError,
  optionalString,
  parsePositiveInt,
  readJson,
  requireString,
  sendJson,
} from '../http.js';
import { recordAudit, listAuditLogs } from '../audit.js';

const ROLE_CODE_PATTERN = /^[a-z][a-z0-9_]{2,31}$/;

function getUserAdminRow(db, id) {
  const user = db.prepare(`
    SELECT id, username, display_name, email, phone, phone_verified_at, bio, status,
           created_at, updated_at, last_login_at
    FROM users WHERE id = ?
  `).get(id);
  if (!user) return null;
  const roles = db.prepare(`
    SELECT r.id, r.code, r.name, r.admin_access
    FROM roles r
    JOIN user_roles ur ON ur.role_id = r.id
    WHERE ur.user_id = ?
    ORDER BY r.id
  `).all(id);
  const directPermissions = db.prepare(`
    SELECT p.id, p.code, p.name, p.group_name
    FROM user_permissions up
    JOIN permissions p ON p.id = up.permission_id
    WHERE up.user_id = ?
    ORDER BY p.group_name, p.id
  `).all(id);
  return {
    id: Number(user.id),
    username: user.username,
    displayName: user.display_name,
    email: user.email || '',
    phone: user.phone || '',
    phoneVerifiedAt: user.phone_verified_at || null,
    bio: user.bio || '',
    status: user.status,
    createdAt: user.created_at,
    updatedAt: user.updated_at,
    lastLoginAt: user.last_login_at,
    roles: roles.map((role) => ({
      id: Number(role.id),
      code: role.code,
      name: role.name,
      adminAccess: Boolean(role.admin_access),
    })),
    directPermissions: directPermissions.map((permission) => ({
      id: Number(permission.id),
      code: permission.code,
      name: permission.name,
      group: permission.group_name,
    })),
  };
}

function validateRoleInput(input, existing = null) {
  const code = existing
    ? existing.code
    : requireString(input.code, '角色标识', { min: 3, max: 32 });
  if (!existing && !ROLE_CODE_PATTERN.test(code)) {
    throw new HttpError(
      400,
      '角色标识需为 3-32 位小写字母、数字或下划线，并以字母开头',
      'validation_error',
      { field: 'code' },
    );
  }
  return {
    code,
    name: requireString(input.name, '角色名称', { min: 2, max: 30 }),
    description: optionalString(input.description, '角色说明', { max: 300 }),
    adminAccess: Boolean(input.adminAccess),
    permissionCodes: normalizeStrings(input.permissionCodes),
  };
}

function normalizeStrings(value) {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.filter((item) => typeof item === 'string').map((item) => item.trim()).filter(Boolean))];
}

function getPermissionIds(db, codes) {
  if (!codes.length) return [];
  const placeholders = codes.map(() => '?').join(',');
  const rows = db.prepare(
    `SELECT id, code FROM permissions WHERE code IN (${placeholders})`,
  ).all(...codes);
  if (rows.length !== codes.length) {
    const found = new Set(rows.map((row) => row.code));
    throw new HttpError(
      400,
      `包含未知权限：${codes.filter((code) => !found.has(code)).join('、')}`,
      'validation_error',
    );
  }
  return rows.map((row) => Number(row.id));
}

function replaceRolePermissions(db, roleId, permissionIds) {
  db.prepare('DELETE FROM role_permissions WHERE role_id = ?').run(roleId);
  const insert = db.prepare(
    'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
  );
  for (const permissionId of permissionIds) insert.run(roleId, permissionId);
}

function countActiveSystemAdmins(db) {
  return Number(db.prepare(`
    SELECT COUNT(DISTINCT u.id) AS count
    FROM users u
    JOIN user_roles ur ON ur.user_id = u.id
    JOIN roles r ON r.id = ur.role_id
    WHERE r.code = 'system_admin' AND u.status = 'active'
  `).get().count);
}

function serializeRole(db, row) {
  const permissions = db.prepare(`
    SELECT p.id, p.code, p.name, p.group_name
    FROM permissions p
    JOIN role_permissions rp ON rp.permission_id = p.id
    WHERE rp.role_id = ?
    ORDER BY p.group_name, p.id
  `).all(row.id);
  const userCount = db.prepare(
    'SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?',
  ).get(row.id).count;
  return {
    id: Number(row.id),
    code: row.code,
    name: row.name,
    description: row.description,
    adminAccess: Boolean(row.admin_access),
    isSystem: Boolean(row.is_system),
    userCount: Number(userCount),
    permissions: permissions.map((permission) => ({
      id: Number(permission.id),
      code: permission.code,
      name: permission.name,
      group: permission.group_name,
    })),
  };
}

export function createAdminRoutes({ db, auth }) {
  return async function handle(req, res, url) {
    if (url.pathname === '/api/admin/users' && req.method === 'GET') {
      const actor = auth.requirePermission(req, 'user.manage');
      const search = String(url.searchParams.get('search') || '').trim().toLowerCase();
      const status = String(url.searchParams.get('status') || '').trim();
      const users = db.prepare('SELECT id FROM users ORDER BY id').all()
        .map((row) => getUserAdminRow(db, row.id))
        .filter((user) => {
          if (status && user.status !== status) return false;
          if (
            search &&
            !`${user.username} ${user.displayName} ${user.email} ${user.phone}`
              .toLowerCase()
              .includes(search)
          ) {
            return false;
          }
          return true;
        });
      sendJson(res, 200, { items: users, currentUserId: actor.id });
      return true;
    }

    const userStatusMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/status$/);
    if (userStatusMatch && req.method === 'PATCH') {
      assertSameOrigin(req);
      const actor = auth.requirePermission(req, 'user.manage');
      const id = parsePositiveInt(userStatusMatch[1], '用户 ID');
      const target = getUserAdminRow(db, id);
      if (!target) throw new HttpError(404, '用户不存在', 'not_found');
      const input = await readJson(req);
      if (!['active', 'disabled'].includes(input.status)) {
        throw new HttpError(400, '用户状态不合法', 'validation_error');
      }
      if (id === actor.id && input.status === 'disabled') {
        throw new HttpError(409, '不能禁用当前登录账号', 'cannot_disable_self');
      }
      const isSystemAdmin = target.roles.some((role) => role.code === 'system_admin');
      if (
        isSystemAdmin &&
        input.status === 'disabled' &&
        target.status === 'active' &&
        countActiveSystemAdmins(db) <= 1
      ) {
        throw new HttpError(409, '不能禁用最后一个可用的系统管理员', 'last_admin');
      }
      const timestamp = new Date().toISOString();
      db.prepare('UPDATE users SET status = ?, updated_at = ? WHERE id = ?')
        .run(input.status, timestamp, id);
      if (input.status === 'disabled') {
        db.prepare('DELETE FROM sessions WHERE user_id = ?').run(id);
      }
      recordAudit(db, req, actor, 'user.status_update', 'user', id, {
        status: input.status,
      });
      sendJson(res, 200, { item: getUserAdminRow(db, id) });
      return true;
    }

    const userRolesMatch = url.pathname.match(/^\/api\/admin\/users\/(\d+)\/roles$/);
    if (userRolesMatch && req.method === 'PUT') {
      assertSameOrigin(req);
      const actor = auth.requirePermission(req, 'role.manage');
      const id = parsePositiveInt(userRolesMatch[1], '用户 ID');
      const target = getUserAdminRow(db, id);
      if (!target) throw new HttpError(404, '用户不存在', 'not_found');
      const input = await readJson(req);
      const roleIds = [...new Set(
        (Array.isArray(input.roleIds) ? input.roleIds : [])
          .map(Number)
          .filter((roleId) => Number.isInteger(roleId) && roleId > 0),
      )];
      const roleRows = roleIds.length
        ? db.prepare(
            `SELECT * FROM roles WHERE id IN (${roleIds.map(() => '?').join(',')})`,
          ).all(...roleIds)
        : [];
      if (roleRows.length !== roleIds.length) {
        throw new HttpError(400, '包含不存在的角色', 'validation_error');
      }
      const removingSelfSystemAdmin =
        id === actor.id &&
        target.roles.some((role) => role.code === 'system_admin') &&
        !roleRows.some((role) => role.code === 'system_admin');
      if (removingSelfSystemAdmin && countActiveSystemAdmins(db) <= 1) {
        throw new HttpError(409, '不能移除最后一个系统管理员的系统管理角色', 'last_admin');
      }
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM user_roles WHERE user_id = ?').run(id);
        const insert = db.prepare(
          'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
        );
        for (const roleId of roleIds) insert.run(id, roleId);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      recordAudit(db, req, actor, 'user.roles_update', 'user', id, { roleIds });
      sendJson(res, 200, { item: getUserAdminRow(db, id) });
      return true;
    }

    const userPermissionsMatch = url.pathname.match(
      /^\/api\/admin\/users\/(\d+)\/permissions$/,
    );
    if (userPermissionsMatch && req.method === 'PUT') {
      assertSameOrigin(req);
      const actor = auth.requirePermission(req, 'role.manage');
      const id = parsePositiveInt(userPermissionsMatch[1], '用户 ID');
      const target = getUserAdminRow(db, id);
      if (!target) throw new HttpError(404, '用户不存在', 'not_found');
      const input = await readJson(req);
      const codes = normalizeStrings(input.permissionCodes);
      const permissionIds = getPermissionIds(db, codes);
      db.exec('BEGIN');
      try {
        db.prepare('DELETE FROM user_permissions WHERE user_id = ?').run(id);
        const insert = db.prepare(`
          INSERT INTO user_permissions
            (user_id, permission_id, granted_by, created_at)
          VALUES (?, ?, ?, ?)
        `);
        for (const permissionId of permissionIds) {
          insert.run(id, permissionId, actor.id, new Date().toISOString());
        }
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      recordAudit(db, req, actor, 'user.permissions_update', 'user', id, {
        permissionCodes: codes,
      });
      sendJson(res, 200, { item: getUserAdminRow(db, id) });
      return true;
    }

    if (url.pathname === '/api/admin/permissions' && req.method === 'GET') {
      auth.requirePermission(req, 'role.manage');
      const permissions = db.prepare(
        'SELECT id, code, name, group_name FROM permissions ORDER BY group_name, id',
      ).all().map((row) => ({
        id: Number(row.id),
        code: row.code,
        name: row.name,
        group: row.group_name,
      }));
      sendJson(res, 200, { items: permissions });
      return true;
    }

    if (url.pathname === '/api/admin/roles' && req.method === 'GET') {
      auth.requirePermission(req, 'role.manage');
      const roles = db.prepare('SELECT * FROM roles ORDER BY is_system DESC, id').all()
        .map((row) => serializeRole(db, row));
      sendJson(res, 200, { items: roles });
      return true;
    }

    if (url.pathname === '/api/admin/roles' && req.method === 'POST') {
      assertSameOrigin(req);
      const actor = auth.requirePermission(req, 'role.manage');
      const input = await readJson(req);
      const data = validateRoleInput(input);
      const permissionIds = getPermissionIds(db, data.permissionCodes);
      const existing = db.prepare('SELECT id FROM roles WHERE code = ?').get(data.code);
      if (existing) throw new HttpError(409, '角色标识已存在', 'role_code_taken');
      const timestamp = new Date().toISOString();
      db.exec('BEGIN');
      let id;
      try {
        const result = db.prepare(`
          INSERT INTO roles
            (code, name, description, admin_access, is_system, created_at)
          VALUES (?, ?, ?, ?, 0, ?)
        `).run(
          data.code,
          data.name,
          data.description,
          data.adminAccess ? 1 : 0,
          timestamp,
        );
        id = Number(result.lastInsertRowid);
        replaceRolePermissions(db, id, permissionIds);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      recordAudit(db, req, actor, 'role.create', 'role', id, {
        code: data.code,
        permissions: data.permissionCodes,
      });
      sendJson(res, 201, {
        item: serializeRole(db, db.prepare('SELECT * FROM roles WHERE id = ?').get(id)),
      });
      return true;
    }

    const roleMatch = url.pathname.match(/^\/api\/admin\/roles\/(\d+)$/);
    if (roleMatch && req.method === 'PATCH') {
      assertSameOrigin(req);
      const actor = auth.requirePermission(req, 'role.manage');
      const id = parsePositiveInt(roleMatch[1], '角色 ID');
      const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
      if (!existing) throw new HttpError(404, '角色不存在', 'not_found');
      const input = await readJson(req);
      const data = validateRoleInput(input, existing);
      if (existing.code === 'system_admin') {
        throw new HttpError(409, '系统管理员角色为固定全权限角色，不能修改', 'protected_role');
      }
      if (
        existing.code === 'volunteer' &&
        data.adminAccess
      ) {
        throw new HttpError(409, '普通志愿者角色不能直接获得后台入口', 'protected_role');
      }
      const permissionIds = getPermissionIds(db, data.permissionCodes);
      db.exec('BEGIN');
      try {
        db.prepare(`
          UPDATE roles
          SET name = ?, description = ?, admin_access = ?
          WHERE id = ?
        `).run(data.name, data.description, data.adminAccess ? 1 : 0, id);
        replaceRolePermissions(db, id, permissionIds);
        db.exec('COMMIT');
      } catch (error) {
        db.exec('ROLLBACK');
        throw error;
      }
      recordAudit(db, req, actor, 'role.update', 'role', id, {
        name: data.name,
        adminAccess: data.adminAccess,
        permissions: data.permissionCodes,
      });
      sendJson(res, 200, {
        item: serializeRole(db, db.prepare('SELECT * FROM roles WHERE id = ?').get(id)),
      });
      return true;
    }

    if (roleMatch && req.method === 'DELETE') {
      assertSameOrigin(req);
      const actor = auth.requirePermission(req, 'role.manage');
      const id = parsePositiveInt(roleMatch[1], '角色 ID');
      const existing = db.prepare('SELECT * FROM roles WHERE id = ?').get(id);
      if (!existing) throw new HttpError(404, '角色不存在', 'not_found');
      if (existing.is_system) {
        throw new HttpError(409, '系统内置角色不能删除', 'protected_role');
      }
      const assigned = db.prepare(
        'SELECT COUNT(*) AS count FROM user_roles WHERE role_id = ?',
      ).get(id).count;
      if (Number(assigned) > 0) {
        throw new HttpError(409, '该角色仍分配给用户，不能删除', 'role_in_use');
      }
      db.prepare('DELETE FROM roles WHERE id = ?').run(id);
      recordAudit(db, req, actor, 'role.delete', 'role', id, {
        name: existing.name,
      });
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (url.pathname === '/api/admin/stats' && req.method === 'GET') {
      auth.requirePermission(req, 'stats.view');
      const count = (sql, ...params) => Number(db.prepare(sql).get(...params).count);
      const categories = db.prepare(`
        SELECT category, COUNT(*) AS count
        FROM knowledge
        WHERE status = 'published'
        GROUP BY category
        ORDER BY count DESC, category
      `).all().map((row) => ({ category: row.category, count: Number(row.count) }));
      const recentActivity = db.prepare(`
        SELECT a.id, a.title, a.starts_at, a.status,
               (SELECT COUNT(*) FROM activity_participants p
                WHERE p.activity_id = a.id AND p.status = 'joined') AS participant_count
        FROM activities a
        ORDER BY a.starts_at DESC LIMIT 5
      `).all().map((row) => ({
        id: Number(row.id),
        title: row.title,
        startsAt: row.starts_at,
        status: row.status,
        participantCount: Number(row.participant_count),
      }));
      const feedbackTrend = db.prepare(`
        SELECT substr(submitted_at, 1, 10) AS date, COUNT(*) AS count
        FROM feedback
        WHERE submitted_at >= ?
        GROUP BY substr(submitted_at, 1, 10)
        ORDER BY date
      `).all(new Date(Date.now() - 13 * 24 * 60 * 60 * 1000).toISOString())
        .map((row) => ({ date: row.date, count: Number(row.count) }));
      sendJson(res, 200, {
        counts: {
          users: count("SELECT COUNT(*) AS count FROM users WHERE status = 'active'"),
          knowledge: count("SELECT COUNT(*) AS count FROM knowledge WHERE status = 'published'"),
          pendingKnowledge: count("SELECT COUNT(*) AS count FROM knowledge WHERE status = 'pending'"),
          activities: count("SELECT COUNT(*) AS count FROM activities WHERE status IN ('published', 'completed')"),
          pendingFeedback: count("SELECT COUNT(*) AS count FROM feedback WHERE status = 'pending'"),
          pendingQuestions: count("SELECT COUNT(*) AS count FROM questions WHERE status IN ('pending', 'processing')"),
          pendingCommunity: count("SELECT COUNT(*) AS count FROM community_posts WHERE status = 'pending'"),
        },
        categories,
        recentActivity,
        feedbackTrend,
        recentLogs: listAuditLogs(db, 8),
      });
      return true;
    }

    if (url.pathname === '/api/admin/audit' && req.method === 'GET') {
      auth.requirePermission(req, 'settings.manage');
      const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 100, 1), 500);
      sendJson(res, 200, { items: listAuditLogs(db, limit) });
      return true;
    }

    if (url.pathname === '/api/admin/settings' && req.method === 'GET') {
      auth.requirePermission(req, 'settings.manage');
      const database = db.prepare('PRAGMA database_list').all();
      sendJson(res, 200, {
        platformName: '心青年志愿服务知识管理平台',
        version: '1.0.0',
        database: database[0]?.file || '',
        uploadPolicy: {
          maxFileSizeMb: 50,
          types: ['JPG', 'PNG', 'WEBP', 'GIF', 'MP4', 'WEBM', 'PDF', 'DOC', 'DOCX', 'PPT', 'PPTX', 'XLS', 'XLSX', 'TXT'],
        },
        security: {
          sessionDays: 7,
          smsCodeHash: 'HMAC-SHA256',
          smsCodeTtlSeconds: 300,
          serverSideAuthorization: true,
          auditLogging: true,
        },
      });
      return true;
    }

    return false;
  };
}
