import { createServer } from 'node:http';
import { accessSync, constants, createReadStream, statSync } from 'node:fs';
import { dirname, extname, join, normalize, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import {
  createDatabase,
  DEFAULT_DB_PATH,
  DEFAULT_UPLOAD_DIR,
} from './db.js';
import { createAuthService } from './auth.js';
import { createApiRouter } from './api.js';
import { HttpError, sendJson } from './http.js';
import { createSmsSender } from './sms.js';

const currentDir = dirname(fileURLToPath(import.meta.url));
const projectRoot = resolve(currentDir, '..');
export const PUBLIC_DIR = resolve(projectRoot, 'public');

const STATIC_MIME = new Map([
  ['.html', 'text/html; charset=utf-8'],
  ['.css', 'text/css; charset=utf-8'],
  ['.js', 'text/javascript; charset=utf-8'],
  ['.json', 'application/json; charset=utf-8'],
  ['.svg', 'image/svg+xml'],
  ['.png', 'image/png'],
  ['.jpg', 'image/jpeg'],
  ['.jpeg', 'image/jpeg'],
  ['.webp', 'image/webp'],
  ['.ico', 'image/x-icon'],
  ['.woff2', 'font/woff2'],
]);

function applySecurityHeaders(res) {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; img-src 'self' data: blob:; media-src 'self'; style-src 'self' 'unsafe-inline'; script-src 'self'; connect-src 'self'; frame-ancestors 'none'; base-uri 'self'; form-action 'self'",
  );
  res.setHeader('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');
}

function serveStatic(req, res, url) {
  let pathname;
  try {
    pathname = decodeURIComponent(url.pathname);
  } catch {
    throw new HttpError(400, '请求路径格式不正确', 'invalid_path');
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const safePath = normalize(join(PUBLIC_DIR, requested));
  if (!safePath.startsWith(`${PUBLIC_DIR}\\`) && !safePath.startsWith(`${PUBLIC_DIR}/`)) {
    throw new HttpError(404, '页面不存在', 'not_found');
  }
  let filePath = safePath;
  try {
    accessSync(filePath, constants.R_OK);
    if (!statSync(filePath).isFile()) throw new Error('not a file');
  } catch {
    if (req.method === 'GET' && req.headers.accept?.includes('text/html')) {
      filePath = join(PUBLIC_DIR, 'index.html');
    } else {
      throw new HttpError(404, '资源不存在', 'not_found');
    }
  }
  const ext = extname(filePath).toLowerCase();
  const mime = STATIC_MIME.get(ext) || 'application/octet-stream';
  const stat = statSync(filePath);
  res.writeHead(200, {
    'Content-Type': mime,
    'Content-Length': stat.size,
    'Cache-Control': 'no-cache',
  });
  if (req.method === 'HEAD') {
    res.end();
    return;
  }
  createReadStream(filePath).on('error', () => res.destroy()).pipe(res);
}

export async function startServer(options = {}) {
  const {
    port = Number(process.env.PORT) || 4173,
    host = process.env.HOST || '127.0.0.1',
    dbPath = process.env.DB_PATH || DEFAULT_DB_PATH,
    uploadDir = process.env.UPLOAD_DIR || DEFAULT_UPLOAD_DIR,
    seed = true,
    secureCookies = process.env.COOKIE_SECURE === '1',
    demoMode = process.env.NODE_ENV !== 'production' && process.env.DEMO_MODE !== '0',
    initialAdminPhone = process.env.INITIAL_ADMIN_PHONE || '',
    initialSetupToken = process.env.INITIAL_SETUP_TOKEN || '',
    smsProvider,
    smsCodeSecret = process.env.SMS_CODE_SECRET || '',
    smsCodeTtlSeconds = Number(process.env.SMS_CODE_TTL_SECONDS) || 300,
    smsCooldownSeconds = Number(process.env.SMS_COOLDOWN_SECONDS) || 60,
  } = options;

  const db = createDatabase({ dbPath, seed, demoMode, initialAdminPhone });
  const smsSender =
    smsProvider ||
    createSmsSender({
      production: process.env.NODE_ENV === 'production',
      outboxPath:
        process.env.SMS_DEV_OUTBOX_PATH ||
        join(projectRoot, 'data', 'sms-outbox.log'),
    });
  const auth = createAuthService(db, {
    smsSender,
    initialAdminPhone,
    initialSetupToken,
    smsCodeSecret,
    smsCodeTtlSeconds,
    smsCooldownSeconds,
  });
  auth.purgeExpiredSessions();
  const api = createApiRouter({ db, auth, uploadDir, secureCookies });
  const server = createServer(async (req, res) => {
    applySecurityHeaders(res);
    try {
      const url = new URL(req.url || '/', `http://${req.headers.host || 'localhost'}`);
      if (url.pathname.startsWith('/api/')) {
        await api(req, res, url);
        return;
      }
      if (!['GET', 'HEAD'].includes(req.method)) {
        throw new HttpError(405, '请求方法不允许', 'method_not_allowed');
      }
      serveStatic(req, res, url);
    } catch (error) {
      if (res.headersSent) {
        res.destroy();
        return;
      }
      if (error instanceof HttpError) {
        sendJson(res, error.status, {
          error: error.message,
          code: error.code,
        });
      } else {
        console.error(error);
        sendJson(res, 500, {
          error: '服务器处理请求时出现异常',
          code: 'internal_error',
        });
      }
    }
  });

  const sessionTimer = setInterval(() => {
    try {
      auth.purgeExpiredSessions();
    } catch (error) {
      console.error('清理过期会话失败', error);
    }
  }, 60 * 60 * 1000);
  sessionTimer.unref();

  await new Promise((resolvePromise, reject) => {
    server.once('error', reject);
    server.listen(port, host, resolvePromise);
  });
  const address = server.address();
  const actualPort = typeof address === 'object' && address ? address.port : port;

  return {
    server,
    db,
    auth,
    smsSender,
    port: actualPort,
    url: `http://${host === '0.0.0.0' ? '127.0.0.1' : host}:${actualPort}`,
    async close() {
      clearInterval(sessionTimer);
      await new Promise((resolvePromise, reject) => {
        server.close((error) => (error ? reject(error) : resolvePromise()));
      });
      db.close();
    },
  };
}

const isDirectRun =
  process.argv[1] &&
  pathToFileURL(resolve(process.argv[1])).href === import.meta.url;

if (isDirectRun) {
  const app = await startServer();
  console.log(`心青年志愿服务知识管理平台已启动：${app.url}`);
  console.log(`短信发送方式：${app.smsSender.name}`);
  console.log('按 Ctrl+C 停止服务。');

  const shutdown = async () => {
    console.log('\n正在关闭服务...');
    await app.close();
    process.exit(0);
  };
  process.once('SIGINT', shutdown);
  process.once('SIGTERM', shutdown);
}
