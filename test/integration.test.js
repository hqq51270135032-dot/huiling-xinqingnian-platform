import assert from 'node:assert/strict';
import { randomBytes, randomInt } from 'node:crypto';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, test } from 'node:test';
import { startServer } from '../server/index.js';
import { createSmsSender } from '../server/sms.js';

let app;
let tempRoot;
let adminPhone;
let setupToken;
let adminCookie;
let volunteerPhone;
let volunteerCookie;
let volunteerId;
let completedActivityId;
let submittedFeedbackId;

const smsCodes = new Map();
const smsProvider = {
  name: 'test-capture',
  development: false,
  isConfigured: true,
  async send({ phone, code, purpose }) {
    smsCodes.set(`${purpose}:${phone}`, code);
  },
};

function testPhone() {
  return `13${randomInt(1, 10)}${String(randomInt(0, 100_000_000)).padStart(8, '0')}`;
}

async function request(path, options = {}, baseUrl = app?.url) {
  const headers = { ...(options.headers || {}) };
  if (options.cookie) headers.Cookie = options.cookie;
  let body = options.body;
  if (options.json !== undefined) {
    headers['Content-Type'] = 'application/json';
    body = JSON.stringify(options.json);
  }
  const response = await fetch(`${baseUrl}${path}`, {
    method: options.method || 'GET',
    headers,
    body,
  });
  const payload = await response.json().catch(() => ({}));
  return { response, payload };
}

function cookieFrom(response) {
  const setCookies = response.headers.getSetCookie?.() || [];
  const raw = setCookies[0] || response.headers.get('set-cookie') || '';
  return raw.split(';')[0];
}

async function sendSms({
  phone,
  purpose,
  portal = 'volunteer',
  setupToken: token,
} = {}) {
  const result = await request('/api/auth/sms/send', {
    method: 'POST',
    json: { phone, purpose, portal, setupToken: token },
  });
  return {
    ...result,
    code: smsCodes.get(`${purpose}:${phone || adminPhone}`),
  };
}

async function registerPhone(phone, nickname) {
  const sms = await sendSms({ phone, purpose: 'register' });
  assert.equal(sms.response.status, 200);
  return request('/api/auth/register', {
    method: 'POST',
    json: { phone, code: sms.code, nickname },
  });
}

async function loginPhone(phone, portal = 'volunteer', code) {
  let verificationCode = code;
  if (!verificationCode) {
    const sms = await sendSms({ phone, purpose: 'login', portal });
    assert.equal(sms.response.status, 200);
    verificationCode = sms.code;
  }
  return request('/api/auth/login', {
    method: 'POST',
    json: { phone, code: verificationCode, portal },
  });
}

function bypassSmsCooldown(phone, purpose) {
  app.db.prepare(`
    UPDATE sms_verification_codes
    SET created_at = ?
    WHERE phone = ? AND purpose = ?
  `).run(new Date(Date.now() - 2 * 60 * 1000).toISOString(), phone, purpose);
}

before(async () => {
  tempRoot = mkdtempSync(join(tmpdir(), 'xinqingnian-phone-test-'));
  adminPhone = testPhone();
  setupToken = randomBytes(4).toString('hex');
  app = await startServer({
    port: 0,
    host: '127.0.0.1',
    dbPath: join(tempRoot, 'test.db'),
    uploadDir: join(tempRoot, 'uploads'),
    seed: true,
    secureCookies: false,
    demoMode: true,
    initialAdminPhone: adminPhone,
    initialSetupToken: setupToken,
    smsProvider,
    smsCooldownSeconds: 60,
  });
});

after(async () => {
  await app?.close();
  if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
});

test('initial super admin requires deployment token and verified configured phone', async () => {
  const status = await request('/api/setup/status');
  assert.equal(status.response.status, 200);
  assert.equal(status.payload.configured, true);
  assert.equal(status.payload.completed, false);
  assert.match(status.payload.maskedPhone, /^\d{3}\*{4}\d{4}$/);

  const invalidToken = await sendSms({
    purpose: 'setup',
    setupToken: 'wrong-token',
  });
  assert.equal(invalidToken.response.status, 403);
  assert.equal(invalidToken.payload.code, 'invalid_setup_token');

  const sms = await sendSms({ purpose: 'setup', setupToken });
  assert.equal(sms.response.status, 200);
  assert.match(sms.code, /^\d{6}$/);
  const stored = app.db.prepare(`
    SELECT code_hash FROM sms_verification_codes
    WHERE phone = ? AND purpose = 'setup'
    ORDER BY id DESC LIMIT 1
  `).get(adminPhone);
  assert.notEqual(stored.code_hash, sms.code);

  const setup = await request('/api/setup/admin', {
    method: 'POST',
    json: { setupToken, code: sms.code },
  });
  assert.equal(setup.response.status, 201);
  assert.equal(setup.payload.user.displayName, '平台管理员');
  assert.equal(setup.payload.user.phone, adminPhone);
  assert.equal(
    setup.payload.user.roles.some((role) => role.code === 'system_admin'),
    true,
  );
  adminCookie = cookieFrom(setup.response);

  const completed = await request('/api/setup/status');
  assert.equal(completed.payload.completed, true);
  const repeatedSetup = await request('/api/setup/admin', {
    method: 'POST',
    json: { setupToken, code: '123456' },
  });
  assert.equal(repeatedSetup.response.status, 409);
  assert.equal(repeatedSetup.payload.code, 'setup_completed');
});

test('registration validates phone, code, nickname and phone uniqueness', async () => {
  const invalidPhone = await sendSms({
    phone: '12345',
    purpose: 'register',
  });
  assert.equal(invalidPhone.response.status, 400);
  assert.equal(invalidPhone.payload.code, 'invalid_phone');

  const wrongCodePhone = testPhone();
  const wrongCodeSms = await sendSms({
    phone: wrongCodePhone,
    purpose: 'register',
  });
  assert.equal(wrongCodeSms.response.status, 200);
  const wrongCode = await request('/api/auth/register', {
    method: 'POST',
    json: {
      phone: wrongCodePhone,
      code: '000000',
      nickname: '错误验证码',
    },
  });
  assert.equal(wrongCode.response.status, 400);
  assert.equal(wrongCode.payload.code, 'code_invalid');

  const emptyNicknamePhone = testPhone();
  const emptyNicknameSms = await sendSms({
    phone: emptyNicknamePhone,
    purpose: 'register',
  });
  const emptyNickname = await request('/api/auth/register', {
    method: 'POST',
    json: {
      phone: emptyNicknamePhone,
      code: emptyNicknameSms.code,
      nickname: '',
    },
  });
  assert.equal(emptyNickname.response.status, 400);
  assert.equal(emptyNickname.payload.code, 'validation_error');

  volunteerPhone = testPhone();
  const registered = await registerPhone(volunteerPhone, '手机志愿者');
  assert.equal(registered.response.status, 201);
  assert.equal(registered.payload.user.displayName, '手机志愿者');
  assert.equal(registered.payload.user.phone, volunteerPhone);
  assert.equal(registered.payload.user.roles[0].code, 'volunteer');
  assert.ok(registered.payload.user.createdAt);
  assert.ok(registered.payload.user.lastLoginAt);
  volunteerCookie = cookieFrom(registered.response);
  volunteerId = registered.payload.user.id;

  const ordinaryAdminPortal = await sendSms({
    phone: volunteerPhone,
    purpose: 'login',
    portal: 'admin',
  });
  assert.equal(ordinaryAdminPortal.response.status, 403);
  assert.equal(ordinaryAdminPortal.payload.code, 'admin_required');

  const duplicate = await sendSms({
    phone: volunteerPhone,
    purpose: 'register',
  });
  assert.equal(duplicate.response.status, 409);
  assert.equal(duplicate.payload.code, 'phone_registered');
});

test('unregistered phone cannot request login or log in', async () => {
  const unregisteredPhone = testPhone();
  const sms = await sendSms({
    phone: unregisteredPhone,
    purpose: 'login',
  });
  assert.equal(sms.response.status, 404);
  assert.equal(sms.payload.code, 'phone_not_registered');
  assert.match(sms.payload.error, /尚未注册/);

  const directLogin = await request('/api/auth/login', {
    method: 'POST',
    json: {
      phone: unregisteredPhone,
      code: '123456',
      portal: 'volunteer',
    },
  });
  assert.equal(directLogin.response.status, 404);
  assert.equal(directLogin.payload.code, 'phone_not_registered');
});

test('registered volunteer can log in, log out and log in again', async () => {
  const firstLogin = await loginPhone(volunteerPhone);
  assert.equal(firstLogin.response.status, 200);
  const firstCookie = cookieFrom(firstLogin.response);
  assert.equal(firstLogin.payload.user.isAdmin, false);
  assert.equal(firstLogin.payload.user.permissions.includes('knowledge.public.view'), true);

  const me = await request('/api/auth/me', { cookie: firstCookie });
  assert.equal(me.response.status, 200);
  assert.equal(me.payload.user.phone, volunteerPhone);

  const logout = await request('/api/auth/logout', {
    method: 'POST',
    cookie: firstCookie,
  });
  assert.equal(logout.response.status, 200);
  const afterLogout = await request('/api/auth/me', { cookie: firstCookie });
  assert.equal(afterLogout.response.status, 401);

  bypassSmsCooldown(volunteerPhone, 'login');
  const secondLogin = await loginPhone(volunteerPhone);
  assert.equal(secondLogin.response.status, 200);
  assert.equal(secondLogin.payload.user.id, volunteerId);
});

test('expired codes, wrong-code limits, cooldown and unauthenticated access are enforced', async () => {
  const expiredPhone = testPhone();
  const expiredSms = await sendSms({
    phone: expiredPhone,
    purpose: 'register',
  });
  app.db.prepare(`
    UPDATE sms_verification_codes
    SET expires_at = ?
    WHERE phone = ? AND purpose = 'register'
  `).run(new Date(Date.now() - 1000).toISOString(), expiredPhone);
  const expired = await request('/api/auth/register', {
    method: 'POST',
    json: {
      phone: expiredPhone,
      code: expiredSms.code,
      nickname: '过期验证码',
    },
  });
  assert.equal(expired.response.status, 400);
  assert.equal(expired.payload.code, 'code_expired');

  const lockedPhone = testPhone();
  const lockedSms = await sendSms({
    phone: lockedPhone,
    purpose: 'register',
  });
  let lockedResult;
  for (let index = 0; index < 5; index += 1) {
    const wrongCode = `${lockedSms.code.slice(0, 5)}${lockedSms.code.endsWith('0') ? '1' : '0'}`;
    lockedResult = await request('/api/auth/register', {
      method: 'POST',
      json: {
        phone: lockedPhone,
        code: wrongCode,
        nickname: '错误次数测试',
      },
    });
  }
  assert.equal(lockedResult.response.status, 429);
  assert.equal(lockedResult.payload.code, 'code_locked');

  const cooldownPhone = testPhone();
  const firstSend = await sendSms({
    phone: cooldownPhone,
    purpose: 'register',
  });
  assert.equal(firstSend.response.status, 200);
  const secondSend = await sendSms({
    phone: cooldownPhone,
    purpose: 'register',
  });
  assert.equal(secondSend.response.status, 429);
  assert.equal(secondSend.payload.code, 'sms_cooldown');

  const unauthenticated = await request('/api/admin/stats');
  assert.equal(unauthenticated.response.status, 401);
});

test('admin login preserves existing RBAC and one user can hold multiple roles', async () => {
  const stats = await request('/api/admin/stats', { cookie: adminCookie });
  assert.equal(stats.response.status, 200);

  const users = await request('/api/admin/users', { cookie: adminCookie });
  const volunteer = users.payload.items.find((user) => user.id === volunteerId);
  assert.equal(volunteer.phone, volunteerPhone);
  const roles = await request('/api/admin/roles', { cookie: adminCookie });
  const volunteerRole = roles.payload.items.find((role) => role.code === 'volunteer');
  const contentRole = roles.payload.items.find((role) => role.code === 'content_admin');
  const activityRole = roles.payload.items.find((role) => role.code === 'activity_admin');
  const assigned = await request(`/api/admin/users/${volunteerId}/roles`, {
    method: 'PUT',
    cookie: adminCookie,
    json: { roleIds: [volunteerRole.id, contentRole.id, activityRole.id] },
  });
  assert.equal(assigned.response.status, 200);
  assert.equal(assigned.payload.item.roles.length, 3);

  bypassSmsCooldown(volunteerPhone, 'login');
  const adminPortalLogin = await loginPhone(volunteerPhone, 'admin');
  assert.equal(adminPortalLogin.response.status, 200);
  assert.equal(adminPortalLogin.payload.user.isAdmin, true);
  assert.equal(adminPortalLogin.payload.user.roles.length, 3);
  const multiRoleCookie = cookieFrom(adminPortalLogin.response);
  const knowledge = await request('/api/knowledge?scope=manage', {
    cookie: multiRoleCookie,
  });
  assert.equal(knowledge.response.status, 200);
});

test('knowledge isolation and activity feedback flow remain functional', async () => {
  const viewerPhone = testPhone();
  const viewerRegistration = await registerPhone(viewerPhone, '回归志愿者');
  assert.equal(viewerRegistration.response.status, 201);
  const viewerCookie = cookieFrom(viewerRegistration.response);
  const knowledge = await request('/api/knowledge', { cookie: viewerCookie });
  assert.equal(knowledge.response.status, 200);
  assert.equal(
    knowledge.payload.items.some((item) => item.visibility === 'internal'),
    false,
  );

  const now = new Date();
  const created = await request('/api/activities', {
    method: 'POST',
    cookie: adminCookie,
    json: {
      title: '手机认证回归活动',
      startsAt: new Date(now.getTime() - 3 * 60 * 60 * 1000).toISOString(),
      endsAt: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      location: '测试活动室',
      introduction: '验证手机认证改造不影响活动反馈',
      content: '观察、交流与复盘',
      requirements: '遵守隐私规范',
      notes: '不记录可识别信息',
      status: 'completed',
    },
  });
  assert.equal(created.response.status, 201);
  completedActivityId = created.payload.item.id;

  const feedback = await request('/api/feedback', {
    method: 'POST',
    cookie: viewerCookie,
    json: {
      activityId: completedActivityId,
      participationDate: now.toISOString(),
      problems: '开始时需要熟悉环境',
      observations: '参与者观察材料后自行选择，并在十分钟后开始创作。',
      learnings: '等待是有效的支持方式。',
    },
  });
  assert.equal(feedback.response.status, 201);
  submittedFeedbackId = feedback.payload.item.id;

  const reviewed = await request(`/api/feedback/${submittedFeedbackId}/review`, {
    method: 'POST',
    cookie: adminCookie,
    json: {
      status: 'approved',
      visibility: 'public',
      tags: '沟通,等待',
      reviewNote: '已完成匿名化检查',
      adminReply: '记录具体。',
      featured: true,
    },
  });
  assert.equal(reviewed.response.status, 200);
  assert.equal(reviewed.payload.item.visibility, 'public');

  const converted = await request(`/api/feedback/${submittedFeedbackId}/convert`, {
    method: 'POST',
    cookie: adminCookie,
    json: {
      title: '手机认证回归知识草稿',
      category: '服务案例',
      visibility: 'public',
    },
  });
  assert.equal(converted.response.status, 201);
  assert.equal(converted.payload.status, 'draft');
});

test('production setup uses configured phone and does not expose demo logins', async () => {
  const productionRoot = mkdtempSync(join(tmpdir(), 'xinqingnian-production-phone-'));
  const productionAdminPhone = testPhone();
  const productionSetupToken = randomBytes(4).toString('hex');
  const productionCodes = new Map();
  const productionSmsProvider = {
    name: 'production-test',
    development: false,
    isConfigured: true,
    async send({ phone, code, purpose }) {
      productionCodes.set(`${purpose}:${phone}`, code);
    },
  };
  const productionApp = await startServer({
    port: 0,
    host: '127.0.0.1',
    dbPath: join(productionRoot, 'production.db'),
    uploadDir: join(productionRoot, 'uploads'),
    seed: true,
    demoMode: false,
    initialAdminPhone: productionAdminPhone,
    initialSetupToken: productionSetupToken,
    smsProvider: productionSmsProvider,
    smsCooldownSeconds: 0,
    secureCookies: false,
  });
  try {
    const health = await request('/api/health', {}, productionApp.url);
    assert.equal(health.response.status, 200);
    const send = await request(
      '/api/auth/sms/send',
      {
        method: 'POST',
        json: { purpose: 'setup', setupToken: productionSetupToken },
      },
      productionApp.url,
    );
    assert.equal(send.response.status, 200);
    const setup = await request(
      '/api/setup/admin',
      {
        method: 'POST',
        json: {
          setupToken: productionSetupToken,
          code: productionCodes.get(`setup:${productionAdminPhone}`),
        },
      },
      productionApp.url,
    );
    assert.equal(setup.response.status, 201);
    assert.equal(setup.payload.user.phone, productionAdminPhone);

    const demoPhoneAttempt = await request(
      '/api/auth/sms/send',
      {
        method: 'POST',
        json: { phone: '13800000000', purpose: 'login' },
      },
      productionApp.url,
    );
    assert.equal(demoPhoneAttempt.response.status, 404);
  } finally {
    await productionApp.close();
    rmSync(productionRoot, { recursive: true, force: true });
  }

  assert.throws(
    () => createSmsSender({ provider: 'console', production: true }),
    /not allowed/,
  );
  const unconfiguredAliyun = createSmsSender({ provider: 'aliyun', aliyun: {} });
  assert.equal(unconfiguredAliyun.isConfigured, false);
  await assert.rejects(
    unconfiguredAliyun.send({
      phone: productionAdminPhone,
      code: '123456',
      purpose: 'login',
    }),
    (error) => error.code === 'sms_not_configured',
  );
});
