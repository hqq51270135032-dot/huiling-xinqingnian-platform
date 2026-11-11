import { createHmac, randomUUID } from 'node:crypto';
import { appendFileSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { HttpError } from './http.js';

function rfc3986(value) {
  return encodeURIComponent(value).replace(/[!'()*]/g, (character) =>
    `%${character.charCodeAt(0).toString(16).toUpperCase()}`,
  );
}

function createAliyunSender(config) {
  const accessKeyId = config.accessKeyId || '';
  const accessKeySecret = config.accessKeySecret || '';
  const signName = config.signName || '';
  const templateCode = config.templateCode || '';
  const regionId = config.regionId || 'cn-hangzhou';
  const templateParamName = config.templateParamName || 'code';
  const isConfigured = Boolean(
    accessKeyId && accessKeySecret && signName && templateCode,
  );

  return {
    name: 'aliyun',
    development: false,
    isConfigured,
    async send({ phone, code }) {
      if (!isConfigured) {
        throw new HttpError(
          503,
          '短信服务尚未配置，请联系部署管理员',
          'sms_not_configured',
        );
      }
      const params = {
        AccessKeyId: accessKeyId,
        Action: 'SendSms',
        Format: 'JSON',
        PhoneNumbers: phone,
        RegionId: regionId,
        SignName: signName,
        SignatureMethod: 'HMAC-SHA1',
        SignatureNonce: randomUUID(),
        SignatureVersion: '1.0',
        TemplateCode: templateCode,
        TemplateParam: JSON.stringify({ [templateParamName]: code }),
        Timestamp: new Date().toISOString().replace(/\.\d{3}Z$/, 'Z'),
        Version: '2017-05-25',
      };
      const canonicalQuery = Object.keys(params)
        .sort()
        .map((key) => `${rfc3986(key)}=${rfc3986(params[key])}`)
        .join('&');
      const stringToSign = `POST&%2F&${rfc3986(canonicalQuery)}`;
      const signature = createHmac('sha1', `${accessKeySecret}&`)
        .update(stringToSign)
        .digest('base64');
      const body = new URLSearchParams({ ...params, Signature: signature });

      let response;
      try {
        response = await fetch('https://dysmsapi.aliyuncs.com/', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded; charset=utf-8',
          },
          body,
          signal: AbortSignal.timeout(12_000),
        });
      } catch {
        throw new HttpError(502, '短信服务暂时不可用，请稍后重试', 'sms_unavailable');
      }
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.Code !== 'OK') {
        console.error('Aliyun SMS rejected request', {
          status: response.status,
          code: result.Code,
          message: result.Message,
          requestId: result.RequestId,
        });
        throw new HttpError(502, '短信发送失败，请稍后重试', 'sms_send_failed');
      }
      return result;
    },
  };
}

function createDevelopmentSender(outboxPath) {
  mkdirSync(dirname(outboxPath), { recursive: true });
  return {
    name: 'development-outbox',
    development: true,
    isConfigured: true,
    async send({ phone, code, purpose }) {
      const entry = {
        phone,
        code,
        purpose,
        createdAt: new Date().toISOString(),
      };
      appendFileSync(outboxPath, `${JSON.stringify(entry)}\n`, 'utf8');
      const masked = `${phone.slice(0, 3)}****${phone.slice(-4)}`;
      console.log(`[开发短信] ${masked} ${purpose} 验证码：${code}`);
      return entry;
    },
  };
}

function createDisabledSender() {
  return {
    name: 'disabled',
    development: false,
    isConfigured: false,
    async send() {
      throw new HttpError(
        503,
        '短信服务尚未配置，请联系部署管理员',
        'sms_not_configured',
      );
    },
  };
}

export function createSmsSender({
  provider,
  production = process.env.NODE_ENV === 'production',
  outboxPath = process.env.SMS_DEV_OUTBOX_PATH,
  aliyun = {},
} = {}) {
  if (provider && typeof provider.send === 'function') {
    return provider;
  }
  if (typeof provider === 'function') {
    return {
      name: 'custom',
      development: false,
      isConfigured: true,
      send: provider,
    };
  }

  const providerName =
    provider || process.env.SMS_PROVIDER || (production ? 'aliyun' : 'development');
  if (providerName === 'aliyun') {
    return createAliyunSender({
      accessKeyId: aliyun.accessKeyId || process.env.SMS_ALIYUN_ACCESS_KEY_ID,
      accessKeySecret:
        aliyun.accessKeySecret || process.env.SMS_ALIYUN_ACCESS_KEY_SECRET,
      signName: aliyun.signName || process.env.SMS_ALIYUN_SIGN_NAME,
      templateCode: aliyun.templateCode || process.env.SMS_ALIYUN_TEMPLATE_CODE,
      regionId: aliyun.regionId || process.env.SMS_ALIYUN_REGION_ID,
      templateParamName:
        aliyun.templateParamName || process.env.SMS_ALIYUN_TEMPLATE_PARAM_NAME,
    });
  }
  if (providerName === 'disabled') {
    return createDisabledSender();
  }
  if (providerName === 'development' || providerName === 'console') {
    if (production) {
      throw new Error(
        'Development SMS provider is not allowed when NODE_ENV=production.',
      );
    }
    const target =
      outboxPath ||
      join(
        dirname(dirname(fileURLToPath(import.meta.url))),
        'data',
        'sms-outbox.log',
      );
    return createDevelopmentSender(target);
  }
  throw new Error(`Unsupported SMS provider: ${providerName}`);
}
