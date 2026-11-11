import {
  assertSameOrigin,
  getClientIp,
  HttpError,
  readJson,
  sendJson,
} from '../http.js';
import { recordAudit } from '../audit.js';
import { serializeUser } from '../serializers.js';

export function createAuthRoutes({ db, auth, secureCookies }) {
  const loginAttempts = new Map();

  function checkLoginRate(ip) {
    const current = Date.now();
    const entry = loginAttempts.get(ip);
    if (!entry || entry.resetAt < current) {
      loginAttempts.set(ip, { count: 0, resetAt: current + 10 * 60 * 1000 });
      return;
    }
    if (entry.count >= 20) {
      throw new HttpError(429, '登录尝试过于频繁，请稍后再试', 'rate_limited');
    }
  }

  function failLogin(ip) {
    const current = Date.now();
    const entry = loginAttempts.get(ip) || {
      count: 0,
      resetAt: current + 10 * 60 * 1000,
    };
    entry.count += 1;
    loginAttempts.set(ip, entry);
  }

  return async function handle(req, res, url) {
    if (url.pathname === '/api/auth/sms/send' && req.method === 'POST') {
      assertSameOrigin(req);
      const input = await readJson(req);
      const result = await auth.sendSmsCode({
        phone: input.phone,
        purpose: input.purpose,
        portal: input.portal === 'admin' ? 'admin' : 'volunteer',
        setupToken: input.setupToken,
        ip: getClientIp(req),
      });
      sendJson(res, 200, result);
      return true;
    }

    if (url.pathname === '/api/setup/status' && req.method === 'GET') {
      sendJson(res, 200, auth.setupStatus());
      return true;
    }

    if (url.pathname === '/api/setup/admin' && req.method === 'POST') {
      assertSameOrigin(req);
      const input = await readJson(req);
      const result = auth.setupAdmin(input, secureCookies);
      res.setHeader('Set-Cookie', result.cookie);
      recordAudit(db, req, result.user, 'setup.admin_created', 'user', result.user.id);
      sendJson(res, 201, { user: serializeUser(result.user) });
      return true;
    }

    if (url.pathname === '/api/auth/register' && req.method === 'POST') {
      assertSameOrigin(req);
      const input = await readJson(req);
      const result = auth.register(input, secureCookies);
      res.setHeader('Set-Cookie', result.cookie);
      recordAudit(db, req, result.user, 'auth.register', 'user', result.user.id);
      sendJson(res, 201, { user: serializeUser(result.user) });
      return true;
    }

    if (url.pathname === '/api/auth/login' && req.method === 'POST') {
      assertSameOrigin(req);
      const ip = getClientIp(req) || 'unknown';
      checkLoginRate(ip);
      try {
        const input = await readJson(req);
        const portal = input.portal === 'admin' ? 'admin' : 'volunteer';
        const result = auth.login({ ...input, portal }, secureCookies);
        loginAttempts.delete(ip);
        res.setHeader('Set-Cookie', result.cookie);
        recordAudit(db, req, result.user, 'auth.login', 'user', result.user.id, {
          portal,
        });
        sendJson(res, 200, { user: serializeUser(result.user) });
      } catch (error) {
        failLogin(ip);
        throw error;
      }
      return true;
    }

    if (url.pathname === '/api/auth/logout' && req.method === 'POST') {
      assertSameOrigin(req);
      const cookie = auth.logout(req, secureCookies);
      res.setHeader('Set-Cookie', cookie);
      sendJson(res, 200, { ok: true });
      return true;
    }

    if (url.pathname === '/api/auth/me' && req.method === 'GET') {
      const user = auth.requireUser(req);
      sendJson(res, 200, { user: serializeUser(user) });
      return true;
    }

    if (url.pathname === '/api/auth/profile' && req.method === 'PATCH') {
      assertSameOrigin(req);
      const user = auth.requirePermission(req, 'profile.edit');
      const input = await readJson(req);
      const updated = auth.updateProfile(user, input);
      recordAudit(db, req, user, 'profile.update', 'user', user.id);
      sendJson(res, 200, { user: serializeUser(updated) });
      return true;
    }

    if (url.pathname === '/api/session' && req.method === 'GET') {
      const user = auth.getSessionUser(req);
      sendJson(res, 200, {
        authenticated: Boolean(user),
        user: user ? serializeUser(user) : null,
      });
      return true;
    }

    return false;
  };
}
