export const state = {
  user: null,
  metadata: null,
  adminStats: null,
};

export class ApiError extends Error {
  constructor(message, status, code, details) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

export async function api(path, options = {}) {
  const { method = 'GET', body, form, headers = {} } = options;
  const request = {
    method,
    credentials: 'same-origin',
    headers: { ...headers },
  };
  if (form) {
    request.body = form;
  } else if (body !== undefined) {
    request.headers['Content-Type'] = 'application/json';
    request.body = JSON.stringify(body);
  }
  let response;
  try {
    response = await fetch(path, request);
  } catch {
    throw new ApiError('网络连接失败，请检查服务是否正在运行', 0, 'network_error');
  }
  let payload = {};
  try {
    payload = await response.json();
  } catch {
    payload = {};
  }
  if (!response.ok) {
    if (response.status === 401) {
      state.user = null;
      document.dispatchEvent(new CustomEvent('session-expired'));
    }
    throw new ApiError(
      payload.error || `请求失败（${response.status}）`,
      response.status,
      payload.code || 'request_failed',
      payload.details,
    );
  }
  return payload;
}

export function escapeHtml(value) {
  return String(value ?? '')
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#039;');
}

export function nl2br(value) {
  return escapeHtml(value).replace(/\n/g, '<br>');
}

export function initials(name) {
  const normalized = String(name || '志愿者').trim();
  return escapeHtml(normalized.slice(-2));
}

export function formatDate(value, options = {}) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: options.short ? undefined : 'numeric',
    month: '2-digit',
    day: '2-digit',
    ...options,
  }).format(date);
}

export function formatDateTime(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function formatLongDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  }).format(date);
}

export function formatDateTimeLong(value) {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hour12: false,
  }).format(date);
}

export function relativeTime(value) {
  if (!value) return '';
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return '';
  const diff = Date.now() - time;
  const minute = 60 * 1000;
  const hour = 60 * minute;
  const day = 24 * hour;
  if (diff < minute) return '刚刚';
  if (diff < hour) return `${Math.floor(diff / minute)} 分钟前`;
  if (diff < day) return `${Math.floor(diff / hour)} 小时前`;
  if (diff < day * 7) return `${Math.floor(diff / day)} 天前`;
  return formatDate(value, { short: true });
}

export function toLocalInputValue(value) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export function dateParts(value) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return { day: '--', month: '--' };
  return {
    day: String(date.getDate()).padStart(2, '0'),
    month: `${date.getMonth() + 1}月`,
  };
}

const STATUS_LABELS = {
  active: '正常',
  disabled: '已禁用',
  draft: '草稿',
  pending: '待处理',
  processing: '处理中',
  published: '已发布',
  replied: '已回复',
  archived: '已归档',
  approved: '已通过',
  rejected: '未通过',
  revision: '退回修改',
  completed: '已结束',
  cancelled: '已取消',
  hidden: '已隐藏',
  private: '仅自己可见',
  public: '已公开',
};

export function statusLabel(status) {
  return STATUS_LABELS[status] || status || '未知';
}

export function statusBadge(status) {
  return `<span class="status status-${escapeHtml(status)}">${escapeHtml(statusLabel(status))}</span>`;
}

const VISIBILITY_META = {
  public: { label: '公开知识', icon: 'book-open', className: 'pill-public' },
  internal: { label: '内部资料', icon: 'lock-keyhole', className: 'pill-internal' },
  restricted: { label: '受限案例', icon: 'shield', className: 'pill-restricted' },
};

export function visibilityBadge(visibility) {
  const meta = VISIBILITY_META[visibility] || VISIBILITY_META.public;
  return `<span class="pill ${meta.className}">${icon(meta.icon, 'icon-sm')}${meta.label}</span>`;
}

export function emptyState(title, description = '', iconName = 'folder-open') {
  return `
    <div class="empty-state">
      ${icon(iconName, 'icon')}
      <strong>${escapeHtml(title)}</strong>
      ${description ? `<div class="small">${escapeHtml(description)}</div>` : ''}
    </div>
  `;
}

export function tagList(tags = []) {
  if (!tags?.length) return '';
  return `<div class="tag-list">${tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>`;
}

export function avatar(name, extraClass = '') {
  return `<span class="avatar ${extraClass}" aria-hidden="true">${initials(name)}</span>`;
}

export function parseTags(value) {
  return String(value || '')
    .split(/[,，]/)
    .map((item) => item.trim())
    .filter(Boolean);
}

const ICON_PATHS = {
  home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-7H9v7H5a2 2 0 0 1-2-2z"/>',
  'book-open': '<path d="M2 4h6a4 4 0 0 1 4 4v13a3 3 0 0 0-3-3H2zM22 4h-6a4 4 0 0 0-4 4v13a3 3 0 0 1 3-3h7z"/>',
  'message-circle-question':
    '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.9L3 21l1.9-4.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0Z"/><path d="M9.8 9a2.2 2.2 0 1 1 3.4 1.9c-.8.5-1.2 1-1.2 2"/><path d="M12 16h.01"/>',
  'calendar-days':
    '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M8 14h.01M12 14h.01M16 14h.01M8 18h.01M12 18h.01M16 18h.01"/>',
  users:
    '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.9M16 3.1a4 4 0 0 1 0 7.8"/>',
  'user-round':
    '<circle cx="12" cy="8" r="5"/><path d="M20 21a8 8 0 0 0-16 0"/>',
  search: '<circle cx="11" cy="11" r="8"/><path d="m21 21-4.3-4.3"/>',
  'log-out': '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4M16 17l5-5-5-5M21 12H9"/>',
  shield: '<path d="M20 13c0 5-3.5 7.5-8 9-4.5-1.5-8-4-8-9V5l8-3 8 3z"/><path d="m9 12 2 2 4-4"/>',
  'layout-dashboard':
    '<rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/>',
  'user-cog':
    '<circle cx="9" cy="7" r="4"/><path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="19" cy="11" r="2"/><path d="M19 7v2M19 13v2M15 11h2M21 11h2"/>',
  library:
    '<path d="m4 3 13 4-2 14-13-4zM19 6l2 .6M17 22h3V7"/>',
  'message-square-check':
    '<path d="M21 11.5a8.4 8.4 0 0 1-9 8.4 9 9 0 0 1-3.8-.9L3 21l1.9-4.7A8.4 8.4 0 0 1 4 11.5a8.5 8.5 0 0 1 17 0Z"/><path d="m9 11 2 2 4-4"/>',
  'clipboard-check':
    '<rect x="5" y="3" width="14" height="18" rx="2"/><path d="M9 3v2h6V3M9 13l2 2 4-4"/>',
  settings:
    '<path d="M12 15.5a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.2a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.2a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.2a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.2a1.7 1.7 0 0 0-1.4 1Z"/>',
  'lock-keyhole':
    '<rect x="4" y="10" width="16" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3M12 14v3"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  'arrow-right': '<path d="M5 12h14M13 6l6 6-6 6"/>',
  'arrow-left': '<path d="M19 12H5M11 18l-6-6 6-6"/>',
  'chevron-down': '<path d="m6 9 6 6 6-6"/>',
  'chevron-right': '<path d="m9 18 6-6-6-6"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  'map-pin': '<path d="M20 10c0 6-8 12-8 12S4 16 4 10a8 8 0 1 1 16 0Z"/><circle cx="12" cy="10" r="2.5"/>',
  heart: '<path d="M20.8 4.6a5.5 5.5 0 0 0-7.8 0L12 5.7l-1.1-1.1a5.5 5.5 0 0 0-7.8 7.8l1.1 1.1L12 21l7.8-7.5 1.1-1.1a5.5 5.5 0 0 0-.1-7.8Z"/>',
  eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/>',
  'file-text': '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8Z"/><path d="M14 2v6h6M8 13h8M8 17h6"/>',
  paperclip: '<path d="m21.4 11.6-8.5 8.5a6 6 0 0 1-8.5-8.5l8.5-8.5a4 4 0 0 1 5.7 5.7l-8.5 8.5a2 2 0 0 1-2.8-2.8l7.8-7.8"/>',
  check: '<path d="m20 6-11 11-5-5"/>',
  x: '<path d="m18 6-12 12M6 6l12 12"/>',
  'alert-circle': '<circle cx="12" cy="12" r="9"/><path d="M12 8v4M12 16h.01"/>',
  'rotate-ccw': '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5"/>',
  send: '<path d="m22 2-7 20-4-9-9-4Z"/><path d="M22 2 11 13"/>',
  sparkles: '<path d="m12 3-1.3 3.7L7 8l3.7 1.3L12 13l1.3-3.7L17 8l-3.7-1.3Z"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8ZM19 15l-.7 1.8-1.8.7 1.8.7L19 20l.7-1.8 1.8-.7-1.8-.7Z"/>',
  filter: '<path d="M4 5h16M7 12h10M10 19h4"/>',
  'badge-check':
    '<path d="m12 2 2.4 1.7 2.9-.2 1.1 2.7 2.4 1.7-.7 2.8.7 2.8-2.4 1.7-1.1 2.7-2.9-.2L12 22l-2.4-1.7-2.9.2-1.1-2.7-2.4-1.7.7-2.8-.7-2.8 2.4-1.7 1.1-2.7 2.9.2Z"/><path d="m9 12 2 2 4-4"/>',
  crown: '<path d="m3 6 4 4 5-7 5 7 4-4-2 12H5Z"/><path d="M5 18h14"/>',
  star: '<path d="m12 2 3 6.2 6.8 1-4.9 4.8 1.2 6.8-6.1-3.2L5.9 21l1.2-6.8L2.2 9.2l6.8-1Z"/>',
  pencil: '<path d="M12 20h9M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
  'trash-2': '<path d="M3 6h18M8 6V4h8v2M19 6l-1 15H6L5 6M10 11v6M14 11v6"/>',
  image: '<rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/>',
  download: '<path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4M7 10l5 5 5-5M12 15V3"/>',
  'bar-chart-3': '<path d="M3 3v18h18M7 16v-5M12 16V7M17 16v-8"/>',
  'calendar-check': '<rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18M9 16l2 2 4-4"/>',
  'circle-check-big': '<circle cx="12" cy="12" r="9"/><path d="m8 12 2.5 2.5L16 9"/>',
  'triangle-alert': '<path d="m10.3 3.7-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.7-3.3l-8-14a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
  menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
  'folder-open': '<path d="M3 7a2 2 0 0 1 2-2h5l2 2h7a2 2 0 0 1 2 2v1H4Z"/><path d="M4 10h18l-2 10H4Z"/>',
  clipboard: '<rect x="5" y="4" width="14" height="18" rx="2"/><path d="M9 4V2h6v2M9 10h6M9 14h6M9 18h4"/>',
};

export function icon(name, className = 'icon') {
  const paths = ICON_PATHS[name] || ICON_PATHS['alert-circle'];
  return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths}</svg>`;
}

export function toast(message, type = 'success') {
  const region = document.querySelector('#toast-region');
  if (!region) return;
  const item = document.createElement('div');
  item.className = `toast toast-${type}`;
  item.innerHTML = `${icon(type === 'error' ? 'alert-circle' : 'check', 'icon')}<span>${escapeHtml(message)}</span>`;
  region.append(item);
  setTimeout(() => item.remove(), 3800);
}

export function openModal(html, options = {}) {
  const modal = document.querySelector('#modal');
  const content = document.querySelector('#modal-content');
  content.innerHTML = html;
  modal.classList.toggle('modal-wide', Boolean(options.wide));
  if (!modal.open) modal.showModal();
}

export function closeModal() {
  const modal = document.querySelector('#modal');
  if (modal?.open) modal.close();
}

export function loadingView(label = '正在加载') {
  return `<div class="loading-view"><span class="spinner"></span><span>${escapeHtml(label)}</span></div>`;
}

export function buttonSpinner(button) {
  if (!button) return () => {};
  const original = button.innerHTML;
  button.disabled = true;
  button.innerHTML = `<span class="spinner"></span><span>处理中</span>`;
  return () => {
    button.disabled = false;
    button.innerHTML = original;
  };
}

export function formValues(form) {
  return Object.fromEntries(new FormData(form).entries());
}

export function getUserRoleLabel(user) {
  if (!user) return '';
  const adminRole = user.roles.find((role) => role.adminAccess);
  return adminRole?.name || user.roles[0]?.name || '普通志愿者';
}

export function hasPermission(permission) {
  return Boolean(state.user?.permissions?.includes(permission));
}

export function isSystemAdmin() {
  return Boolean(state.user?.roles?.some((role) => role.code === 'system_admin'));
}
