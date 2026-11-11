export class HttpError extends Error {
  constructor(status, message, code = 'request_error', details = null) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export function sendJson(res, status, data, headers = {}) {
  const body = JSON.stringify(data);
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(body);
}

export function sendError(res, error) {
  if (error instanceof HttpError) {
    sendJson(res, error.status, {
      error: error.message,
      code: error.code,
      details: error.details,
    });
    return;
  }

  console.error(error);
  sendJson(res, 500, {
    error: '服务器处理请求时出现异常',
    code: 'internal_error',
  });
}

export function parseCookies(header = '') {
  const cookies = {};
  for (const part of header.split(';')) {
    const separator = part.indexOf('=');
    if (separator < 0) continue;
    const key = part.slice(0, separator).trim();
    const value = part.slice(separator + 1).trim();
    if (key) cookies[key] = decodeURIComponent(value);
  }
  return cookies;
}

export function getClientIp(req) {
  const forwarded = req.headers['x-forwarded-for'];
  if (typeof forwarded === 'string' && forwarded.trim()) {
    return forwarded.split(',')[0].trim();
  }
  return req.socket?.remoteAddress || '';
}

export async function readBody(req, maxBytes = 1_000_000) {
  const declaredLength = Number(req.headers['content-length'] || 0);
  if (declaredLength > maxBytes) {
    throw new HttpError(413, '请求内容超过允许大小', 'payload_too_large');
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > maxBytes) {
      throw new HttpError(413, '请求内容超过允许大小', 'payload_too_large');
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

export async function readJson(req, maxBytes = 1_000_000) {
  const body = await readBody(req, maxBytes);
  if (!body.length) return {};
  try {
    return JSON.parse(body.toString('utf8'));
  } catch {
    throw new HttpError(400, '请求内容不是有效的 JSON', 'invalid_json');
  }
}

export async function readFormData(req, maxBytes = 25_000_000) {
  const body = await readBody(req, maxBytes);
  const contentType = req.headers['content-type'] || '';
  if (!contentType.toLowerCase().startsWith('multipart/form-data')) {
    throw new HttpError(400, '请使用 multipart/form-data 上传文件', 'invalid_content_type');
  }

  const request = new Request('http://localhost/upload', {
    method: 'POST',
    headers: { 'content-type': contentType },
    body,
  });
  try {
    return await request.formData();
  } catch {
    throw new HttpError(400, '上传内容格式不正确', 'invalid_form_data');
  }
}

export function requireString(value, field, options = {}) {
  const { min = 1, max = 5000, trim = true } = options;
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field}不能为空`, 'validation_error', { field });
  }
  const normalized = trim ? value.trim() : value;
  if (normalized.length < min || normalized.length > max) {
    throw new HttpError(
      400,
      `${field}长度需在 ${min}-${max} 个字符之间`,
      'validation_error',
      { field },
    );
  }
  return normalized;
}

export function optionalString(value, field, options = {}) {
  const { max = 5000 } = options;
  if (value === undefined || value === null) return '';
  if (typeof value !== 'string') {
    throw new HttpError(400, `${field}格式不正确`, 'validation_error', { field });
  }
  const normalized = value.trim();
  if (normalized.length > max) {
    throw new HttpError(
      400,
      `${field}不能超过 ${max} 个字符`,
      'validation_error',
      { field },
    );
  }
  return normalized;
}

export function requireOneOf(value, field, allowed) {
  if (!allowed.includes(value)) {
    throw new HttpError(
      400,
      `${field}必须是以下值之一：${allowed.join('、')}`,
      'validation_error',
      { field },
    );
  }
  return value;
}

export function parsePositiveInt(value, field) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed <= 0) {
    throw new HttpError(400, `${field}必须是正整数`, 'validation_error', { field });
  }
  return parsed;
}

export function parseDate(value, field) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    throw new HttpError(400, `${field}不是有效日期`, 'validation_error', { field });
  }
  return date.toISOString();
}

export function normalizeTags(tags) {
  if (Array.isArray(tags)) {
    return tags
      .filter((tag) => typeof tag === 'string')
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20)
      .join(',');
  }
  if (typeof tags === 'string') {
    return tags
      .split(/[,，]/)
      .map((tag) => tag.trim())
      .filter(Boolean)
      .slice(0, 20)
      .join(',');
  }
  return '';
}

export function toTagsArray(value) {
  return String(value || '')
    .split(',')
    .map((tag) => tag.trim())
    .filter(Boolean);
}

export function setCookie(name, value, options = {}) {
  const pieces = [`${name}=${encodeURIComponent(value)}`, 'Path=/', 'HttpOnly', 'SameSite=Lax'];
  if (options.maxAge !== undefined) pieces.push(`Max-Age=${options.maxAge}`);
  if (options.secure) pieces.push('Secure');
  return pieces.join('; ');
}

export function clearCookie(name, secure = false) {
  return setCookie(name, '', { maxAge: 0, secure });
}

export function assertSameOrigin(req) {
  const origin = req.headers.origin;
  if (!origin) return;
  const host = req.headers.host;
  try {
    if (new URL(origin).host !== host) {
      throw new HttpError(403, '请求来源校验失败', 'origin_rejected');
    }
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(403, '请求来源校验失败', 'origin_rejected');
  }
}
