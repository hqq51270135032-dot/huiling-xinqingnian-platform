import {
  api,
  avatar,
  emptyState,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatDateTimeLong,
  hasPermission,
  icon,
  isSystemAdmin,
  relativeTime,
  statusBadge,
  tagList,
  visibilityBadge,
} from '../core.js';

function statCard(label, value, iconName, note, tone = '') {
  return `
    <article class="stat-card">
      <div class="stat-card-top">
        <span>${escapeHtml(label)}</span>
        <span class="stat-icon" ${tone ? `style="color:var(--${tone});background:var(--${tone}-soft)"` : ''}>${icon(iconName)}</span>
      </div>
      <strong>${value}</strong>
      <small>${escapeHtml(note)}</small>
    </article>
  `;
}

export async function renderAdminOverview() {
  const data = await api('/api/admin/stats');
  const maxCategory = Math.max(1, ...data.categories.map((item) => item.count));
  const maxTrend = Math.max(1, ...data.feedbackTrend.map((item) => item.count));
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('layout-dashboard', 'icon-sm')} 工作台</span>
        <h1 class="page-title">数据概览</h1>
        <p class="page-subtitle">关注待审核内容、待回复问题和活动反馈，让知识更新保持连续。</p>
      </div>
      <a class="btn btn-secondary" href="#/admin/knowledge">${icon('plus')} 新建知识</a>
    </div>

    <div class="stat-grid">
      ${statCard('活跃用户', data.counts.users, 'users', '当前可登录账号')}
      ${statCard('已发布知识', data.counts.knowledge, 'book-open', `${data.counts.pendingKnowledge} 条待审核`)}
      ${statCard('活动总数', data.counts.activities, 'calendar-check', '发布与已结束')}
      ${statCard('待审核反馈', data.counts.pendingFeedback, 'clipboard-check', '需要管理员处理', 'accent')}
      ${statCard('待处理问题', data.counts.pendingQuestions, 'message-circle-question', '含处理中问题', 'gold')}
      ${statCard('待审核社群', data.counts.pendingCommunity, 'message-square-check', '新分享等待审核', 'blue')}
      ${statCard('近 14 天反馈', data.feedbackTrend.reduce((sum, item) => sum + item.count, 0), 'badge-check', '活动复盘提交量')}
      ${statCard('知识分类', data.categories.length, 'library', '已发布内容分类')}
    </div>

    <div class="admin-grid">
      <div class="stack">
        <section class="chart-card">
          <div class="section-heading">
            <div><span class="eyebrow">内容结构</span><h2>知识分类分布</h2></div>
            <span class="small muted">已发布内容</span>
          </div>
          <div class="bar-chart">
            ${data.categories.map((item) => `
              <div class="bar-column" title="${escapeHtml(item.category)}：${item.count} 条">
                <span class="small">${item.count}</span>
                <span class="bar" style="height:${Math.max(8, Math.round(item.count / maxCategory * 130))}px"></span>
                <span class="bar-label">${escapeHtml(item.category)}</span>
              </div>
            `).join('') || '<div class="muted small">暂无已发布知识</div>'}
          </div>
        </section>
        <section class="chart-card">
          <div class="section-heading">
            <div><span class="eyebrow">近 14 天</span><h2>反馈提交趋势</h2></div>
          </div>
          <div class="bar-chart" style="min-height:150px">
            ${data.feedbackTrend.map((item) => `
              <div class="bar-column" title="${item.date}：${item.count} 条">
                <span class="bar" style="height:${Math.max(6, Math.round(item.count / maxTrend * 95))}px"></span>
                <span class="bar-label">${item.date.slice(5)}</span>
              </div>
            `).join('') || '<div class="muted small">近 14 天暂无反馈</div>'}
          </div>
        </section>
        <section class="table-wrap">
          <div class="section-heading" style="padding:16px 16px 8px;margin:0"><h2 style="font-size:16px">近期活动</h2><a class="btn btn-ghost btn-small" href="#/admin/activities">管理活动</a></div>
          <table>
            <thead><tr><th>活动</th><th>时间</th><th>状态</th><th>报名</th></tr></thead>
            <tbody>
              ${data.recentActivity.map((item) => `
                <tr>
                  <td><span class="table-title">${escapeHtml(item.title)}</span></td>
                  <td>${formatDate(item.startsAt)}</td>
                  <td>${statusBadge(item.status)}</td>
                  <td>${item.participantCount} 人</td>
                </tr>
              `).join('')}
            </tbody>
          </table>
        </section>
      </div>
      <aside>
        <div class="side-panel">
          <div class="section-heading"><h3>待办入口</h3></div>
          <div class="stack-sm">
            ${quickAction('待审核反馈', data.counts.pendingFeedback, '#/admin/feedback', 'clipboard-check')}
            ${quickAction('待处理问题', data.counts.pendingQuestions, '#/admin/questions', 'message-circle-question')}
            ${quickAction('待审核社群', data.counts.pendingCommunity, '#/admin/community', 'message-square-check')}
            ${quickAction('待审核知识', data.counts.pendingKnowledge, '#/admin/knowledge', 'book-open')}
          </div>
        </div>
        <div class="side-panel">
          <div class="section-heading"><h3>最近操作</h3></div>
          <div class="stack-sm">
            ${data.recentLogs.map((item) => `
              <div class="mini-list-item">
                ${avatar(item.actorName, 'avatar-sm')}
                <div class="mini-list-copy">
                  <strong>${escapeHtml(item.actorName)}</strong>
                  <span>${escapeHtml(actionLabel(item.action))} · ${relativeTime(item.createdAt)}</span>
                </div>
              </div>
            `).join('') || '<div class="muted small">暂无操作记录</div>'}
          </div>
        </div>
      </aside>
    </div>
  `;
}

function quickAction(label, count, href, iconName) {
  return `
    <a class="mini-list-item" href="${href}">
      <span class="stat-icon">${icon(iconName, 'icon-sm')}</span>
      <span class="mini-list-copy"><strong>${escapeHtml(label)}</strong><span>${count} 项待处理</span></span>
      ${icon('chevron-right', 'icon-sm')}
    </a>
  `;
}

export async function renderAdminUsers(params) {
  const query = new URLSearchParams();
  if (params.get('search')) query.set('search', params.get('search'));
  if (params.get('status')) query.set('status', params.get('status'));
  const data = await api(`/api/admin/users?${query.toString()}`);
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('user-cog', 'icon-sm')} 账号与授权</span>
        <h1 class="page-title">用户管理</h1>
        <p class="page-subtitle">账号可同时拥有多个角色。禁用账号后其现有会话会立即失效。</p>
      </div>
    </div>
    <form class="filter-bar" data-form="admin-user-filter">
      <div class="search-inline">
        ${icon('search')}
        <input name="search" value="${escapeHtml(params.get('search') || '')}" placeholder="搜索昵称或手机号" />
      </div>
      <div class="chips">
        <a class="chip ${!params.get('status') ? 'active' : ''}" href="#/admin/users">全部</a>
        <a class="chip ${params.get('status') === 'active' ? 'active' : ''}" href="#/admin/users?status=active">正常</a>
        <a class="chip ${params.get('status') === 'disabled' ? 'active' : ''}" href="#/admin/users?status=disabled">已禁用</a>
      </div>
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>用户</th><th>角色</th><th>状态</th><th>注册时间</th><th>最后登录</th><th>操作</th></tr></thead>
        <tbody>
          ${data.items.map((user) => `
            <tr>
              <td>
                <div class="cell-user">
                  ${avatar(user.displayName, 'avatar-sm')}
                  <div><strong>${escapeHtml(user.displayName)}${user.id === data.currentUserId ? '（当前）' : ''}</strong><span>${escapeHtml(user.phone || '未绑定手机号')}</span></div>
                </div>
              </td>
              <td><div class="tag-list">${user.roles.map((role) => `<span class="tag">${escapeHtml(role.name)}</span>`).join('') || '<span class="muted">未分配</span>'}</div></td>
              <td>${statusBadge(user.status)}</td>
              <td class="small muted">${formatDate(user.createdAt)}</td>
              <td class="small muted">${user.lastLoginAt ? formatDateTime(user.lastLoginAt) : '从未登录'}</td>
              <td>
                <div class="row-actions">
                  ${hasPermission('role.manage') ? `<button class="btn btn-small btn-secondary" type="button" data-action="edit-user-roles" data-id="${user.id}">分配角色</button><button class="btn btn-small btn-secondary" type="button" data-action="edit-user-permissions" data-id="${user.id}">单独授权</button>` : ''}
                  <button class="btn btn-small ${user.status === 'active' ? 'btn-danger' : 'btn-soft'}" type="button" data-action="toggle-user-status" data-id="${user.id}" data-status="${user.status}" ${user.id === data.currentUserId ? 'disabled' : ''}>${user.status === 'active' ? '禁用' : '启用'}</button>
                </div>
              </td>
            </tr>
          `).join('') || `<tr><td colspan="6">${emptyState('没有匹配用户', '尝试更换筛选条件', 'users')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminKnowledge(params) {
  const query = new URLSearchParams({ scope: 'manage' });
  if (params.get('search')) query.set('search', params.get('search'));
  if (params.get('status')) query.set('status', params.get('status'));
  if (params.get('visibility')) query.set('visibility', params.get('visibility'));
  const data = await api(`/api/knowledge?${query.toString()}`);
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('library', 'icon-sm')} 内容管理</span>
        <h1 class="page-title">知识库管理</h1>
        <p class="page-subtitle">维护公开知识、内部培训与受限案例。每条内容独立设置可见范围与审核状态。</p>
      </div>
      ${hasPermission('knowledge.create') ? `<button class="btn btn-primary" type="button" data-action="new-knowledge">${icon('plus')} 新建知识</button>` : ''}
    </div>
    <form class="filter-bar" data-form="admin-knowledge-filter">
      <div class="search-inline">
        ${icon('search')}
        <input name="search" value="${escapeHtml(params.get('search') || '')}" placeholder="搜索标题、正文或标签" />
      </div>
      <div class="chips">
        <a class="chip ${!params.get('status') ? 'active' : ''}" href="#/admin/knowledge">全部状态</a>
        <a class="chip ${params.get('status') === 'published' ? 'active' : ''}" href="#/admin/knowledge?status=published">已发布</a>
        <a class="chip ${params.get('status') === 'draft' ? 'active' : ''}" href="#/admin/knowledge?status=draft">草稿</a>
        <a class="chip ${params.get('visibility') === 'internal' ? 'active' : ''}" href="#/admin/knowledge?visibility=internal">内部</a>
        <a class="chip ${params.get('visibility') === 'restricted' ? 'active' : ''}" href="#/admin/knowledge?visibility=restricted">受限</a>
      </div>
    </form>
    <div class="table-wrap">
      <table>
        <thead><tr><th>内容</th><th>可见范围</th><th>状态</th><th>更新</th><th>数据</th><th>操作</th></tr></thead>
        <tbody>
          ${data.items.map((item) => `
            <tr>
              <td><a href="#/knowledge/${item.id}"><span class="table-title">${escapeHtml(item.title)}</span><span class="table-sub">${escapeHtml(item.category)} · ${escapeHtml(item.authorName)}</span></a></td>
              <td>${visibilityBadge(item.visibility)}</td>
              <td>${statusBadge(item.status)}</td>
              <td class="small muted">${formatDateTime(item.updatedAt)}</td>
              <td class="small muted">${item.viewCount} 阅读</td>
              <td>
                <div class="row-actions">
                  ${hasPermission('knowledge.edit') ? `<button class="btn btn-small btn-secondary" type="button" data-action="edit-knowledge" data-id="${item.id}">编辑</button>` : ''}
                  ${hasPermission('knowledge.review') && item.status !== 'published' ? `<button class="btn btn-small btn-soft" type="button" data-action="review-knowledge" data-id="${item.id}">发布</button>` : ''}
                  ${isSystemAdmin() && item.visibility === 'restricted' ? `<button class="btn btn-small btn-secondary" type="button" data-action="edit-knowledge-acl" data-id="${item.id}">个案授权</button>` : ''}
                  ${hasPermission('knowledge.delete') ? `<button class="btn btn-small btn-danger" type="button" data-action="delete-knowledge" data-id="${item.id}" data-title="${escapeHtml(item.title)}">删除</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('') || `<tr><td colspan="6">${emptyState('暂无知识内容', '新建内容后会显示在这里', 'book-open')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminQuestions(params) {
  const status = params.get('status') || '';
  const data = await api(`/api/questions?scope=manage${status ? `&status=${status}` : ''}`);
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('message-circle-question', 'icon-sm')} 问答管理</span>
        <h1 class="page-title">问题管理</h1>
        <p class="page-subtitle">回复志愿者问题，标记常见问题，并将高价值答疑整理为知识草稿。</p>
      </div>
    </div>
    <div class="filter-bar">
      <div class="chips">
        <a class="chip ${!status ? 'active' : ''}" href="#/admin/questions">全部</a>
        <a class="chip ${status === 'pending' ? 'active' : ''}" href="#/admin/questions?status=pending">待处理</a>
        <a class="chip ${status === 'processing' ? 'active' : ''}" href="#/admin/questions?status=processing">处理中</a>
        <a class="chip ${status === 'replied' ? 'active' : ''}" href="#/admin/questions?status=replied">已回复</a>
        <a class="chip ${status === 'archived' ? 'active' : ''}" href="#/admin/questions?status=archived">已归档</a>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>问题</th><th>提问者</th><th>状态</th><th>FAQ</th><th>更新时间</th><th>操作</th></tr></thead>
        <tbody>
          ${data.items.map((item) => `
            <tr>
              <td><span class="table-title">${escapeHtml(item.title)}</span><span class="table-sub">${escapeHtml(item.category)} · ${escapeHtml(item.content).slice(0, 60)}</span></td>
              <td>${escapeHtml(item.userName)}</td>
              <td>${statusBadge(item.status)}</td>
              <td>${item.isFaq ? '<span class="pill pill-public">是</span>' : '<span class="muted small">否</span>'}</td>
              <td class="small muted">${relativeTime(item.updatedAt)}</td>
              <td><div class="row-actions"><button class="btn btn-small btn-secondary" type="button" data-action="reply-question" data-id="${item.id}">${item.answer ? '编辑回复' : '回复'}</button>${item.answer ? `<button class="btn btn-small btn-soft" type="button" data-action="convert-question" data-id="${item.id}">转为知识</button>` : ''}</div></td>
            </tr>
          `).join('') || `<tr><td colspan="6">${emptyState('暂无问题', '志愿者提交后会显示在这里')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminActivities(params) {
  const status = params.get('status') || '';
  const data = await api(`/api/activities?scope=manage${status ? `&status=${status}` : ''}`);
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('calendar-days', 'icon-sm')} 活动运营</span>
        <h1 class="page-title">活动管理</h1>
        <p class="page-subtitle">创建活动、管理报名和状态。活动结束后志愿者可提交结构化反馈。</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-activity">${icon('plus')} 创建活动</button>
    </div>
    <div class="filter-bar">
      <div class="chips">
        <a class="chip ${!status ? 'active' : ''}" href="#/admin/activities">全部</a>
        <a class="chip ${status === 'published' ? 'active' : ''}" href="#/admin/activities?status=published">已发布</a>
        <a class="chip ${status === 'draft' ? 'active' : ''}" href="#/admin/activities?status=draft">草稿</a>
        <a class="chip ${status === 'completed' ? 'active' : ''}" href="#/admin/activities?status=completed">已结束</a>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>活动</th><th>时间</th><th>地点</th><th>状态</th><th>报名</th><th>操作</th></tr></thead>
        <tbody>
          ${data.items.map((item) => `
            <tr>
              <td><span class="table-title">${escapeHtml(item.title)}</span><span class="table-sub">${escapeHtml(item.introduction).slice(0, 60)}</span></td>
              <td class="small">${formatDateTime(item.startsAt)}</td>
              <td class="small">${escapeHtml(item.location)}</td>
              <td>${statusBadge(item.status)}</td>
              <td>${item.participantCount} 人</td>
              <td><div class="row-actions"><button class="btn btn-small btn-secondary" type="button" data-action="edit-activity" data-id="${item.id}">编辑</button><a class="btn btn-small btn-ghost" href="#/activities/${item.id}">查看</a></div></td>
            </tr>
          `).join('') || `<tr><td colspan="6">${emptyState('暂无活动', '创建活动后会显示在这里', 'calendar-days')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminFeedback(params) {
  const status = params.get('status') || '';
  const data = await api(`/api/feedback?scope=review${status ? `&status=${status}` : ''}`);
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('clipboard-check', 'icon-sm')} 审核与复盘</span>
        <h1 class="page-title">活动反馈管理</h1>
        <p class="page-subtitle">审核时先区分客观观察与个人判断，确认匿名化后再决定是否公开或转为知识草稿。</p>
      </div>
    </div>
    <div class="filter-bar">
      <div class="chips">
        <a class="chip ${!status ? 'active' : ''}" href="#/admin/feedback">全部</a>
        <a class="chip ${status === 'pending' ? 'active' : ''}" href="#/admin/feedback?status=pending">待处理</a>
        <a class="chip ${status === 'revision' ? 'active' : ''}" href="#/admin/feedback?status=revision">退回修改</a>
        <a class="chip ${status === 'approved' ? 'active' : ''}" href="#/admin/feedback?status=approved">已通过</a>
        <a class="chip ${status === 'rejected' ? 'active' : ''}" href="#/admin/feedback?status=rejected">未通过</a>
      </div>
    </div>
    <div class="table-wrap">
      <table>
        <thead><tr><th>活动 / 反馈</th><th>提交者</th><th>状态</th><th>公开</th><th>提交时间</th><th>操作</th></tr></thead>
        <tbody>
          ${data.items.map((item) => `
            <tr>
              <td><span class="table-title">${escapeHtml(item.activityTitle)}</span><span class="table-sub">${escapeHtml(item.observations).slice(0, 70)}</span></td>
              <td>${escapeHtml(item.userName)}</td>
              <td>${statusBadge(item.status)}${item.featured ? ' <span class="pill pill-restricted">精选</span>' : ''}</td>
              <td>${item.visibility === 'public' ? '<span class="pill pill-public">公开</span>' : '<span class="pill pill-internal">私有</span>'}</td>
              <td class="small muted">${formatDateTime(item.submittedAt)}</td>
              <td>
                <div class="row-actions">
                  <button class="btn btn-small btn-secondary" type="button" data-action="review-feedback" data-id="${item.id}">审核</button>
                  ${item.status === 'approved' && hasPermission('knowledge.create') ? `<button class="btn btn-small btn-soft" type="button" data-action="convert-feedback" data-id="${item.id}">转为知识</button>` : ''}
                </div>
              </td>
            </tr>
          `).join('') || `<tr><td colspan="6">${emptyState('暂无反馈', '志愿者提交活动反馈后会显示在这里')}</td></tr>`}
        </tbody>
      </table>
    </div>
  `;
}

export async function renderAdminCommunity() {
  const data = await api('/api/community?scope=review');
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('message-square-check', 'icon-sm')} 内容审核</span>
        <h1 class="page-title">社群内容审核</h1>
        <p class="page-subtitle">审核经验分享的隐私、事实和表达方式。未通过内容不会进入公开社群。</p>
      </div>
    </div>
    <div class="community-feed">
      ${data.items.map((post) => `
        <article class="post-card">
          <div class="post-head">
            <div class="post-author">
              ${avatar(post.userName)}
              <div><strong>${escapeHtml(post.userName)}</strong><span>${escapeHtml(post.category)} · ${formatDateTime(post.createdAt)}</span></div>
            </div>
            <div class="meta-row">${statusBadge(post.status)}${post.activityTitle ? `<span class="tag">${escapeHtml(post.activityTitle)}</span>` : ''}</div>
          </div>
          <h2>${escapeHtml(post.title)}</h2>
          <div class="post-body">${escapeHtml(post.content)}</div>
          ${post.reviewNote ? `<div class="notice" style="margin-top:12px">${escapeHtml(post.reviewNote)}</div>` : ''}
          <div class="post-footer">
            <span class="small muted">${post.commentCount} 条回应</span>
            <div class="inline-actions">
              <button class="btn btn-small btn-secondary" type="button" data-action="review-community" data-id="${post.id}" data-status="${post.status}">审核</button>
            </div>
          </div>
        </article>
      `).join('') || emptyState('暂无社群内容', '志愿者发布后会显示在这里', 'message-square-check')}
    </div>
  `;
}

export async function renderAdminRoles() {
  const [roles, permissions] = await Promise.all([
    api('/api/admin/roles'),
    api('/api/admin/permissions'),
  ]);
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('shield', 'icon-sm')} 访问控制</span>
        <h1 class="page-title">角色与权限</h1>
        <p class="page-subtitle">角色决定后台功能与内容访问范围。用户可同时拥有多个角色，也可获得单独授权。</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-role">${icon('plus')} 创建角色</button>
    </div>
    <div class="role-list">
      ${roles.items.map((role) => `
        <article class="role-row">
          <div>
            <div class="meta-row"><h3>${escapeHtml(role.name)}</h3>${role.adminAccess ? '<span class="pill pill-internal">后台角色</span>' : '<span class="tag">志愿者端</span>'}${role.isSystem ? '<span class="tag">内置</span>' : ''}</div>
            <p>${escapeHtml(role.description || '暂无角色说明')} · ${role.userCount} 位用户</p>
            <div class="role-permissions">
              ${role.permissions.slice(0, 8).map((permission) => `<span class="tag">${escapeHtml(permission.name)}</span>`).join('')}
              ${role.permissions.length > 8 ? `<span class="tag">另 ${role.permissions.length - 8} 项</span>` : ''}
            </div>
          </div>
          <div class="inline-actions">
            ${role.code === 'system_admin'
              ? '<span class="tag">固定全权限</span>'
              : `<button class="btn btn-small btn-secondary" type="button" data-action="edit-role" data-id="${role.id}">${icon('pencil', 'icon-sm')} 配置</button>`}
            ${!role.isSystem ? `<button class="btn btn-small btn-danger" type="button" data-action="delete-role" data-id="${role.id}" data-name="${escapeHtml(role.name)}">删除</button>` : ''}
          </div>
        </article>
      `).join('')}
    </div>
    <div class="notice notice-blue" style="margin-top:20px">
      ${icon('lock-keyhole')}
      <span>权限修改会在用户下一次 API 请求时生效。系统权限与内容权限均由服务端再次校验。</span>
    </div>
  `;
}

export async function renderAdminSettings() {
  const [settings, audit] = await Promise.all([
    api('/api/admin/settings'),
    api('/api/admin/audit?limit=100'),
  ]);
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('settings', 'icon-sm')} 系统治理</span>
        <h1 class="page-title">系统设置</h1>
        <p class="page-subtitle">查看运行配置、上传策略与关键操作审计记录。</p>
      </div>
    </div>
    <div class="settings-grid">
      ${settingItem('平台版本', settings.version, '当前部署版本', 'badge-check')}
      ${settingItem('会话有效期', `${settings.security.sessionDays} 天`, 'HttpOnly Cookie', 'clock')}
      ${settingItem('短信验证码', 'HMAC-SHA256 摘要', '数据库不保存验证码明文', 'lock-keyhole')}
      ${settingItem('服务端授权', '已启用', '所有敏感 API 均校验权限', 'shield')}
      ${settingItem('上传上限', `${settings.uploadPolicy.maxFileSizeMb} MB`, '单文件大小限制', 'paperclip')}
      ${settingItem('支持文件', settings.uploadPolicy.types.join(' / '), '图片、PDF 与办公文档', 'file-text')}
    </div>
    <section style="margin-top:24px">
      <div class="section-heading"><div><span class="eyebrow">审计追踪</span><h2>最近操作日志</h2></div><span class="small muted">最多显示 100 条</span></div>
      <div class="side-panel">
        <div class="audit-list">
          ${audit.items.map((item) => `
            <div class="audit-item">
              <span class="muted">${formatDateTime(item.createdAt)}</span>
              <span><strong>${escapeHtml(item.actorName)}</strong> · ${escapeHtml(actionLabel(item.action))}<br><span class="muted">${escapeHtml(item.entityType)} ${item.entityId || ''}</span></span>
              <span class="muted">${escapeHtml(item.ip || '—')}</span>
            </div>
          `).join('') || '<div class="muted small">暂无日志</div>'}
        </div>
      </div>
    </section>
  `;
}

function settingItem(title, value, note, iconName) {
  return `
    <div class="settings-item">
      <span class="stat-icon">${icon(iconName)}</span>
      <div><strong>${escapeHtml(title)}</strong><span>${escapeHtml(value)}</span><br><span>${escapeHtml(note)}</span></div>
    </div>
  `;
}

function actionLabel(action) {
  const labels = {
    'auth.register': '注册账号',
    'auth.login': '登录平台',
    'setup.admin_created': '初始化平台管理员',
    'profile.update': '更新个人资料',
    'knowledge.create': '新建知识',
    'knowledge.update': '更新知识',
    'knowledge.delete': '删除知识',
    'knowledge.review': '审核知识',
    'knowledge.acl_update': '调整个案授权',
    'activity.create': '创建活动',
    'activity.update': '更新活动',
    'activity.delete': '删除活动',
    'activity.join': '报名活动',
    'activity.leave': '取消报名',
    'feedback.create': '提交反馈',
    'feedback.review': '审核反馈',
    'feedback.resubmit': '重新提交反馈',
    'feedback.convert': '反馈转为知识',
    'question.create': '提交问题',
    'question.update': '更新问题',
    'question.convert': '问题转为知识',
    'community.create': '发布社群内容',
    'community.review': '审核社群内容',
    'community.comment': '发表评论',
    'user.status_update': '更新用户状态',
    'user.roles_update': '分配用户角色',
    'user.permissions_update': '单独授权',
    'role.create': '创建角色',
    'role.update': '更新角色',
    'role.delete': '删除角色',
    'file.upload': '上传附件',
    'file.delete': '删除附件',
  };
  return labels[action] || action;
}
