import {
  api,
  avatar,
  buttonSpinner,
  closeModal,
  escapeHtml,
  formValues,
  getUserRoleLabel,
  hasPermission,
  icon,
  isSystemAdmin,
  openModal,
  toast,
} from './js/core.js';
import {
  renderActivities,
  renderActivityDetail,
  renderCommunity,
  renderFeedbackDetail,
  renderFeedbackForm,
  renderHome,
  renderKnowledgeDetail,
  renderKnowledgeList,
  renderMyFeedbackList,
  renderProfile,
  renderQuestions,
} from './js/views/volunteer.js';
import {
  renderAdminActivities,
  renderAdminCommunity,
  renderAdminFeedback,
  renderAdminKnowledge,
  renderAdminOverview,
  renderAdminQuestions,
  renderAdminRoles,
  renderAdminSettings,
  renderAdminUsers,
} from './js/views/admin.js';
import { renderAuth } from './js/views/auth.js';
import {
  activityFormModal,
  communityFormModal,
  communityReviewModal,
  convertModal,
  feedbackReviewModal,
  knowledgeAclModal,
  knowledgeFormModal,
  knowledgeReviewModal,
  profileFormModal,
  questionDetailModal,
  questionFormModal,
  questionReplyModal,
  roleFormModal,
  searchResultsModal,
  userPermissionsModal,
  userRolesModal,
} from './js/views/modals.js';

const app = document.querySelector('#app');
let renderSequence = 0;

const volunteerNav = [
  { path: '/home', label: '首页', icon: 'home' },
  { path: '/knowledge', label: '知识库', icon: 'book-open' },
  { path: '/questions', label: '问题答疑', icon: 'message-circle-question' },
  { path: '/activities', label: '活动', icon: 'calendar-days' },
  { path: '/community', label: '社群', icon: 'users' },
  { path: '/profile', label: '个人中心', icon: 'user-round' },
];

const adminNav = [
  { path: '/admin/overview', label: '数据概览', icon: 'layout-dashboard', permission: 'stats.view' },
  { path: '/admin/users', label: '用户管理', icon: 'user-cog', permission: 'user.manage' },
  { path: '/admin/knowledge', label: '知识库管理', icon: 'library', permission: 'knowledge.review' },
  { path: '/admin/questions', label: '问题管理', icon: 'message-circle-question', permission: 'question.manage' },
  { path: '/admin/activities', label: '活动管理', icon: 'calendar-check', permission: 'activity.manage' },
  { path: '/admin/feedback', label: '反馈管理', icon: 'clipboard-check', permission: 'feedback.review' },
  { path: '/admin/community', label: '社群审核', icon: 'message-square-check', permission: 'community.moderate' },
  { path: '/admin/roles', label: '角色权限', icon: 'shield', permission: 'role.manage' },
  { path: '/admin/settings', label: '系统设置', icon: 'settings', permission: 'settings.manage' },
];

function parseRoute() {
  const raw = window.location.hash.slice(1) || '/home';
  const [path, queryString = ''] = raw.split('?');
  return {
    path: path.startsWith('/') ? path : `/${path}`,
    params: new URLSearchParams(queryString),
  };
}

async function bootstrap() {
  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-mark"><span class="spinner"></span><span>正在连接平台</span></div>
    </div>
  `;
  try {
    const session = await api('/api/session');
    if (session.authenticated) {
      const { state } = await import('./js/core.js');
      state.user = session.user;
      try {
        const metadata = await api('/api/metadata');
        state.metadata = metadata;
      } catch {
        state.metadata = null;
      }
    }
  } catch (error) {
    toast(error.message, 'error');
  }
  await renderCurrent();
}

async function refreshSession() {
  const { state } = await import('./js/core.js');
  try {
    const session = await api('/api/session');
    state.user = session.user;
  } catch {
    state.user = null;
  }
  return state.user;
}

function isAdminPath(path) {
  return path.startsWith('/admin/');
}

function navLink(item, activePath, admin = false) {
  const active =
    activePath === item.path ||
    (item.path !== '/home' && activePath.startsWith(`${item.path}/`));
  return `
    <a class="nav-link ${active ? 'active' : ''}" href="#${item.path}">
      ${icon(item.icon)}
      <span>${item.label}</span>
    </a>
  `;
}

function renderShell(content, activePath, admin = false) {
  const { state } = window.__xqnState;
  const availableAdminNav = admin
    ? adminNav.filter((item) => hasPermission(item.permission))
    : [];
  const navItems = admin ? availableAdminNav : volunteerNav;
  const roleLabel = admin ? getUserRoleLabel(state.user) : getUserRoleLabel(state.user);
  const brandHref = admin ? '#/admin/overview' : '#/home';
  const mobileItems = admin
    ? [...availableAdminNav.slice(0, 3), { path: '#admin-more', label: '更多', icon: 'menu' }]
    : volunteerNav;
  return `
    <div class="app-shell">
      <aside class="sidebar">
        <div class="sidebar-head">
          <a class="brand" href="${brandHref}">
            <img class="brand-mark" src="/assets/mark.svg" alt="" />
            <span class="brand-copy">
              <span class="brand-title">心青年志愿服务</span>
              <span class="brand-caption">${admin ? '管理工作台' : '知识管理平台'}</span>
            </span>
          </a>
        </div>
        <nav class="sidebar-nav" aria-label="${admin ? '后台' : '志愿者端'}导航">
          ${admin ? '<span class="nav-label">管理功能</span>' : ''}
          ${navItems.map((item) => navLink(item, activePath, admin)).join('')}
          <span class="nav-label">账号</span>
          ${
            state.user.isAdmin
              ? `<a class="nav-link" href="#${admin ? '/home' : '/admin/overview'}">${icon(admin ? 'users' : 'shield')}<span>${admin ? '返回志愿者端' : '进入管理后台'}</span></a>`
              : ''
          }
          ${
            !admin
              ? `<a class="nav-link" href="#/profile">${icon('settings')}<span>个人设置</span></a>`
              : ''
          }
        </nav>
        <div class="sidebar-user">
          ${avatar(state.user.displayName, 'avatar-sm')}
          <div>
            <div class="sidebar-user-name">${escapeHtml(state.user.displayName)}</div>
            <div class="sidebar-user-role">${escapeHtml(roleLabel)}</div>
          </div>
          <button class="icon-button" type="button" data-action="logout" title="退出登录" aria-label="退出登录">${icon('log-out', 'icon-sm')}</button>
        </div>
      </aside>
      <div class="main-shell">
        <header class="topbar">
          <form class="topbar-search" data-form="global-search" role="search">
            ${icon('search')}
            <input id="global-search-input" name="q" autocomplete="off" placeholder="搜索知识、活动、答疑与社群" aria-label="全局搜索" />
            <kbd>/</kbd>
          </form>
          <div class="topbar-actions">
            ${admin ? '<span class="admin-mode-label">' + icon('shield', 'icon-sm') + ' 管理后台</span>' : ''}
            ${
              state.user.isAdmin
                ? `<a class="btn btn-secondary desktop-only" href="#${admin ? '/home' : '/admin/overview'}">${icon(admin ? 'users' : 'shield', 'icon-sm')} ${admin ? '志愿者端' : '管理后台'}</a>`
                : ''
            }
            <a class="icon-button" href="#${admin ? '/admin/settings' : '/profile'}" title="个人中心" aria-label="个人中心">${icon('user-round', 'icon-sm')}</a>
          </div>
        </header>
        <main class="main-content">${content}</main>
      </div>
    </div>
    <nav class="mobile-nav ${admin ? 'admin-mobile' : ''}" aria-label="移动端导航">
      ${mobileItems.map((item) => {
        const active =
          activePath === item.path ||
          (item.path !== '/home' && activePath.startsWith(`${item.path}/`));
        if (item.path === '#admin-more') {
          return `<button class="mobile-more" type="button" data-action="admin-more">${icon(item.icon)}<span>${item.label}</span></button>`;
        }
        return `<a class="${active ? 'active' : ''}" href="#${item.path}">${icon(item.icon)}<span>${item.label}</span></a>`;
      }).join('')}
    </nav>
  `;
}

async function renderCurrent() {
  const sequence = ++renderSequence;
  const { state } = window.__xqnState;
  const { path, params } = parseRoute();
  const authRoute = [
    '/login',
    '/login/volunteer',
    '/login/admin',
    '/register',
    '/setup',
  ].includes(path);

  if (!state.user) {
    if (path === '/setup') {
      let setupStatus = null;
      try {
        setupStatus = await api('/api/setup/status');
      } catch {
        setupStatus = null;
      }
      app.innerHTML = renderAuth({ setup: true, setupStatus });
    } else if (path === '/login/admin') {
      app.innerHTML = renderAuth({ portal: 'admin', mode: 'login' });
    } else if (path === '/register') {
      app.innerHTML = renderAuth({ portal: 'volunteer', mode: 'register' });
    } else {
      app.innerHTML = renderAuth({ portal: 'volunteer', mode: 'login' });
    }
    document.title =
      path === '/setup'
        ? '初始化管理员 · 心青年志愿服务知识管理平台'
        : '登录 · 心青年志愿服务知识管理平台';
    return;
  }

  if (authRoute) {
    window.location.hash = state.user.isAdmin ? '#/admin/overview' : '#/home';
    return;
  }

  const admin = isAdminPath(path);
  if (admin && !state.user.isAdmin) {
    window.location.hash = '#/home';
    return;
  }
  if (admin) {
    const allowed = adminNav.filter((item) => hasPermission(item.permission));
    const matched = adminNav.find((item) => path === item.path);
    if (matched && !hasPermission(matched.permission)) {
      const fallback = allowed[0]?.path || '/home';
      window.location.hash = `#${fallback}`;
      return;
    }
  }

  app.innerHTML = `
    <div class="loading-screen">
      <div class="loading-mark"><span class="spinner"></span><span>正在加载页面</span></div>
    </div>
  `;

  try {
    let content = '';
    let activePath = path;
    if (admin) {
      content = await renderAdminRoute(path, params);
    } else {
      const result = await renderVolunteerRoute(path, params);
      content = result.content;
      activePath = result.activePath;
    }
    if (sequence !== renderSequence) return;
    app.innerHTML = renderShell(content, activePath, admin);
    document.title = `${admin ? '管理后台' : '志愿者端'} · 心青年志愿服务知识管理平台`;
    window.scrollTo({ top: 0, behavior: 'instant' });
  } catch (error) {
    if (sequence !== renderSequence) return;
    app.innerHTML = renderShell(errorContent(error), path, admin);
    toast(error.message, 'error');
  }
}

async function renderVolunteerRoute(path, params) {
  const { state } = window.__xqnState;
  if (path === '/home' || path === '/') {
    return { content: await renderHome(state.user), activePath: '/home' };
  }
  if (path === '/knowledge') {
    return { content: await renderKnowledgeList(params), activePath: '/knowledge' };
  }
  const knowledgeMatch = path.match(/^\/knowledge\/(\d+)$/);
  if (knowledgeMatch) {
    return {
      content: await renderKnowledgeDetail(knowledgeMatch[1]),
      activePath: '/knowledge',
    };
  }
  if (path === '/questions') {
    return { content: await renderQuestions(params), activePath: '/questions' };
  }
  if (path === '/activities') {
    return { content: await renderActivities(params), activePath: '/activities' };
  }
  const activityMatch = path.match(/^\/activities\/(\d+)$/);
  if (activityMatch) {
    return {
      content: await renderActivityDetail(activityMatch[1]),
      activePath: '/activities',
    };
  }
  if (path === '/community') {
    return { content: await renderCommunity(), activePath: '/community' };
  }
  if (path === '/profile') {
    return { content: await renderProfile(state.user), activePath: '/profile' };
  }
  if (path === '/feedback') {
    return { content: await renderMyFeedbackList(), activePath: '/profile' };
  }
  const feedbackNewMatch = path.match(/^\/feedback\/new\/(\d+)$/);
  if (feedbackNewMatch) {
    return {
      content: await renderFeedbackForm(feedbackNewMatch[1]),
      activePath: '/activities',
    };
  }
  const feedbackEditMatch = path.match(/^\/feedback\/edit\/(\d+)$/);
  if (feedbackEditMatch) {
    const { item } = await api(`/api/feedback/${feedbackEditMatch[1]}`);
    return {
      content: await renderFeedbackForm(item.activityId, item),
      activePath: '/profile',
    };
  }
  const feedbackDetailMatch = path.match(/^\/feedback\/(\d+)$/);
  if (feedbackDetailMatch) {
    return {
      content: await renderFeedbackDetail(feedbackDetailMatch[1]),
      activePath: '/profile',
    };
  }
  window.location.hash = '#/home';
  return { content: '', activePath: '/home' };
}

async function renderAdminRoute(path, params) {
  if (path === '/admin/overview') return renderAdminOverview();
  if (path === '/admin/users') return renderAdminUsers(params);
  if (path === '/admin/knowledge') return renderAdminKnowledge(params);
  if (path === '/admin/questions') return renderAdminQuestions(params);
  if (path === '/admin/activities') return renderAdminActivities(params);
  if (path === '/admin/feedback') return renderAdminFeedback(params);
  if (path === '/admin/community') return renderAdminCommunity();
  if (path === '/admin/roles') return renderAdminRoles();
  if (path === '/admin/settings') return renderAdminSettings();
  const first = adminNav.find((item) => hasPermission(item.permission));
  window.location.hash = `#${first?.path || '/home'}`;
  return '';
}

function errorContent(error) {
  return `
    <div class="empty-state" style="min-height:420px">
      ${icon(error.status === 403 ? 'lock-keyhole' : 'triangle-alert', 'icon')}
      <strong>${error.status === 403 ? '没有访问权限' : '页面加载失败'}</strong>
      <div class="small">${escapeHtml(error.message)}</div>
      <button class="btn btn-secondary" style="margin-top:16px" type="button" data-action="reload">重新加载</button>
    </div>
  `;
}

function currentPath() {
  return parseRoute().path;
}

function clearFormError(form) {
  const element = form?.querySelector('[data-form-error]');
  if (!element) return;
  element.classList.add('hidden');
  element.innerHTML = '';
}

function showFormError(form, message, link = null) {
  const element = form?.querySelector('[data-form-error]');
  if (!element) {
    toast(message, 'error');
    return;
  }
  element.classList.remove('hidden');
  element.innerHTML = `${escapeHtml(message)}${
    link
      ? ` <a href="${escapeHtml(link.href)}">${escapeHtml(link.label)}</a>`
      : ''
  }`;
}

function startSmsCountdown(button, seconds) {
  if (!button) return;
  if (button.dataset.timer) clearInterval(Number(button.dataset.timer));
  let remaining = Math.max(1, Number(seconds) || 60);
  button.disabled = true;
  button.textContent = `${remaining} 秒后重发`;
  const timer = setInterval(() => {
    remaining -= 1;
    if (remaining <= 0) {
      clearInterval(timer);
      button.disabled = false;
      button.textContent = '重新获取';
      delete button.dataset.timer;
      return;
    }
    button.textContent = `${remaining} 秒后重发`;
  }, 1000);
  button.dataset.timer = String(timer);
}

async function uploadSelectedFiles(form, targetType, targetId) {
  const input = form.querySelector('input[type="file"]');
  if (!input?.files?.length) return 0;
  let uploaded = 0;
  for (const file of input.files) {
    const data = new FormData();
    data.append('file', file);
    data.append('targetType', targetType);
    data.append('targetId', String(targetId));
    await api('/api/files', { method: 'POST', form: data });
    uploaded += 1;
  }
  return uploaded;
}

async function handleAction(event) {
  const trigger = event.target.closest('[data-action]');
  if (!trigger) return;
  const { action, id, status, joined, target, purpose, portal, title } = trigger.dataset;
  const { state } = window.__xqnState;
  try {
    if (action === 'close-modal') {
      if (trigger.tagName === 'A') return;
      closeModal();
      return;
    }
    if (action === 'reload') {
      await renderCurrent();
      return;
    }
    if (action === 'logout') {
      await api('/api/auth/logout', { method: 'POST' });
      state.user = null;
      closeModal();
      window.location.hash = '#/login/volunteer';
      await renderCurrent();
      return;
    }
    if (action === 'send-sms-code') {
      const form = trigger.closest('form');
      const phoneInput = form?.querySelector('[name="phone"]');
      const setupToken = form?.querySelector('[name="setupToken"]')?.value || '';
      const phone = phoneInput?.value.trim() || '';
      if (purpose !== 'setup' && !/^1[3-9]\d{9}$/.test(phone)) {
        showFormError(form, '请输入有效的 11 位中国大陆手机号');
        phoneInput?.focus();
        return;
      }
      if (purpose === 'setup' && !setupToken) {
        showFormError(form, '请先输入部署配置的一次性初始化令牌');
        form?.querySelector('[name="setupToken"]')?.focus();
        return;
      }
      clearFormError(form);
      const restore = buttonSpinner(trigger);
      try {
        const result = await api('/api/auth/sms/send', {
          method: 'POST',
          body: {
            phone: purpose === 'setup' ? undefined : phone,
            purpose,
            portal,
            setupToken: purpose === 'setup' ? setupToken : undefined,
          },
        });
        const hint = form?.querySelector('[data-sms-hint]');
        if (hint) {
          hint.textContent = result.development
            ? `开发测试验证码已写入服务端 ${'sms-outbox.log'}，不会显示在浏览器中`
            : `验证码已发送，${Math.round(result.expiresIn / 60)} 分钟内有效`;
        }
        toast(result.development ? '开发测试验证码已生成，请查看服务端测试收件文件' : '验证码已发送');
        restore();
        startSmsCountdown(trigger, result.cooldown || 60);
      } catch (error) {
        restore();
        if (error.code === 'phone_registered') {
          showFormError(form, error.message, {
            href: '#/login/volunteer',
            label: '前往登录',
          });
        } else if (error.code === 'phone_not_registered') {
          showFormError(form, error.message, {
            href: '#/register',
            label: '立即注册',
          });
        } else {
          showFormError(form, error.message);
        }
      }
      return;
    }
    if (action === 'toggle-accordion') {
      const panel = document.getElementById(target);
      panel?.classList.toggle('hidden');
      trigger.setAttribute('aria-expanded', String(!panel?.classList.contains('hidden')));
      return;
    }
    if (action === 'admin-more') {
      const links = adminNav
        .filter((item) => hasPermission(item.permission))
        .map((item) => `<a class="search-result" href="#${item.path}" data-action="close-modal"><span><strong>${item.label}</strong></span>${icon('chevron-right', 'icon-sm')}</a>`)
        .join('');
      openModal(`
        <div class="modal-header"><h2>管理功能</h2><p>选择需要进入的工作区</p></div>
        ${links}
        <div class="form-actions"><a class="btn btn-secondary" href="#/home" data-action="close-modal">${icon('users')} 返回志愿者端</a><button class="btn btn-primary" type="button" data-action="logout">${icon('log-out')} 退出登录</button></div>
      `);
      return;
    }
    if (action === 'toggle-favorite') {
      const wasActive = trigger.classList.contains('is-active');
      await api(`/api/knowledge/${id}/favorite`, { method: wasActive ? 'DELETE' : 'POST' });
      toast(wasActive ? '已取消收藏' : '已加入收藏');
      await renderCurrent();
      return;
    }
    if (action === 'ask-question') {
      openModal(questionFormModal());
      return;
    }
    if (action === 'view-question') {
      const { item } = await api(`/api/questions/${id}`);
      openModal(questionDetailModal(item));
      return;
    }
    if (action === 'toggle-join') {
      const isJoined = joined === 'true';
      await api(`/api/activities/${id}/join`, { method: isJoined ? 'DELETE' : 'POST' });
      toast(isJoined ? '已取消报名' : '报名成功');
      await renderCurrent();
      return;
    }
    if (action === 'new-community-post') {
      const { items } = await api('/api/activities');
      openModal(communityFormModal(items));
      return;
    }
    if (action === 'focus-comment') {
      document.querySelector(`#comment-input-${id}`)?.focus();
      return;
    }
    if (action === 'edit-profile') {
      openModal(profileFormModal(state.user));
      return;
    }
    if (action === 'profile-tab') {
      document.querySelectorAll('.profile-panel').forEach((panel) => panel.classList.add('hidden'));
      document.querySelectorAll('[data-action="profile-tab"]').forEach((tab) => tab.classList.remove('active'));
      document.getElementById(target)?.classList.remove('hidden');
      trigger.classList.add('active');
      return;
    }
    if (action === 'new-knowledge') {
      openModal(knowledgeFormModal());
      return;
    }
    if (action === 'edit-knowledge') {
      const { item } = await api(`/api/knowledge/${id}`);
      openModal(knowledgeFormModal(item));
      return;
    }
    if (action === 'review-knowledge') {
      const { item } = await api(`/api/knowledge/${id}`);
      openModal(knowledgeReviewModal(item));
      return;
    }
    if (action === 'delete-knowledge') {
      if (!window.confirm(`确定删除“${title}”吗？该操作不可撤销。`)) return;
      await api(`/api/knowledge/${id}`, { method: 'DELETE' });
      toast('知识内容已删除');
      await renderCurrent();
      return;
    }
    if (action === 'edit-knowledge-acl') {
      const [{ item }, users] = await Promise.all([
        api(`/api/knowledge/${id}`),
        api('/api/admin/users'),
      ]);
      openModal(knowledgeAclModal(item, users.items), { wide: true });
      return;
    }
    if (action === 'reply-question') {
      const { item } = await api(`/api/questions/${id}`);
      openModal(questionReplyModal(item));
      return;
    }
    if (action === 'convert-question') {
      const { item } = await api(`/api/questions/${id}`);
      openModal(convertModal('question', item));
      return;
    }
    if (action === 'new-activity') {
      openModal(activityFormModal());
      return;
    }
    if (action === 'edit-activity') {
      const { item } = await api(`/api/activities/${id}`);
      openModal(activityFormModal(item));
      return;
    }
    if (action === 'review-feedback') {
      const { item } = await api(`/api/feedback/${id}`);
      openModal(feedbackReviewModal(item), { wide: true });
      return;
    }
    if (action === 'convert-feedback') {
      const { item } = await api(`/api/feedback/${id}`);
      openModal(convertModal('feedback', item));
      return;
    }
    if (action === 'review-community') {
      const { item } = await api(`/api/community/${id}`);
      openModal(communityReviewModal(item));
      return;
    }
    if (action === 'edit-user-roles') {
      const [users, roles] = await Promise.all([
        api('/api/admin/users'),
        api('/api/admin/roles'),
      ]);
      const user = users.items.find((item) => item.id === Number(id));
      openModal(userRolesModal(user, roles.items), { wide: true });
      return;
    }
    if (action === 'edit-user-permissions') {
      const [users, permissions] = await Promise.all([
        api('/api/admin/users'),
        api('/api/admin/permissions'),
      ]);
      const user = users.items.find((item) => item.id === Number(id));
      openModal(userPermissionsModal(user, permissions.items), { wide: true });
      return;
    }
    if (action === 'toggle-user-status') {
      const nextStatus = status === 'active' ? 'disabled' : 'active';
      if (nextStatus === 'disabled' && !window.confirm('禁用后该账号会立即退出所有会话，确定继续吗？')) return;
      await api(`/api/admin/users/${id}/status`, {
        method: 'PATCH',
        body: { status: nextStatus },
      });
      toast(nextStatus === 'active' ? '账号已启用' : '账号已禁用');
      await renderCurrent();
      return;
    }
    if (action === 'new-role') {
      const { items } = await api('/api/admin/permissions');
      openModal(roleFormModal(null, items), { wide: true });
      return;
    }
    if (action === 'edit-role') {
      const [roles, permissions] = await Promise.all([
        api('/api/admin/roles'),
        api('/api/admin/permissions'),
      ]);
      const role = roles.items.find((item) => item.id === Number(id));
      openModal(roleFormModal(role, permissions.items), { wide: true });
      return;
    }
    if (action === 'delete-role') {
      if (!window.confirm(`确定删除角色“${trigger.dataset.name}”吗？`)) return;
      await api(`/api/admin/roles/${id}`, { method: 'DELETE' });
      toast('角色已删除');
      await renderCurrent();
    }
  } catch (error) {
    toast(error.message, 'error');
  }
}

async function handleSubmit(event) {
  const form = event.target.closest('form[data-form]');
  if (!form) return;
  event.preventDefault();
  const type = form.dataset.form;
  const submitter = event.submitter;
  const restore = buttonSpinner(submitter);
  const { state } = window.__xqnState;
  try {
    clearFormError(form);
    if (type === 'login') {
      const values = formValues(form);
      const result = await api('/api/auth/login', {
        method: 'POST',
        body: {
          phone: values.phone,
          code: values.code,
          portal: form.dataset.portal,
        },
      });
      state.user = result.user;
      const metadata = await api('/api/metadata');
      state.metadata = metadata;
      toast('登录成功');
      window.location.hash = result.user.isAdmin ? '#/admin/overview' : '#/home';
      await renderCurrent();
      return;
    }
    if (type === 'register') {
      const values = formValues(form);
      const result = await api('/api/auth/register', {
        method: 'POST',
        body: {
          phone: values.phone,
          code: values.code,
          nickname: values.nickname,
        },
      });
      state.user = result.user;
      state.metadata = await api('/api/metadata');
      toast('注册成功，已获得普通志愿者身份');
      window.location.hash = '#/home';
      await renderCurrent();
      return;
    }
    if (type === 'setup-admin') {
      const values = formValues(form);
      const result = await api('/api/setup/admin', {
        method: 'POST',
        body: {
          setupToken: values.setupToken,
          code: values.code,
        },
      });
      state.user = result.user;
      state.metadata = await api('/api/metadata');
      toast('平台初始化完成，管理员账号已激活');
      window.location.hash = '#/admin/overview';
      await renderCurrent();
      return;
    }
    if (type === 'knowledge-filter') {
      const values = formValues(form);
      const params = new URLSearchParams();
      if (values.search?.trim()) params.set('search', values.search.trim());
      window.location.hash = `#/knowledge${params.size ? `?${params}` : ''}`;
      return;
    }
    if (type === 'admin-user-filter') {
      const values = formValues(form);
      const params = new URLSearchParams();
      if (values.search?.trim()) params.set('search', values.search.trim());
      if (parseRoute().params.get('status')) params.set('status', parseRoute().params.get('status'));
      window.location.hash = `#/admin/users${params.size ? `?${params}` : ''}`;
      return;
    }
    if (type === 'admin-knowledge-filter') {
      const values = formValues(form);
      const params = new URLSearchParams();
      if (values.search?.trim()) params.set('search', values.search.trim());
      const current = parseRoute().params;
      if (current.get('status')) params.set('status', current.get('status'));
      if (current.get('visibility')) params.set('visibility', current.get('visibility'));
      window.location.hash = `#/admin/knowledge${params.size ? `?${params}` : ''}`;
      return;
    }
    if (type === 'global-search') {
      const values = formValues(form);
      if (values.q.trim().length < 2) {
        toast('请输入至少两个字符', 'error');
        return;
      }
      const data = await api(`/api/search?q=${encodeURIComponent(values.q.trim())}`);
      openModal(searchResultsModal(data), { wide: true });
      return;
    }
    if (type === 'create-question') {
      const values = formValues(form);
      const result = await api('/api/questions', {
        method: 'POST',
        body: { title: values.title, content: values.content, category: values.category },
      });
      await uploadSelectedFiles(form, 'question', result.item.id);
      closeModal();
      toast('问题已提交，管理员回复后会通知你查看');
      await renderCurrent();
      return;
    }
    if (type === 'create-community-post') {
      const values = formValues(form);
      const result = await api('/api/community', {
        method: 'POST',
        body: {
          title: values.title,
          content: values.content,
          category: values.category,
          activityId: values.activityId || null,
        },
      });
      await uploadSelectedFiles(form, 'community', result.item.id);
      closeModal();
      toast('内容已提交审核');
      window.location.hash = '#/profile';
      await renderCurrent();
      return;
    }
    if (type === 'community-comment') {
      const values = formValues(form);
      await api(`/api/community/${form.dataset.postId}/comments`, {
        method: 'POST',
        body: { content: values.content },
      });
      toast('回应已发布');
      await renderCurrent();
      return;
    }
    if (type === 'update-profile') {
      const values = formValues(form);
      const result = await api('/api/auth/profile', { method: 'PATCH', body: values });
      state.user = result.user;
      closeModal();
      toast('个人信息已更新');
      await renderCurrent();
      return;
    }
    if (type === 'submit-feedback') {
      const values = formValues(form);
      const body = {
        activityId: Number(form.dataset.activityId),
        participationDate: new Date(values.participationDate).toISOString(),
        problems: values.problems,
        observations: values.observations,
        communicationDifficulties: values.communicationDifficulties,
        learnings: values.learnings,
        newUnderstanding: values.newUnderstanding,
        suggestions: values.suggestions,
        additional: values.additional,
      };
      const feedbackId = form.dataset.feedbackId;
      const result = feedbackId
        ? await api(`/api/feedback/${feedbackId}`, { method: 'PATCH', body })
        : await api('/api/feedback', { method: 'POST', body });
      await uploadSelectedFiles(form, 'feedback', result.item.id);
      toast(feedbackId ? '反馈已重新提交审核' : '反馈已提交');
      window.location.hash = `#/feedback/${result.item.id}`;
      await renderCurrent();
      return;
    }
    if (type === 'save-knowledge') {
      const values = formValues(form);
      const payload = {
        title: values.title,
        summary: values.summary,
        content: values.content,
        category: values.category,
        tags: values.tags,
        visibility: values.visibility,
        status: values.status,
      };
      const id = form.dataset.id;
      const result = id
        ? await api(`/api/knowledge/${id}`, { method: 'PATCH', body: payload })
        : await api('/api/knowledge', { method: 'POST', body: payload });
      await uploadSelectedFiles(form, 'knowledge', result.item.id);
      closeModal();
      toast(id ? '知识内容已更新' : '知识内容已创建');
      await renderCurrent();
      return;
    }
    if (type === 'review-knowledge') {
      await api(`/api/knowledge/${form.dataset.id}/review`, {
        method: 'POST',
        body: { decision: submitter.value, note: formValues(form).note },
      });
      closeModal();
      toast(submitter.value === 'published' ? '知识已审核发布' : '审核状态已更新');
      await renderCurrent();
      return;
    }
    if (type === 'save-knowledge-acl') {
      const userIds = new FormData(form).getAll('userIds').map(Number);
      await api(`/api/knowledge/${form.dataset.id}/acl`, {
        method: 'PUT',
        body: { userIds },
      });
      closeModal();
      toast('个案授权已更新');
      await renderCurrent();
      return;
    }
    if (type === 'save-activity') {
      const values = formValues(form);
      const payload = {
        title: values.title,
        startsAt: new Date(values.startsAt).toISOString(),
        endsAt: new Date(values.endsAt).toISOString(),
        location: values.location,
        introduction: values.introduction,
        content: values.content,
        requirements: values.requirements,
        notes: values.notes,
        status: values.status,
      };
      const id = form.dataset.id;
      const result = id
        ? await api(`/api/activities/${id}`, { method: 'PATCH', body: payload })
        : await api('/api/activities', { method: 'POST', body: payload });
      await uploadSelectedFiles(form, 'activity', result.item.id);
      closeModal();
      toast(id ? '活动已更新' : '活动已创建');
      await renderCurrent();
      return;
    }
    if (type === 'reply-question') {
      const values = formValues(form);
      await api(`/api/questions/${form.dataset.id}`, {
        method: 'PATCH',
        body: {
          status: values.status,
          answer: values.answer,
          isFaq: values.isFaq === '1',
        },
      });
      closeModal();
      toast('问题回复已保存');
      await renderCurrent();
      return;
    }
    if (type === 'review-feedback') {
      const values = formValues(form);
      await api(`/api/feedback/${form.dataset.id}/review`, {
        method: 'POST',
        body: {
          status: values.status,
          visibility: values.visibility,
          tags: values.tags,
          reviewNote: values.reviewNote,
          adminReply: values.adminReply,
          featured: values.featured === '1',
        },
      });
      closeModal();
      toast('反馈审核结果已保存');
      await renderCurrent();
      return;
    }
    if (type === 'review-community') {
      const values = formValues(form);
      await api(`/api/community/${form.dataset.id}/review`, {
        method: 'POST',
        body: { status: values.status, reviewNote: values.reviewNote },
      });
      closeModal();
      toast('社群内容审核结果已保存');
      await renderCurrent();
      return;
    }
    if (type === 'convert-knowledge') {
      const values = formValues(form);
      const endpoint = form.dataset.type === 'feedback'
        ? `/api/feedback/${form.dataset.id}/convert`
        : `/api/questions/${form.dataset.id}/convert`;
      const result = await api(endpoint, {
        method: 'POST',
        body: {
          title: values.title,
          category: values.category,
          visibility: values.visibility,
        },
      });
      closeModal();
      toast('知识草稿已创建，请继续编辑与审核');
      window.location.hash = `#/admin/knowledge?status=draft`;
      if (result.knowledgeId) {
        setTimeout(() => toast(`知识草稿 ID：${result.knowledgeId}`), 250);
      }
      await renderCurrent();
      return;
    }
    if (type === 'save-user-roles') {
      const roleIds = new FormData(form).getAll('roleIds').map(Number);
      await api(`/api/admin/users/${form.dataset.id}/roles`, {
        method: 'PUT',
        body: { roleIds },
      });
      closeModal();
      toast('用户角色已更新');
      await renderCurrent();
      return;
    }
    if (type === 'save-user-permissions') {
      const permissionCodes = new FormData(form).getAll('permissionCodes');
      await api(`/api/admin/users/${form.dataset.id}/permissions`, {
        method: 'PUT',
        body: { permissionCodes },
      });
      closeModal();
      toast('用户单独授权已更新');
      await renderCurrent();
      return;
    }
    if (type === 'save-role') {
      const values = formValues(form);
      const payload = {
        code: values.code,
        name: values.name,
        description: values.description,
        adminAccess: values.adminAccess === '1',
        permissionCodes: new FormData(form).getAll('permissionCodes'),
      };
      const id = form.dataset.id;
      if (id) {
        await api(`/api/admin/roles/${id}`, { method: 'PATCH', body: payload });
      } else {
        await api('/api/admin/roles', { method: 'POST', body: payload });
      }
      closeModal();
      toast(id ? '角色配置已更新' : '角色已创建');
      await renderCurrent();
    }
  } catch (error) {
    if (['login', 'register', 'setup-admin'].includes(type)) {
      if (error.code === 'phone_not_registered') {
        showFormError(form, error.message, {
          href: '#/register',
          label: '立即注册',
        });
      } else if (error.code === 'phone_registered') {
        showFormError(form, error.message, {
          href: '#/login/volunteer',
          label: '前往登录',
        });
      } else {
        showFormError(form, error.message);
      }
    } else {
      toast(error.message, 'error');
    }
  } finally {
    restore();
  }
}

document.addEventListener('click', handleAction);
document.addEventListener('submit', handleSubmit);
document.addEventListener('session-expired', async () => {
  const { state } = window.__xqnState;
  state.user = null;
  await renderCurrent();
});
document.querySelector('#modal')?.addEventListener('click', (event) => {
  if (event.target === event.currentTarget) closeModal();
});
document.addEventListener('keydown', (event) => {
  if (
    event.key === '/' &&
    document.activeElement?.tagName !== 'INPUT' &&
    document.activeElement?.tagName !== 'TEXTAREA' &&
    !document.querySelector('#modal')?.open
  ) {
    event.preventDefault();
    document.querySelector('#global-search-input')?.focus();
  }
});
window.addEventListener('hashchange', renderCurrent);

const core = await import('./js/core.js');
window.__xqnState = { state: core.state };
bootstrap();
