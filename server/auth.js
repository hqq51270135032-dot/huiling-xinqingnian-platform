import {
  createHmac,
  randomBytes,
  randomInt,
  timingSafeEqual,
} from 'node:crypto';
import {
  HttpError,
  parseCookies,
  requireString,
  setCookie,
  clearCookie,
} from './http.js';
import {
  createSessionToken,
  hashPassword,
  hashToken,
} from './security.js';

export const SESSION_COOKIE = 'xqn_session';
const SESSION_DAYS = 7;
const PHONE_PATTERN = /^1[3-9]\d{9}$/;
const CODE_PATTERN = /^\d{6}$/;
const SMS_PURPOSES = new Set(['register', 'login', 'setup']);
const MAX_CODE_ATTEMPTS = 5;
const PHONE_SEND_LIMIT = 5;
const IP_SEND_LIMIT = 20;

function normalizePhone(value) {
  return String(value || '').replace(/\s+/g, '').replace(/^\+?86/, '');
}

function assertPhone(value) {
  const phone = normalizePhone(value);
  if (!PHONE_PATTERN.test(phone)) {
    throw new HttpError(
      400,
      '请输入有效的中国大陆手机号',
      'invalid_phone',
      { field: 'phone' },
    );
  }
  return phone;
}

function assertCode(value) {
  const code = String(value || '').trim();
  if (!CODE_PATTERN.test(code)) {
    throw new HttpError(
      400,
      '请输入 6 位短信验证码',
      'invalid_code_format',
      { field: 'code' },
    );
  }
  return code;
}

function safeEqual(left, right) {
  const leftBuffer = Buffer.from(String(left));
  const rightBuffer = Buffer.from(String(right));
  if (leftBuffer.length !== rightBuffer.length) return false;
  return timingSafeEqual(leftBuffer, rightBuffer);
}

function maskPhone(phone) {
  return phone ? `${phone.slice(0, 3)}****${phone.slice(-4)}` : '';
}

export function createAuthService(
  db,
  {
    smsSender,
    initialAdminPhone = '',
    initialSetupToken = '',
    smsCodeSecret = '',
    smsCodeTtlSeconds = 300,
    smsCooldownSeconds = 60,
    now = () => new Date(),
  } = {},
) {
  if (!smsSender) {
    throw new Error('SMS sender is required for authentication.');
  }

  const normalizedAdminPhone = PHONE_PATTERN.test(normalizePhone(initialAdminPhone))
    ? normalizePhone(initialAdminPhone)
    : '';
  const codeSecret =
    smsCodeSecret.length >= 32
      ? smsCodeSecret
      : getOrCreateCodeSecret(db);

  function getOrCreateCodeSecret(database) {
    const existing = database.prepare(
      "SELECT value FROM system_settings WHERE key = 'sms_code_secret'",
    ).get();
    if (existing?.value) return existing.value;
    const secret = randomBytes(32).toString('hex');
    database.prepare(`
      INSERT INTO system_settings (key, value, updated_at)
      VALUES ('sms_code_secret', ?, ?)
    `).run(secret, now().toISOString());
    return secret;
  }

  function hashSmsCode(phone, purpose, code) {
    return createHmac('sha256', codeSecret)
      .update(`${phone}:${purpose}:${code}`)
      .digest('hex');
  }

  function findUserByPhone(phone) {
    return db.prepare(`
      SELECT id, username, display_name, email, phone, bio, status,
             created_at, updated_at, last_login_at, phone_verified_at
      FROM users
      WHERE phone = ?
    `).get(phone);
  }

  function loadUserContext(userId) {
    const user = db.prepare(`
      SELECT id, username, display_name, email, phone, bio, status,
             created_at, updated_at, last_login_at, phone_verified_at
      FROM users
      WHERE id = ?
    `).get(userId);
    if (!user || user.status !== 'active') return null;

    const roles = db.prepare(`
      SELECT r.id, r.code, r.name, r.admin_access
      FROM roles r
      JOIN user_roles ur ON ur.role_id = r.id
      WHERE ur.user_id = ?
      ORDER BY r.id
    `).all(userId);

    const permissionRows = db.prepare(`
      SELECT DISTINCT p.code
      FROM permissions p
      WHERE p.id IN (
        SELECT rp.permission_id
        FROM role_permissions rp
        JOIN user_roles ur ON ur.role_id = rp.role_id
        WHERE ur.user_id = ?
        UNION
        SELECT up.permission_id
        FROM user_permissions up
        WHERE up.user_id = ?
      )
      ORDER BY p.code
    `).all(userId, userId);

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
      permissions: permissionRows.map((row) => row.code),
      isAdmin: roles.some((role) => Boolean(role.admin_access)),
    };
  }

  function getSessionUser(req) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[SESSION_COOKIE];
    if (!token) return null;

    const tokenHash = hashToken(token);
    const session = db.prepare(`
      SELECT s.user_id
      FROM sessions s
      JOIN users u ON u.id = s.user_id
      WHERE s.token_hash = ? AND s.expires_at > ? AND u.status = 'active'
    `).get(tokenHash, now().toISOString());
    if (!session) return null;
    return loadUserContext(session.user_id);
  }

  function requireUser(req) {
    const user = getSessionUser(req);
    if (!user) {
      throw new HttpError(401, '登录已失效，请重新登录', 'authentication_required');
    }
    return user;
  }

  function requirePermission(req, permission) {
    const user = requireUser(req);
    return requirePermissionForUser(user, permission);
  }

  function requirePermissionForUser(user, permission) {
    if (!user.permissions.includes(permission)) {
      throw new HttpError(403, '当前账号没有执行此操作的权限', 'permission_denied');
    }
    return user;
  }

  function requireAdmin(req) {
    const user = requireUser(req);
    if (!user.isAdmin) {
      throw new HttpError(403, '当前账号没有管理者后台访问权限', 'admin_required');
    }
    return user;
  }

  function createSession(userId, secure) {
    const token = createSessionToken();
    const createdAt = now();
    const expiresAt = new Date(
      createdAt.getTime() + SESSION_DAYS * 24 * 60 * 60 * 1000,
    );
    db.prepare(`
      INSERT INTO sessions (token_hash, user_id, expires_at, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      hashToken(token),
      userId,
      expiresAt.toISOString(),
      createdAt.toISOString(),
    );
    return setCookie(SESSION_COOKIE, token, {
      maxAge: SESSION_DAYS * 24 * 60 * 60,
      secure,
    });
  }

  function assertSendRate(phone, purpose, ip) {
    const current = now();
    const latest = db.prepare(`
      SELECT created_at FROM sms_verification_codes
      WHERE phone = ? AND purpose = ?
      ORDER BY id DESC LIMIT 1
    `).get(phone, purpose);
    if (latest) {
      const elapsed = current.getTime() - new Date(latest.created_at).getTime();
      if (elapsed < smsCooldownSeconds * 1000) {
        throw new HttpError(
          429,
          `请 ${Math.ceil((smsCooldownSeconds * 1000 - elapsed) / 1000)} 秒后再获取验证码`,
          'sms_cooldown',
          {
            retryAfter: Math.ceil(
              (smsCooldownSeconds * 1000 - elapsed) / 1000,
            ),
          },
        );
      }
    }

    const phoneWindow = new Date(current.getTime() - 60 * 60 * 1000).toISOString();
    const phoneCount = db.prepare(`
      SELECT COUNT(*) AS count FROM sms_verification_codes
      WHERE phone = ? AND created_at >= ?
    `).get(phone, phoneWindow).count;
    if (Number(phoneCount) >= PHONE_SEND_LIMIT) {
      throw new HttpError(
        429,
        '该手机号获取验证码过于频繁，请稍后再试',
        'sms_phone_rate_limited',
      );
    }

    const ipWindow = new Date(current.getTime() - 60 * 60 * 1000).toISOString();
    const ipCount = db.prepare(`
      SELECT COUNT(*) AS count FROM sms_verification_codes
      WHERE request_ip = ? AND request_ip <> '' AND created_at >= ?
    `).get(ip, ipWindow).count;
    if (Number(ipCount) >= IP_SEND_LIMIT) {
      throw new HttpError(
        429,
        '当前网络获取验证码过于频繁，请稍后再试',
        'sms_ip_rate_limited',
      );
    }
  }

  function assertSmsPreconditions(phone, purpose, portal, setupToken) {
    if (purpose === 'setup') {
      const status = setupStatus();
      if (!status.configured) {
        throw new HttpError(
          503,
          '初始管理员尚未完成部署配置',
          'setup_not_configured',
        );
      }
      if (status.completed) {
        throw new HttpError(409, '系统初始化已完成', 'setup_completed');
      }
      if (!safeEqual(setupToken || '', initialSetupToken)) {
        throw new HttpError(403, '初始化令牌不正确', 'invalid_setup_token');
      }
      if (phone !== normalizedAdminPhone) {
        throw new HttpError(403, '手机号与部署配置不一致', 'setup_phone_mismatch');
      }
      return;
    }

    const user = findUserByPhone(phone);
    if (purpose === 'register') {
      if (user) {
        throw new HttpError(
          409,
          '该手机号已注册，请直接登录',
          'phone_registered',
          { field: 'phone' },
        );
      }
      return;
    }

    if (!user) {
      throw new HttpError(
        404,
        '该手机号尚未注册，请先注册账号',
        'phone_not_registered',
        { field: 'phone' },
      );
    }
    if (user.status !== 'active') {
      throw new HttpError(403, '该账号当前不可用，请联系管理员', 'account_disabled');
    }
    if (portal === 'admin') {
      const hasAdminRole = db.prepare(`
        SELECT 1
        FROM user_roles ur
        JOIN roles r ON r.id = ur.role_id
        WHERE ur.user_id = ? AND r.admin_access = 1
        LIMIT 1
      `).get(user.id);
      if (!hasAdminRole) {
        throw new HttpError(403, '该手机号没有管理者后台权限', 'admin_required');
      }
    }
  }

  async function sendSmsCode({ phone: rawPhone, purpose, portal, setupToken, ip }) {
    const phone = assertPhone(
      purpose === 'setup' ? rawPhone || normalizedAdminPhone : rawPhone,
    );
    if (!SMS_PURPOSES.has(purpose)) {
      throw new HttpError(400, '验证码用途不合法', 'invalid_sms_purpose');
    }
    assertSmsPreconditions(phone, purpose, portal, setupToken);
    assertSendRate(phone, purpose, ip);
    if (!smsSender.isConfigured) {
      throw new HttpError(
        503,
        '短信服务尚未配置，请联系部署管理员',
        'sms_not_configured',
      );
    }

    const createdAt = now();
    const expiresAt = new Date(
      createdAt.getTime() + smsCodeTtlSeconds * 1000,
    );
    const code = String(randomInt(0, 1_000_000)).padStart(6, '0');
    db.prepare(`
      UPDATE sms_verification_codes
      SET consumed_at = ?
      WHERE phone = ? AND purpose = ? AND consumed_at IS NULL
    `).run(createdAt.toISOString(), phone, purpose);
    const insert = db.prepare(`
      INSERT INTO sms_verification_codes
        (phone, purpose, code_hash, expires_at, attempts, request_ip, created_at)
      VALUES (?, ?, ?, ?, 0, ?, ?)
    `).run(
      phone,
      purpose,
      hashSmsCode(phone, purpose, code),
      expiresAt.toISOString(),
      ip || '',
      createdAt.toISOString(),
    );

    try {
      await smsSender.send({ phone, code, purpose });
    } catch (error) {
      db.prepare('DELETE FROM sms_verification_codes WHERE id = ?')
        .run(Number(insert.lastInsertRowid));
      throw error;
    }

    return {
      expiresIn: smsCodeTtlSeconds,
      cooldown: smsCooldownSeconds,
      provider: smsSender.name,
      development: Boolean(smsSender.development),
    };
  }

  function verifySmsCode(rawPhone, purpose, rawCode) {
    const phone = assertPhone(rawPhone);
    const code = assertCode(rawCode);
    const record = db.prepare(`
      SELECT * FROM sms_verification_codes
      WHERE phone = ? AND purpose = ? AND consumed_at IS NULL
      ORDER BY id DESC LIMIT 1
    `).get(phone, purpose);
    if (!record) {
      throw new HttpError(
        400,
        '验证码不存在，请重新获取',
        'code_not_found',
      );
    }
    if (new Date(record.expires_at).getTime() <= now().getTime()) {
      throw new HttpError(400, '验证码已过期，请重新获取', 'code_expired');
    }
    if (Number(record.attempts) >= MAX_CODE_ATTEMPTS) {
      throw new HttpError(
        429,
        '验证码错误次数过多，请重新获取',
        'code_locked',
      );
    }
    const valid = safeEqual(
      record.code_hash,
      hashSmsCode(phone, purpose, code),
    );
    if (!valid) {
      const attempts = Number(record.attempts) + 1;
      db.prepare('UPDATE sms_verification_codes SET attempts = ? WHERE id = ?')
        .run(attempts, record.id);
      if (attempts >= MAX_CODE_ATTEMPTS) {
        throw new HttpError(
          429,
          '验证码错误次数过多，请重新获取',
          'code_locked',
        );
      }
      throw new HttpError(
        400,
        `验证码不正确，还可尝试 ${MAX_CODE_ATTEMPTS - attempts} 次`,
        'code_invalid',
        { remainingAttempts: MAX_CODE_ATTEMPTS - attempts },
      );
    }
    db.prepare('UPDATE sms_verification_codes SET consumed_at = ? WHERE id = ?')
      .run(now().toISOString(), record.id);
    return phone;
  }

  function register(input, secure) {
    const phone = assertPhone(input.phone);
    const displayName = requireString(input.nickname, '昵称', {
      min: 2,
      max: 20,
    });
    if (findUserByPhone(phone)) {
      throw new HttpError(
        409,
        '该手机号已注册，请直接登录',
        'phone_registered',
        { field: 'phone' },
      );
    }
    verifySmsCode(phone, 'register', input.code);

    const volunteerRole = db.prepare(
      "SELECT id FROM roles WHERE code = 'volunteer'",
    ).get();
    if (!volunteerRole) {
      throw new HttpError(500, '系统角色配置缺失', 'role_missing');
    }

    const timestamp = now().toISOString();
    let userId;
    db.exec('BEGIN');
    try {
      const result = db.prepare(`
        INSERT INTO users
          (username, password_hash, display_name, email, phone, bio, status,
           created_at, updated_at, last_login_at, phone_verified_at)
        VALUES (?, ?, ?, '', ?, '', 'active', ?, ?, ?, ?)
      `).run(
        `phone_${phone}`,
        hashPassword(randomBytes(32).toString('base64url')),
        displayName,
        phone,
        timestamp,
        timestamp,
        timestamp,
        timestamp,
      );
      userId = Number(result.lastInsertRowid);
      db.prepare('INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)')
        .run(userId, volunteerRole.id);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const cookie = createSession(userId, secure);
    return { user: loadUserContext(userId), cookie };
  }

  function login(input, secure) {
    const phone = assertPhone(input.phone);
    const portal = input.portal === 'admin' ? 'admin' : 'volunteer';
    const userRow = findUserByPhone(phone);
    if (!userRow) {
      throw new HttpError(
        404,
        '该手机号尚未注册，请先注册账号',
        'phone_not_registered',
        { field: 'phone' },
      );
    }
    if (userRow.status !== 'active') {
      throw new HttpError(403, '该账号当前不可用，请联系管理员', 'account_disabled');
    }
    const user = loadUserContext(userRow.id);
    if (portal === 'admin' && !user.isAdmin) {
      throw new HttpError(403, '该账号没有管理者后台访问权限', 'admin_required');
    }
    verifySmsCode(phone, 'login', input.code);

    const timestamp = now().toISOString();
    db.prepare('UPDATE users SET last_login_at = ?, updated_at = ? WHERE id = ?')
      .run(timestamp, timestamp, user.id);
    user.lastLoginAt = timestamp;
    return { user, cookie: createSession(user.id, secure) };
  }

  function setupStatus() {
    const completedSetting = db.prepare(
      "SELECT value FROM system_settings WHERE key = 'initial_admin_completed_at'",
    ).get();
    return {
      configured: Boolean(
        normalizedAdminPhone &&
          initialSetupToken &&
          initialSetupToken.length >= 8,
      ),
      completed: Boolean(completedSetting?.value),
      maskedPhone: maskPhone(normalizedAdminPhone),
      smsConfigured: Boolean(smsSender.isConfigured),
      developmentSms: Boolean(smsSender.development),
    };
  }

  function setupAdmin(input, secure) {
    const status = setupStatus();
    if (status.completed) {
      throw new HttpError(409, '系统初始化已完成，请直接登录', 'setup_completed');
    }
    if (!status.configured) {
      throw new HttpError(503, '初始管理员尚未完成部署配置', 'setup_not_configured');
    }
    if (!safeEqual(input.setupToken || '', initialSetupToken)) {
      throw new HttpError(403, '初始化令牌不正确', 'invalid_setup_token');
    }
    verifySmsCode(normalizedAdminPhone, 'setup', input.code);

    const systemAdminRole = db.prepare(
      "SELECT id FROM roles WHERE code = 'system_admin'",
    ).get();
    if (!systemAdminRole) {
      throw new HttpError(500, '系统管理员角色配置缺失', 'role_missing');
    }
    let admin = db.prepare(
      "SELECT * FROM users WHERE username = 'admin'",
    ).get();
    const phoneOwner = findUserByPhone(normalizedAdminPhone);
    if (phoneOwner && admin && Number(phoneOwner.id) !== Number(admin.id)) {
      throw new HttpError(
        409,
        '该手机号已绑定普通账号，不能作为初始管理员手机号',
        'setup_phone_conflict',
      );
    }

    const timestamp = now().toISOString();
    db.exec('BEGIN');
    try {
      if (!admin) {
        const result = db.prepare(`
          INSERT INTO users
            (username, password_hash, display_name, email, phone, bio, status,
             created_at, updated_at, last_login_at, phone_verified_at)
          VALUES ('admin', ?, '平台管理员', '', ?, '', 'active', ?, ?, ?, ?)
        `).run(
          hashPassword(randomBytes(32).toString('base64url')),
          normalizedAdminPhone,
          timestamp,
          timestamp,
          timestamp,
          timestamp,
        );
        admin = { id: Number(result.lastInsertRowid) };
      } else {
        db.prepare(`
          UPDATE users
          SET phone = ?, display_name = '平台管理员', status = 'active',
              phone_verified_at = ?, last_login_at = ?, updated_at = ?
          WHERE id = ?
        `).run(normalizedAdminPhone, timestamp, timestamp, timestamp, admin.id);
      }
      db.prepare(`
        INSERT OR IGNORE INTO user_roles (user_id, role_id)
        VALUES (?, ?)
      `).run(admin.id, systemAdminRole.id);
      db.prepare(`
        INSERT INTO system_settings (key, value, updated_at)
        VALUES ('initial_admin_completed_at', ?, ?)
        ON CONFLICT(key) DO UPDATE SET
          value = excluded.value,
          updated_at = excluded.updated_at
      `).run(timestamp, timestamp);
      db.exec('COMMIT');
    } catch (error) {
      db.exec('ROLLBACK');
      throw error;
    }

    const user = loadUserContext(admin.id);
    return { user, cookie: createSession(admin.id, secure) };
  }

  function logout(req, secure) {
    const cookies = parseCookies(req.headers.cookie || '');
    const token = cookies[SESSION_COOKIE];
    if (token) {
      db.prepare('DELETE FROM sessions WHERE token_hash = ?').run(hashToken(token));
    }
    return clearCookie(SESSION_COOKIE, secure);
  }

  function updateProfile(user, input) {
    const displayName = requireString(input.displayName, '昵称', {
      min: 2,
      max: 20,
    });
    const bio = String(input.bio || '').trim().slice(0, 500);
    const timestamp = now().toISOString();
    db.prepare(`
      UPDATE users
      SET display_name = ?, bio = ?, updated_at = ?
      WHERE id = ?
    `).run(displayName, bio, timestamp, user.id);
    return loadUserContext(user.id);
  }

  function purgeExpiredSessions() {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(
      now().toISOString(),
    );
    db.prepare(`
      DELETE FROM sms_verification_codes
      WHERE created_at < ?
    `).run(new Date(now().getTime() - 7 * 24 * 60 * 60 * 1000).toISOString());
  }

  return {
    loadUserContext,
    getSessionUser,
    requireUser,
    requirePermission,
    requirePermissionForUser,
    requireAdmin,
    sendSmsCode,
    verifySmsCode,
    register,
    login,
    setupStatus,
    setupAdmin,
    logout,
    updateProfile,
    purgeExpiredSessions,
  };
}
