import { mkdirSync } from 'node:fs';
import { randomBytes } from 'node:crypto';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { DatabaseSync } from 'node:sqlite';
import { hashPassword } from './security.js';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');

export const DEFAULT_DB_PATH = resolve(projectRoot, 'data', 'xinqingnian.db');
export const DEFAULT_UPLOAD_DIR = resolve(projectRoot, 'data', 'uploads');

const permissionDefinitions = [
  ['admin.access', '进入管理者后台', '系统'],
  ['profile.edit', '维护个人信息', '个人'],
  ['knowledge.public.view', '查看公开知识', '知识内容'],
  ['knowledge.internal.view', '查看内部资料', '知识内容'],
  ['knowledge.restricted.view', '查看受限案例', '知识内容'],
  ['knowledge.create', '创建知识', '知识内容'],
  ['knowledge.edit', '编辑知识', '知识内容'],
  ['knowledge.delete', '删除知识', '知识内容'],
  ['knowledge.review', '审核知识', '知识内容'],
  ['knowledge.favorite', '收藏知识', '知识内容'],
  ['knowledge.read', '记录阅读进度', '知识内容'],
  ['question.view', '查看答疑', '问题答疑'],
  ['question.create', '提交问题', '问题答疑'],
  ['question.manage', '管理问题', '问题答疑'],
  ['activity.view', '查看活动', '活动'],
  ['activity.manage', '管理活动', '活动'],
  ['activity.join', '报名活动', '活动'],
  ['feedback.create', '提交活动反馈', '活动反馈'],
  ['feedback.own.view', '查看自己的反馈', '活动反馈'],
  ['feedback.review', '审核活动反馈', '活动反馈'],
  ['community.view', '查看社群', '社群'],
  ['community.create', '发布社群内容', '社群'],
  ['community.moderate', '审核社群内容', '社群'],
  ['user.manage', '管理用户', '权限管理'],
  ['role.manage', '管理角色与权限', '权限管理'],
  ['stats.view', '查看数据统计', '数据'],
  ['settings.manage', '管理系统设置', '系统'],
];

const roleDefinitions = [
  {
    code: 'volunteer',
    name: '普通志愿者',
    description: '平台注册用户默认身份',
    adminAccess: 0,
    system: 1,
    permissions: [
      'profile.edit',
      'knowledge.public.view',
      'knowledge.favorite',
      'knowledge.read',
      'question.view',
      'question.create',
      'activity.view',
      'activity.join',
      'feedback.create',
      'feedback.own.view',
      'community.view',
      'community.create',
    ],
  },
  {
    code: 'system_admin',
    name: '系统管理员',
    description: '拥有全部系统权限',
    adminAccess: 1,
    system: 1,
    permissions: permissionDefinitions.map(([code]) => code),
  },
  {
    code: 'content_admin',
    name: '内容管理员',
    description: '负责知识内容、答疑与内容审核',
    adminAccess: 1,
    system: 1,
    permissions: [
      'admin.access',
      'profile.edit',
      'knowledge.public.view',
      'knowledge.internal.view',
      'knowledge.restricted.view',
      'knowledge.create',
      'knowledge.edit',
      'knowledge.delete',
      'knowledge.review',
      'knowledge.favorite',
      'knowledge.read',
      'question.view',
      'question.manage',
      'activity.view',
      'feedback.review',
      'community.view',
      'community.moderate',
      'stats.view',
    ],
  },
  {
    code: 'activity_admin',
    name: '活动管理员',
    description: '负责活动发布、报名和反馈审核',
    adminAccess: 1,
    system: 1,
    permissions: [
      'admin.access',
      'profile.edit',
      'knowledge.public.view',
      'knowledge.favorite',
      'knowledge.read',
      'question.view',
      'question.create',
      'activity.view',
      'activity.manage',
      'activity.join',
      'feedback.create',
      'feedback.own.view',
      'feedback.review',
      'community.view',
      'community.create',
      'stats.view',
    ],
  },
];

function nowIso() {
  return new Date().toISOString();
}

function daysFromNow(days, hour = 9) {
  const date = new Date();
  date.setDate(date.getDate() + days);
  date.setHours(hour, 0, 0, 0);
  return date.toISOString();
}

export function createDatabase({
  dbPath = DEFAULT_DB_PATH,
  seed = true,
  demoMode = process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE !== '0',
  initialAdminPhone = process.env.INITIAL_ADMIN_PHONE || '',
} = {}) {
  mkdirSync(dirname(dbPath), { recursive: true });
  const db = new DatabaseSync(dbPath);
  db.exec('PRAGMA foreign_keys = ON;');
  db.exec('PRAGMA journal_mode = WAL;');
  db.exec('PRAGMA busy_timeout = 5000;');
  createSchema(db);
  migrateSchema(db);
  if (seed) seedDatabase(db, { demoMode, initialAdminPhone });
  applyInitialAdminConfiguration(db, initialAdminPhone);
  return db;
}

function createSchema(db) {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT NOT NULL UNIQUE COLLATE NOCASE,
      password_hash TEXT NOT NULL,
      display_name TEXT NOT NULL,
      email TEXT,
      phone TEXT,
      bio TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'disabled')),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      last_login_at TEXT,
      phone_verified_at TEXT
    );

    CREATE TABLE IF NOT EXISTS roles (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      admin_access INTEGER NOT NULL DEFAULT 0,
      is_system INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS permissions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      code TEXT NOT NULL UNIQUE,
      name TEXT NOT NULL,
      group_name TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS user_roles (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      PRIMARY KEY (user_id, role_id)
    );

    CREATE TABLE IF NOT EXISTS role_permissions (
      role_id INTEGER NOT NULL REFERENCES roles(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      PRIMARY KEY (role_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS user_permissions (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      permission_id INTEGER NOT NULL REFERENCES permissions(id) ON DELETE CASCADE,
      granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, permission_id)
    );

    CREATE TABLE IF NOT EXISTS sessions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      token_hash TEXT NOT NULL UNIQUE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at TEXT NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sessions_user ON sessions(user_id);
    CREATE INDEX IF NOT EXISTS idx_sessions_expiry ON sessions(expires_at);

    CREATE TABLE IF NOT EXISTS knowledge (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      summary TEXT NOT NULL DEFAULT '',
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      tags TEXT NOT NULL DEFAULT '',
      visibility TEXT NOT NULL DEFAULT 'public'
        CHECK (visibility IN ('public', 'internal', 'restricted')),
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'pending', 'published', 'archived')),
      author_id INTEGER NOT NULL REFERENCES users(id),
      reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      reviewed_at TEXT,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      published_at TEXT,
      view_count INTEGER NOT NULL DEFAULT 0,
      source_type TEXT,
      source_id INTEGER
    );
    CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge(status);
    CREATE INDEX IF NOT EXISTS idx_knowledge_visibility ON knowledge(visibility);

    CREATE TABLE IF NOT EXISTS knowledge_acl (
      knowledge_id INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      granted_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (knowledge_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS activities (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      title TEXT NOT NULL,
      starts_at TEXT NOT NULL,
      ends_at TEXT NOT NULL,
      location TEXT NOT NULL,
      introduction TEXT NOT NULL,
      content TEXT NOT NULL,
      requirements TEXT NOT NULL DEFAULT '',
      notes TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'draft'
        CHECK (status IN ('draft', 'published', 'completed', 'cancelled')),
      created_by INTEGER NOT NULL REFERENCES users(id),
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_activities_status ON activities(status);
    CREATE INDEX IF NOT EXISTS idx_activities_start ON activities(starts_at);

    CREATE TABLE IF NOT EXISTS activity_participants (
      activity_id INTEGER NOT NULL REFERENCES activities(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      status TEXT NOT NULL DEFAULT 'joined' CHECK (status IN ('joined', 'cancelled')),
      joined_at TEXT NOT NULL,
      PRIMARY KEY (activity_id, user_id)
    );

    CREATE TABLE IF NOT EXISTS feedback (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      activity_id INTEGER NOT NULL REFERENCES activities(id),
      user_id INTEGER NOT NULL REFERENCES users(id),
      participation_date TEXT NOT NULL,
      problems TEXT NOT NULL DEFAULT '',
      observations TEXT NOT NULL DEFAULT '',
      communication_difficulties TEXT NOT NULL DEFAULT '',
      learnings TEXT NOT NULL DEFAULT '',
      new_understanding TEXT NOT NULL DEFAULT '',
      suggestions TEXT NOT NULL DEFAULT '',
      additional TEXT NOT NULL DEFAULT '',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'approved', 'rejected', 'revision')),
      visibility TEXT NOT NULL DEFAULT 'private'
        CHECK (visibility IN ('private', 'public')),
      reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      review_note TEXT NOT NULL DEFAULT '',
      admin_reply TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      featured INTEGER NOT NULL DEFAULT 0,
      submitted_at TEXT NOT NULL,
      reviewed_at TEXT,
      UNIQUE (activity_id, user_id)
    );
    CREATE INDEX IF NOT EXISTS idx_feedback_activity ON feedback(activity_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_user ON feedback(user_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_status ON feedback(status);

    CREATE TABLE IF NOT EXISTS questions (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'processing', 'replied', 'archived')),
      answer TEXT NOT NULL DEFAULT '',
      answered_by INTEGER REFERENCES users(id) ON DELETE SET NULL,
      answered_at TEXT,
      is_faq INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_questions_status ON questions(status);
    CREATE INDEX IF NOT EXISTS idx_questions_user ON questions(user_id);

    CREATE TABLE IF NOT EXISTS community_posts (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      user_id INTEGER NOT NULL REFERENCES users(id),
      activity_id INTEGER REFERENCES activities(id) ON DELETE SET NULL,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      category TEXT NOT NULL DEFAULT '经验分享',
      status TEXT NOT NULL DEFAULT 'pending'
        CHECK (status IN ('pending', 'published', 'rejected', 'hidden')),
      review_note TEXT NOT NULL DEFAULT '',
      reviewer_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      reviewed_at TEXT
    );
    CREATE INDEX IF NOT EXISTS idx_community_status ON community_posts(status);

    CREATE TABLE IF NOT EXISTS comments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      post_id INTEGER NOT NULL REFERENCES community_posts(id) ON DELETE CASCADE,
      user_id INTEGER NOT NULL REFERENCES users(id),
      content TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'published'
        CHECK (status IN ('published', 'hidden')),
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);

    CREATE TABLE IF NOT EXISTS attachments (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      target_type TEXT NOT NULL
        CHECK (target_type IN ('knowledge', 'activity', 'feedback', 'question', 'community')),
      target_id INTEGER NOT NULL,
      owner_id INTEGER NOT NULL REFERENCES users(id),
      original_name TEXT NOT NULL,
      stored_name TEXT NOT NULL UNIQUE,
      mime_type TEXT NOT NULL,
      size_bytes INTEGER NOT NULL,
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_attachments_target
      ON attachments(target_type, target_id);

    CREATE TABLE IF NOT EXISTS favorites (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      knowledge_id INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
      created_at TEXT NOT NULL,
      PRIMARY KEY (user_id, knowledge_id)
    );

    CREATE TABLE IF NOT EXISTS reading_history (
      user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      knowledge_id INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
      last_read_at TEXT NOT NULL,
      read_count INTEGER NOT NULL DEFAULT 1,
      PRIMARY KEY (user_id, knowledge_id)
    );

    CREATE TABLE IF NOT EXISTS audit_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      actor_id INTEGER REFERENCES users(id) ON DELETE SET NULL,
      action TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id INTEGER,
      details TEXT NOT NULL DEFAULT '{}',
      ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_audit_actor ON audit_logs(actor_id);
    CREATE INDEX IF NOT EXISTS idx_audit_time ON audit_logs(created_at);

    CREATE TABLE IF NOT EXISTS sms_verification_codes (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      phone TEXT NOT NULL,
      purpose TEXT NOT NULL CHECK (purpose IN ('register', 'login', 'setup')),
      code_hash TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      consumed_at TEXT,
      request_ip TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_sms_phone_purpose
      ON sms_verification_codes(phone, purpose, created_at);
    CREATE INDEX IF NOT EXISTS idx_sms_ip_created
      ON sms_verification_codes(request_ip, created_at);

    CREATE TABLE IF NOT EXISTS system_settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );
  `);
}

function migrateSchema(db) {
  const userColumns = db.prepare('PRAGMA table_info(users)').all();
  if (!userColumns.some((column) => column.name === 'phone_verified_at')) {
    db.exec('ALTER TABLE users ADD COLUMN phone_verified_at TEXT;');
  }
  db.exec(`
    CREATE UNIQUE INDEX IF NOT EXISTS idx_users_phone_unique
      ON users(phone)
      WHERE phone IS NOT NULL AND phone <> '';
  `);
}

function applyInitialAdminConfiguration(db, initialAdminPhone) {
  const phone = String(initialAdminPhone || '').trim();
  if (!/^1[3-9]\d{9}$/.test(phone)) return;
  const completed = db.prepare(
    "SELECT value FROM system_settings WHERE key = 'initial_admin_completed_at'",
  ).get();
  if (completed?.value) return;
  const admin = db.prepare(
    "SELECT id, phone FROM users WHERE username = 'admin'",
  ).get();
  if (!admin || admin.phone) return;
  const phoneOwner = db.prepare('SELECT id FROM users WHERE phone = ?').get(phone);
  if (phoneOwner && Number(phoneOwner.id) !== Number(admin.id)) return;
  db.prepare(`
    UPDATE users
    SET phone = ?, status = 'disabled', updated_at = ?
    WHERE id = ?
  `).run(phone, new Date().toISOString(), admin.id);
}

function seedDatabase(db, { demoMode, initialAdminPhone }) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM users').get().count;
  if (count > 0) return;

  const timestamp = nowIso();
  db.exec('BEGIN');
  try {
    const insertPermission = db.prepare(
      'INSERT INTO permissions (code, name, group_name) VALUES (?, ?, ?)',
    );
    const permissionIds = new Map();
    for (const permission of permissionDefinitions) {
      const result = insertPermission.run(...permission);
      permissionIds.set(permission[0], Number(result.lastInsertRowid));
    }

    const insertRole = db.prepare(`
      INSERT INTO roles (code, name, description, admin_access, is_system, created_at)
      VALUES (?, ?, ?, ?, ?, ?)
    `);
    const insertRolePermission = db.prepare(
      'INSERT INTO role_permissions (role_id, permission_id) VALUES (?, ?)',
    );
    const roleIds = new Map();
    for (const role of roleDefinitions) {
      const result = insertRole.run(
        role.code,
        role.name,
        role.description,
        role.adminAccess,
        role.system,
        timestamp,
      );
      const roleId = Number(result.lastInsertRowid);
      roleIds.set(role.code, roleId);
      for (const permissionCode of role.permissions) {
        insertRolePermission.run(roleId, permissionIds.get(permissionCode));
      }
    }

    const insertUser = db.prepare(`
      INSERT INTO users
        (username, password_hash, display_name, email, phone, bio, status, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const userSeeds = [
      ['admin', '系统管理员', 'admin@example.org', '', '负责平台治理与权限配置'],
      ['content', '周老师', 'content@example.org', '', '关注知识内容与服务质量'],
      ['activity', '陈老师', 'activity@example.org', '', '负责活动组织与志愿者支持'],
      ['volunteer', '林知夏', 'volunteer@example.org', '', '希望用稳定的陪伴支持心青年'],
      ['xiaoyu', '小雨', 'xiaoyu@example.org', '', '社区活动志愿者'],
      ['lin', '阿林', 'lin@example.org', '', '持续参与融合活动'],
    ];
    const userIds = new Map();
    for (const [username, displayName, email, phone, bio] of userSeeds) {
      const isBootstrapAdmin = username === 'admin';
      const status = isBootstrapAdmin ? 'disabled' : demoMode ? 'active' : 'disabled';
      const configuredAdminPhone = String(initialAdminPhone || '').trim();
      const accountPhone =
        isBootstrapAdmin && /^1[3-9]\d{9}$/.test(configuredAdminPhone)
          ? configuredAdminPhone
          : phone;
      const result = insertUser.run(
        username,
        hashPassword(randomBytes(32).toString('base64url')),
        displayName,
        email,
        accountPhone,
        bio,
        status,
        timestamp,
        timestamp,
      );
      userIds.set(username, Number(result.lastInsertRowid));
    }

    const insertUserRole = db.prepare(
      'INSERT INTO user_roles (user_id, role_id) VALUES (?, ?)',
    );
    for (const [username, roleCode] of [
      ['admin', 'system_admin'],
      ['content', 'content_admin'],
      ['activity', 'activity_admin'],
      ['volunteer', 'volunteer'],
      ['xiaoyu', 'volunteer'],
      ['lin', 'volunteer'],
    ]) {
      insertUserRole.run(userIds.get(username), roleIds.get(roleCode));
    }

    const insertKnowledge = db.prepare(`
      INSERT INTO knowledge
        (title, summary, content, category, tags, visibility, status,
         author_id, reviewer_id, reviewed_at, created_at, updated_at,
         published_at, view_count)
      VALUES (?, ?, ?, ?, ?, ?, 'published', ?, ?, ?, ?, ?, ?, ?)
    `);
    const knowledgeSeeds = [
      [
        '认识心智障碍：从理解差异开始',
        '建立不贴标签、不以缺陷为中心的基础认知。',
        '心智障碍是一组与认知、学习和适应行为有关的差异，并不是某一种单一疾病。每位心青年都有自己的能力、偏好、沟通方式和生活目标。\n\n志愿服务中，观察具体需要比急着判断“他能不能”更重要。先了解活动环境、沟通工具和支持方式，再与本人、家属或组织工作人员确认所需支持。\n\n尊重选择权和节奏，不替对方做超出必要范围的决定。',
        '基础认知',
        '心智障碍,尊重差异,基础认知',
        'public',
        'content',
        'admin',
        daysFromNow(-42, 10),
        daysFromNow(-42, 10),
        daysFromNow(-42, 10),
        186,
      ],
      [
        '日常沟通的五个实用原则',
        '清楚、具体、给足时间，比提高音量更有效。',
        '1. 先建立注意力：称呼对方姓名，确认对方愿意交流。\n2. 使用简短、具体的句子，一次表达一个请求。\n3. 给对方处理信息的时间，不急着重复或替答。\n4. 可以提供文字、图片或手势等不同沟通方式。\n5. 不确定时直接、礼貌地询问，而不是凭经验猜测。\n\n避免使用“乖”“不正常”“他们这种人”等标签化表达。沟通的目标是互相理解，不是让对方符合单一标准。',
        '沟通技巧',
        '沟通,支持,具体表达',
        'public',
        'content',
        'admin',
        daysFromNow(-36, 14),
        daysFromNow(-36, 14),
        daysFromNow(-36, 14),
        143,
      ],
      [
        '志愿服务基本规范与边界',
        '尊重隐私、不越界承诺、及时报告风险。',
        '志愿者应遵守活动组织方的统一安排，佩戴身份标识，准时参加培训与活动。\n\n未经同意不拍摄、不发布服务对象照片；不在私人社交平台讨论可识别的个人信息。不承诺组织无法兑现的资源，不用个人判断替代专业支持。\n\n遇到健康、安全、走失、冲突或疑似权益受损情况，应立即联系现场负责人，不以“先观察看看”为由延迟报告。',
        '服务规范',
        '边界,隐私,安全',
        'public',
        'content',
        'admin',
        daysFromNow(-29, 9),
        daysFromNow(-29, 9),
        daysFromNow(-29, 9),
        98,
      ],
      [
        '常见问题：活动现场声音敏感怎么办？',
        '先降低刺激，再确认本人需要，不强行要求“适应”。',
        '当参与者对声音表现出明显不适时，可以先把他带到相对安静的区域，减少围观和追问。用简短语言确认是否需要休息、耳塞或离开现场。\n\n不要用“忍一忍就过去了”要求对方继续参与，也不要在未经同意时触碰或强行带离。若出现持续不适、呼吸异常等情况，及时联系现场负责人和家属。\n\n活动前可询问场地音响、人流和退出路线，提前准备安静的缓冲空间。',
        '常见问题',
        '声音敏感,情绪支持,环境支持',
        'public',
        'content',
        'admin',
        daysFromNow(-21, 11),
        daysFromNow(-21, 11),
        daysFromNow(-21, 11),
        76,
      ],
      [
        '服务案例：给选择留出真实空间',
        '一次手工活动中的参与支持记录。',
        '在一次小组手工活动中，一位参与者多次把材料放回桌面，没有开始制作。志愿者原以为他需要示范，准备直接替他完成。\n\n经过工作人员提醒，志愿者改为展示两种可选材料并询问：“你想先用哪一种？也可以先看看。”对方在短暂观察后选择了纸盘，并在自己愿意的节奏下完成作品。\n\n经验：支持不是把任务变快，而是保留选择权、等待时间和拒绝的权利。案例已做匿名化处理。',
        '服务案例',
        '案例,选择权,支持方式',
        'public',
        'content',
        'admin',
        daysFromNow(-14, 15),
        daysFromNow(-14, 15),
        daysFromNow(-14, 15),
        62,
      ],
      [
        '活动反馈怎么写：区分观察与判断',
        '用具体行为、情境和影响替代笼统评价。',
        '写反馈时，先记录发生了什么：时间、场景、可见行为和沟通过程。再分别写下自己的感受、当时的判断和仍需确认的问题。\n\n例如，“他今天不愿意参与”是判断；可以改为“活动开始后的十分钟内，他三次把材料推回桌面，并表示想休息”。\n\n不要把单次表现概括为性格标签。涉及健康、家庭和可识别身份的信息时，应遵循组织隐私规范。',
        '实践经验',
        '反馈,复盘,客观观察',
        'public',
        'content',
        'admin',
        daysFromNow(-8, 13),
        daysFromNow(-8, 13),
        daysFromNow(-8, 13),
        41,
      ],
      [
        '内部服务操作手册（2026版）',
        '活动前准备、现场协作与异常情况汇报流程。',
        '本手册用于组织内部培训。活动负责人需在开始前完成场地安全检查、参与者支持需求确认和志愿者分工。\n\n志愿者到岗后先完成签到，领取对应岗位卡。支持过程中遵循“观察—确认—协助—报告”的流程。所有涉及服务对象个人信息的记录仅存放在组织指定系统。\n\n如发生突发健康情况、走失风险、严重冲突或隐私泄露，先保障安全并联系现场负责人，活动结束后四小时内提交事件记录。',
        '内部培训',
        '内部,操作手册,流程',
        'internal',
        'content',
        'admin',
        daysFromNow(-25, 10),
        daysFromNow(-25, 10),
        daysFromNow(-25, 10),
        23,
      ],
      [
        '活动带领者培训讲义',
        '内部培训课件文字版，包含现场沟通与支持策略。',
        '培训目标：理解活动带领者角色，掌握基础支持策略，识别需要升级处理的现场情况。\n\n带领者需要在活动中做到指令清楚、节奏稳定、信息可预期。支持志愿者时，应给出具体任务和观察重点，避免只强调“多关心”。\n\n培训结束后完成情境演练与反馈记录。内部资料不得转发至组织外部。',
        '内部培训',
        '内部,培训,活动带领',
        'internal',
        'content',
        'admin',
        daysFromNow(-18, 16),
        daysFromNow(-18, 16),
        daysFromNow(-18, 16),
        19,
      ],
      [
        '未公开案例：过渡期的支持记录',
        '仅限获授权的服务团队成员查阅。',
        '本案例包含服务对象可识别信息，仅用于内部督导。案例记录了环境变化期间的沟通支持和多部门协作过程，不用于公开培训或宣传。\n\n查阅者不得截屏、转发或在工作群外讨论。如需引用，必须完成匿名化并经过内容管理员审核。',
        '受限案例',
        '受限,案例,内部督导',
        'restricted',
        'content',
        'admin',
        daysFromNow(-5, 17),
        daysFromNow(-5, 17),
        daysFromNow(-5, 17),
        7,
      ],
    ];
    for (const item of knowledgeSeeds) {
      insertKnowledge.run(
        item[0],
        item[1],
        item[2],
        item[3],
        item[4],
        item[5],
        userIds.get(item[6]),
        userIds.get(item[7]),
        item[8],
        item[9],
        item[10],
        item[10],
        item[11],
      );
    }

    const restrictedKnowledgeId = db
      .prepare("SELECT id FROM knowledge WHERE visibility = 'restricted' LIMIT 1")
      .get().id;
    db.prepare(`
      INSERT INTO knowledge_acl (knowledge_id, user_id, granted_by, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      restrictedKnowledgeId,
      userIds.get('volunteer'),
      userIds.get('admin'),
      timestamp,
    );
    db.prepare(`
      INSERT INTO user_permissions
        (user_id, permission_id, granted_by, created_at)
      VALUES (?, ?, ?, ?)
    `).run(
      userIds.get('volunteer'),
      permissionIds.get('knowledge.restricted.view'),
      userIds.get('admin'),
      timestamp,
    );

    const insertActivity = db.prepare(`
      INSERT INTO activities
        (title, starts_at, ends_at, location, introduction, content,
         requirements, notes, status, created_by, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    const activitySeeds = [
      [
        '初冬融合运动日',
        daysFromNow(6, 13),
        daysFromNow(6, 17),
        '青禾社区活动中心',
        '通过轻松的运动游戏，创造志愿者与心青年共同参与、彼此熟悉的社区空间。',
        '热身游戏、分组协作挑战、自由交流与活动总结。活动强调参与而非竞技。',
        '已参加基础培训；尊重参与者节奏；穿着便于活动的服装。',
        '活动开始前 20 分钟签到。请勿自行拍摄服务对象正脸。',
        'published',
        'activity',
      ],
      [
        '纸盘创作小组',
        daysFromNow(-7, 14),
        daysFromNow(-7, 16),
        '向阳工坊',
        '以纸盘创作为媒介，练习选择、表达与共同完成。',
        '材料探索、自由创作、作品分享。',
        '有耐心，愿意等待参与者的表达节奏。',
        '不代替参与者完成作品。',
        'completed',
        'activity',
      ],
      [
        '家庭支持对话会',
        daysFromNow(-18, 9),
        daysFromNow(-18, 11),
        '青禾社区活动中心 2 楼',
        '为家庭照顾者提供交流与资源信息，志愿者协助现场支持。',
        '签到引导、茶歇准备、儿童活动区陪伴。',
        '具备基础沟通经验，遵守隐私规范。',
        '现场信息不得对外传播。',
        'completed',
        'activity',
      ],
      [
        '周末同伴交流活动',
        daysFromNow(18, 14),
        daysFromNow(18, 16),
        '城南青年空间',
        '通过桌游和自由交流建立稳定的同伴联系。',
        '桌游体验、兴趣分享、活动复盘。',
        '完成基础培训，提前了解桌游规则。',
        '活动人数限 16 人，确认参加后如需请假请提前一天联系。',
        'draft',
        'activity',
      ],
    ];
    for (const item of activitySeeds) {
      insertActivity.run(
        item[0],
        item[1],
        item[2],
        item[3],
        item[4],
        item[5],
        item[6],
        item[7],
        item[8],
        userIds.get(item[9]),
        timestamp,
        timestamp,
      );
    }

    const activityIds = db.prepare('SELECT id, status FROM activities ORDER BY id').all();
    const insertParticipant = db.prepare(`
      INSERT INTO activity_participants (activity_id, user_id, status, joined_at)
      VALUES (?, ?, 'joined', ?)
    `);
    insertParticipant.run(activityIds[0].id, userIds.get('volunteer'), timestamp);
    insertParticipant.run(activityIds[1].id, userIds.get('volunteer'), timestamp);
    insertParticipant.run(activityIds[1].id, userIds.get('xiaoyu'), timestamp);
    insertParticipant.run(activityIds[2].id, userIds.get('lin'), timestamp);

    const insertFeedback = db.prepare(`
      INSERT INTO feedback
        (activity_id, user_id, participation_date, problems, observations,
         communication_difficulties, learnings, new_understanding, suggestions,
         additional, status, visibility, reviewer_id, review_note, admin_reply,
         tags, featured, submitted_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertFeedback.run(
      activityIds[1].id,
      userIds.get('xiaoyu'),
      daysFromNow(-7, 14),
      '活动开始时，参与者对新材料比较陌生，不太确定从哪里开始。',
      '一位参与者在材料桌前观察了约五分钟，之后选择了纸盘和蓝色贴纸；完成作品后主动展示给同桌。',
      '我问“你想做什么”时对方没有立即回应。后来改为展示两个选项，沟通更顺畅。',
      '等待也是一种支持。给出具体选项比开放式提问更容易开始。',
      '参与意愿并不等于马上行动，需要给观察和准备的时间。',
      '下次可以在材料区放一张简单的步骤图，并保留安静角落。',
      '已征得参与者口头同意记录活动过程，未拍摄正脸。',
      'approved',
      'public',
      userIds.get('content'),
      '记录具体，已做隐私检查。',
      '谢谢你把“等待”写得很具体，这对其他志愿者很有帮助。',
      '沟通,选择权,活动复盘',
      1,
      daysFromNow(-6, 19),
      daysFromNow(-5, 10),
    );
    insertFeedback.run(
      activityIds[2].id,
      userIds.get('lin'),
      daysFromNow(-18, 9),
      '现场签到人流集中，短时间内有些拥挤。',
      '部分家庭在入口处等待时间较长，志愿者引导后秩序改善。',
      '说明路线时可以配合手势和简短文字。',
      '活动动线需要提前演练。',
      '照顾者在等待时也需要清晰的信息。',
      '准备入口分流图，并安排一名机动志愿者。',
      '',
      'pending',
      'private',
      null,
      '',
      '',
      '活动组织',
      0,
      daysFromNow(-17, 18),
      null,
    );

    const insertQuestion = db.prepare(`
      INSERT INTO questions
        (user_id, title, content, category, status, answer, answered_by,
         answered_at, is_faq, created_at, updated_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertQuestion.run(
      userIds.get('lin'),
      '活动时间临时变化，如何向参与者解释？',
      '如果活动需要推迟半小时，怎样说明更容易理解，也能减少焦虑？',
      '沟通与互动',
      'replied',
      '建议尽早说明，使用明确的时间点，并分别说明“发生什么、何时开始、期间可以做什么”。可以使用时钟、图片或简单文字辅助。不要只说“稍等一下”。如有条件，提前提供一个可休息或等待的区域，并安排人员回应重复询问。',
      userIds.get('content'),
      daysFromNow(-10, 15),
      1,
      daysFromNow(-12, 10),
      daysFromNow(-10, 15),
    );
    insertQuestion.run(
      userIds.get('xiaoyu'),
      '第一次参加活动前需要做什么准备？',
      '想了解基础培训之外，现场最需要提前熟悉的内容。',
      '志愿者自身困惑',
      'replied',
      '先阅读当次活动的岗位说明和注意事项，确认集合时间、联系人、退出路线与安静空间位置。提前了解活动中可能出现的支持需求，但不要预设每位参与者都需要同一种帮助。到岗后主动向负责人确认自己的职责边界。',
      userIds.get('activity'),
      daysFromNow(-4, 11),
      1,
      daysFromNow(-6, 20),
      daysFromNow(-4, 11),
    );
    insertQuestion.run(
      userIds.get('volunteer'),
      '参与者重复提问时应该怎样回应？',
      '我担心每次都回答会强化重复行为，但不回应又怕对方感到被忽视。',
      '行为理解',
      'processing',
      '',
      null,
      null,
      0,
      daysFromNow(-1, 18),
      daysFromNow(-1, 18),
    );

    const insertPost = db.prepare(`
      INSERT INTO community_posts
        (user_id, activity_id, title, content, category, status, review_note,
         reviewer_id, created_at, updated_at, reviewed_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertPost.run(
      userIds.get('xiaoyu'),
      activityIds[1].id,
      '从“帮忙完成”到“陪他选择”',
      '这次活动里，我最大的调整是把手收回来一点。以前看到对方停下来，会下意识示范或直接帮忙。后来我试着展示可选项、等一等，再问一句“需要我做什么吗”。作品完成得慢一些，但那是他自己的作品。\n\n复盘时我把这个变化写进了反馈，也提醒自己：支持不是替对方完成。',
      '活动心得',
      'published',
      '内容真实，无隐私信息。',
      userIds.get('content'),
      daysFromNow(-5, 20),
      daysFromNow(-5, 20),
      daysFromNow(-4, 10),
    );
    insertPost.run(
      userIds.get('lin'),
      activityIds[2].id,
      '入口引导的一点小经验',
      '人多的活动可以把路线拆成几个短提示，例如“先签到”“向右走”“在这里等”。配合手势会比一次说完整流程更容易跟上。',
      '经验分享',
      'published',
      '已审核。',
      userIds.get('activity'),
      daysFromNow(-9, 17),
      daysFromNow(-9, 17),
      daysFromNow(-8, 9),
    );
    insertPost.run(
      userIds.get('volunteer'),
      null,
      '关于活动结束后的过渡时间',
      '我发现活动结束时大家陆续离开，现场会变得很忙。是否可以在结束前十分钟做一次明确提醒，让大家知道接下来会发生什么？',
      '改进建议',
      'pending',
      '',
      null,
      daysFromNow(-1, 20),
      daysFromNow(-1, 20),
      null,
    );

    const postIds = db.prepare('SELECT id FROM community_posts ORDER BY id').all();
    const insertComment = db.prepare(`
      INSERT INTO comments (post_id, user_id, content, status, created_at)
      VALUES (?, ?, ?, 'published', ?)
    `);
    insertComment.run(
      postIds[0].id,
      userIds.get('lin'),
      '“把手收回来一点”这个描述很准确，我也在练习多等一会儿。',
      daysFromNow(-4, 16),
    );
    insertComment.run(
      postIds[0].id,
      userIds.get('content'),
      '谢谢分享。等待时也可以留意对方是否在用眼神、手势表达需要。',
      daysFromNow(-3, 11),
    );

    const publishedKnowledge = db
      .prepare("SELECT id FROM knowledge WHERE status = 'published' ORDER BY id LIMIT 2")
      .all();
    const insertFavorite = db.prepare(
      'INSERT INTO favorites (user_id, knowledge_id, created_at) VALUES (?, ?, ?)',
    );
    insertFavorite.run(userIds.get('volunteer'), publishedKnowledge[0].id, timestamp);
    insertFavorite.run(userIds.get('volunteer'), publishedKnowledge[1].id, timestamp);

    const insertHistory = db.prepare(`
      INSERT INTO reading_history (user_id, knowledge_id, last_read_at, read_count)
      VALUES (?, ?, ?, ?)
    `);
    insertHistory.run(userIds.get('volunteer'), publishedKnowledge[0].id, daysFromNow(-2, 8), 3);
    insertHistory.run(userIds.get('volunteer'), publishedKnowledge[1].id, daysFromNow(-1, 21), 1);

    db.prepare(`
      INSERT INTO audit_logs
        (actor_id, action, entity_type, entity_id, details, ip, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `).run(
      userIds.get('admin'),
      'system.seed',
      'system',
      1,
      JSON.stringify({ message: '初始化演示数据' }),
      '127.0.0.1',
      timestamp,
    );

    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}
