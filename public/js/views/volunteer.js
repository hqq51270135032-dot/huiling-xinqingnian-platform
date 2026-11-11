import {
  api,
  avatar,
  emptyState,
  escapeHtml,
  formatDate,
  formatDateTime,
  formatDateTimeLong,
  formatLongDate,
  icon,
  nl2br,
  relativeTime,
  statusBadge,
  tagList,
  visibilityBadge,
} from '../core.js';

function greeting() {
  const hour = new Date().getHours();
  if (hour < 6) return '夜深了';
  if (hour < 11) return '早上好';
  if (hour < 14) return '中午好';
  if (hour < 18) return '下午好';
  return '晚上好';
}

function knowledgeCard(item) {
  return `
    <article class="knowledge-card">
      <div class="knowledge-card-top">
        <div class="meta-row">
          ${visibilityBadge(item.visibility)}
          <span class="tag">${escapeHtml(item.category)}</span>
        </div>
        <button
          class="icon-button ${item.isFavorite ? 'is-active' : ''}"
          type="button"
          data-action="toggle-favorite"
          data-id="${item.id}"
          aria-label="${item.isFavorite ? '取消收藏' : '收藏知识'}"
          title="${item.isFavorite ? '取消收藏' : '收藏知识'}"
        >${icon('heart', 'icon-sm')}</button>
      </div>
      <a href="#/knowledge/${item.id}">
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.summary || '打开内容查看完整学习资料')}</p>
      </a>
      <div class="knowledge-card-bottom">
        <div class="meta-row">
          <span>${escapeHtml(item.authorName || '内容团队')}</span>
          <span class="meta-divider"></span>
          <span>${item.viewCount || 0} 次阅读</span>
        </div>
        <a class="text-success" href="#/knowledge/${item.id}" aria-label="阅读${escapeHtml(item.title)}">${icon('arrow-right', 'icon-sm')}</a>
      </div>
    </article>
  `;
}

export async function renderHome(user) {
  const data = await api('/api/home');
  const latest = data.knowledge.slice(0, 4);
  const firstPending = data.pendingFeedback[0];
  return `
    <section class="home-band">
      <div class="home-band-copy">
        <div>
          <span class="eyebrow" style="color:#cfe3d5">${icon('sparkles', 'icon-sm')} ${formatLongDate(new Date())}</span>
          <h1>${greeting()}，${escapeHtml(user.displayName)}。</h1>
          <p>每次学习都在为下一次陪伴做准备。你可以从推荐内容开始，也可以查看最近活动和社群里的实践经验。</p>
          <div class="home-band-stats">
            <div class="home-stat"><strong>${data.stats.learnedCount}</strong><span>已学习内容</span></div>
            <div class="home-stat"><strong>${data.stats.favoriteCount}</strong><span>收藏知识</span></div>
            <div class="home-stat"><strong>${data.stats.pendingFeedbackCount}</strong><span>待提交反馈</span></div>
          </div>
        </div>
        <div class="inline-actions">
          <a class="btn btn-secondary" href="#/knowledge">进入知识库 ${icon('arrow-right')}</a>
          <a class="btn btn-accent" href="#/activities">查看活动</a>
        </div>
      </div>
      <div class="home-band-art">
        <img src="/assets/connection.svg" alt="" />
      </div>
    </section>

    ${firstPending ? `
      <div class="feedback-banner" style="margin-bottom:24px">
        <div class="feedback-banner-copy">
          <strong>${escapeHtml(firstPending.title)} 的活动反馈还未提交</strong>
          <span>${formatDate(firstPending.startsAt)} · ${escapeHtml(firstPending.location)}</span>
        </div>
        <a class="btn btn-accent" href="#/feedback/new/${firstPending.id}">${icon('clipboard-check')} 填写反馈</a>
      </div>
    ` : ''}

    <div class="dashboard-grid">
      <div class="stack">
        <section>
          <div class="section-heading">
            <div>
              <span class="eyebrow">持续学习</span>
              <h2>最新知识</h2>
            </div>
            <a class="btn btn-ghost btn-small" href="#/knowledge">全部内容 ${icon('arrow-right', 'icon-sm')}</a>
          </div>
          <div class="knowledge-grid">
            ${latest.map(knowledgeCard).join('') || emptyState('暂无公开知识', '内容管理员发布后会显示在这里')}
          </div>
        </section>

        <section class="side-panel">
          <div class="section-heading">
            <h2>社群新声</h2>
            <a class="btn btn-ghost btn-small" href="#/community">进入社群</a>
          </div>
          ${data.posts.map((post) => `
            <article class="post-preview">
              <div class="meta-row">
                <span class="tag">${escapeHtml(post.category)}</span>
                <span class="small muted">${escapeHtml(post.userName)} · ${relativeTime(post.createdAt)}</span>
              </div>
              <h4>${escapeHtml(post.title)}</h4>
              <p>${escapeHtml(post.content)}</p>
            </article>
          `).join('') || emptyState('暂无社群分享', '发布经验后需经管理员审核', 'message-square-check')}
        </section>
      </div>

      <aside class="stack">
        <section class="side-panel">
          <div class="section-heading">
            <h3>近期活动</h3>
            <a class="btn btn-ghost btn-small" href="#/activities">全部</a>
          </div>
          <div class="mini-list">
            ${data.activities.map((activity) => {
              const parts = { day: String(new Date(activity.startsAt).getDate()).padStart(2, '0'), month: `${new Date(activity.startsAt).getMonth() + 1}月` };
              return `
                <a class="mini-list-item" href="#/activities/${activity.id}">
                  <span class="mini-date"><strong>${parts.day}</strong><span>${parts.month}</span></span>
                  <span class="mini-list-copy">
                    <strong>${escapeHtml(activity.title)}</strong>
                    <span>${escapeHtml(activity.location)} · ${activity.participantCount} 人报名</span>
                  </span>
                </a>
              `;
            }).join('') || `<div class="muted small">暂无近期活动</div>`}
          </div>
        </section>

        <section class="side-panel">
          <div class="section-heading">
            <h3>推荐学习</h3>
            <span class="text-success">${icon('sparkles', 'icon-sm')}</span>
          </div>
          <div class="mini-list">
            ${data.recommended.map((item) => `
              <a class="mini-list-item" href="#/knowledge/${item.id}">
                <span class="stat-icon">${icon('book-open', 'icon-sm')}</span>
                <span class="mini-list-copy">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${escapeHtml(item.category)}</span>
                </span>
              </a>
            `).join('') || `<div class="muted small">暂无推荐内容</div>`}
          </div>
        </section>

        <section class="side-panel">
          <div class="section-heading">
            <h3>常见问题</h3>
            <a class="btn btn-ghost btn-small" href="#/questions">更多</a>
          </div>
          <div class="stack-sm">
            ${data.faqs.slice(0, 3).map((faq) => `
              <a href="#/questions" class="mini-list-item">
                <span class="stat-icon">${icon('message-circle-question', 'icon-sm')}</span>
                <span class="mini-list-copy">
                  <strong>${escapeHtml(faq.title)}</strong>
                  <span>${escapeHtml(faq.category)}</span>
                </span>
              </a>
            `).join('') || `<div class="muted small">暂无常见问题</div>`}
          </div>
        </section>
      </aside>
    </div>
  `;
}

export async function renderKnowledgeList(params) {
  const query = new URLSearchParams();
  if (params.get('search')) query.set('search', params.get('search'));
  if (params.get('category')) query.set('category', params.get('category'));
  if (params.get('favorites') === '1') query.set('favorites', '1');
  const data = await api(`/api/knowledge?${query.toString()}`);
  const search = params.get('search') || '';
  const category = params.get('category') || '';
  const favorites = params.get('favorites') === '1';
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('book-open', 'icon-sm')} 学习中心</span>
        <h1 class="page-title">知识库</h1>
        <p class="page-subtitle">从基础认知到服务案例，按自己的节奏学习。内部资料与受限案例只对已授权账号展示。</p>
      </div>
      <a class="btn btn-secondary" href="#/knowledge?favorites=1">${icon('heart')} 我的收藏</a>
    </div>

    <form class="filter-bar" data-form="knowledge-filter">
      <div class="search-inline">
        ${icon('search')}
        <input name="search" value="${escapeHtml(search)}" placeholder="搜索标题、内容或标签" aria-label="搜索知识库" />
      </div>
      <div class="chips">
        <a class="chip ${!category && !favorites ? 'active' : ''}" href="#/knowledge">全部</a>
        ${data.categories.map((item) => `
          <a class="chip ${category === item ? 'active' : ''}" href="#/knowledge?category=${encodeURIComponent(item)}">${escapeHtml(item)}</a>
        `).join('')}
        <a class="chip ${favorites ? 'active' : ''}" href="#/knowledge?favorites=1">${favorites ? '仅看收藏' : '收藏'}</a>
      </div>
    </form>

    <div class="section-heading">
      <span class="muted small">共 ${data.total} 条可访问内容</span>
    </div>
    <div class="knowledge-grid">
      ${data.items.map(knowledgeCard).join('') || emptyState('没有找到匹配内容', '尝试更换分类或搜索词', 'search')}
    </div>
  `;
}

export async function renderKnowledgeDetail(id) {
  const { item } = await api(`/api/knowledge/${id}`);
  const paragraphs = item.content
    .split(/\n{2,}/)
    .map((paragraph) => `<p>${nl2br(paragraph)}</p>`)
    .join('');
  return `
    <div class="layout-two-col">
      <article class="article">
        <a class="btn btn-ghost btn-small" href="#/knowledge">${icon('arrow-left', 'icon-sm')} 返回知识库</a>
        <div class="meta-row" style="margin-top:13px">
          ${visibilityBadge(item.visibility)}
          <span class="tag">${escapeHtml(item.category)}</span>
          ${item.status !== 'published' ? statusBadge(item.status) : ''}
        </div>
        <h1 class="article-title">${escapeHtml(item.title)}</h1>
        <div class="article-meta">
          <span>${escapeHtml(item.authorName)}</span>
          <span class="meta-divider"></span>
          <span>${formatDate(item.publishedAt || item.updatedAt)}</span>
          <span class="meta-divider"></span>
          <span>${item.viewCount} 次阅读</span>
          <span class="meta-divider"></span>
          <span>约 ${Math.max(2, Math.ceil(item.content.length / 450))} 分钟</span>
        </div>
        <div class="article-body">${paragraphs}</div>
        ${item.attachments.length ? `
          <div class="divider"></div>
          <div class="section-heading"><h3>附件资料</h3></div>
          <div class="attachment-list">
            ${item.attachments.map(attachment).join('')}
          </div>
        ` : ''}
        <div class="article-actions">
          <div class="tag-list">${item.tags.map((tag) => `<span class="tag">${escapeHtml(tag)}</span>`).join('')}</div>
          <button class="btn ${item.isFavorite ? 'btn-accent' : 'btn-secondary'}" type="button" data-action="toggle-favorite" data-id="${item.id}">
            ${icon('heart')} ${item.isFavorite ? '已收藏' : '收藏内容'}
          </button>
        </div>
      </article>
      <aside>
        <div class="aside-panel">
          <h3>学习提示</h3>
          <p class="small muted" style="margin-bottom:0">知识内容用于支持志愿服务，不替代医疗诊断或专业处置。涉及具体服务对象的判断，应与现场负责人确认。</p>
        </div>
        ${item.visibility !== 'public' ? `
          <div class="aside-panel">
            ${icon('lock-keyhole', 'icon-lg')}
            <h3 style="margin-top:10px">访问范围受控</h3>
            <p class="small muted" style="margin-bottom:0">${item.visibility === 'internal' ? '该内容属于内部培训资料，请勿转发至组织外部。' : '该内容包含受限案例信息，仅授权人员可查看，请遵守隐私要求。'}</p>
          </div>
        ` : ''}
        <div class="aside-panel">
          <h3>下一步</h3>
          <a class="btn btn-secondary btn-block" href="#/questions">${icon('message-circle-question')} 查看常见问题</a>
          <a class="btn btn-primary btn-block" style="margin-top:8px" href="#/feedback">${icon('clipboard-check')} 填写活动反馈</a>
        </div>
      </aside>
    </div>
  `;
}

function attachment(item) {
  if (item.mimeType?.startsWith('video/')) {
    return `
      <div class="attachment-video">
        <video controls preload="metadata" src="${item.url}"></video>
        <div class="attachment">
          ${icon('file-text', 'icon-sm')}
          <span class="attachment-name">${escapeHtml(item.originalName)}</span>
          <span class="muted">${formatFileSize(item.sizeBytes)}</span>
          <a href="${item.url}" download="${escapeHtml(item.originalName)}" aria-label="下载视频">${icon('download', 'icon-sm')}</a>
        </div>
      </div>
    `;
  }
  return `
    <a class="attachment" href="${item.url}" target="_blank" rel="noopener">
      ${icon(item.mimeType.startsWith('image/') ? 'image' : 'file-text', 'icon-sm')}
      <span class="attachment-name">${escapeHtml(item.originalName)}</span>
      <span class="muted">${formatFileSize(item.sizeBytes)}</span>
      ${icon('download', 'icon-sm')}
    </a>
  `;
}

function formatFileSize(bytes) {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export async function renderQuestions(params) {
  const [faqData, mineData] = await Promise.all([
    api(`/api/questions?scope=faq${params.get('category') ? `&category=${encodeURIComponent(params.get('category'))}` : ''}`),
    api('/api/questions?scope=mine'),
  ]);
  const categories = [
    '心智障碍基础认知',
    '沟通与互动',
    '行为理解',
    '情绪支持',
    '活动参与',
    '服务规范',
    '志愿者自身困惑',
    '其他问题',
  ];
  const category = params.get('category') || '';
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('message-circle-question', 'icon-sm')} 问题答疑</span>
        <h1 class="page-title">先找到答案，也可以继续提问</h1>
        <p class="page-subtitle">常见问题由内容管理员整理发布。你的个人提问仅自己和管理员可见，回复后可由管理员决定是否转为常见问题。</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="ask-question">${icon('plus')} 提交问题</button>
    </div>

    <div class="layout-two-col">
      <div>
        <div class="filter-bar">
          <div class="chips">
            <a class="chip ${!category ? 'active' : ''}" href="#/questions">全部</a>
            ${categories.slice(0, 6).map((item) => `<a class="chip ${category === item ? 'active' : ''}" href="#/questions?category=${encodeURIComponent(item)}">${escapeHtml(item)}</a>`).join('')}
          </div>
        </div>
        <div class="accordion-list">
          ${faqData.items.map((item, index) => `
            <article class="accordion-item">
              <button class="accordion-trigger" type="button" data-action="toggle-accordion" data-target="faq-${item.id}" aria-expanded="${index === 0 ? 'true' : 'false'}">
                <span>
                  <span class="tag" style="margin-bottom:6px">${escapeHtml(item.category)}</span>
                  <strong>${escapeHtml(item.title)}</strong>
                </span>
                ${icon('chevron-down')}
              </button>
              <div class="accordion-content ${index === 0 ? '' : 'hidden'}" id="faq-${item.id}">
                ${nl2br(item.answer)}
                <div class="meta-row" style="margin-top:10px;color:var(--muted)">
                  <span>${escapeHtml(item.answererName)}</span>
                  <span class="meta-divider"></span>
                  <span>${formatDate(item.answeredAt)}</span>
                </div>
              </div>
            </article>
          `).join('') || emptyState('暂无常见问题', '管理员发布 FAQ 后会显示在这里')}
        </div>
      </div>
      <aside>
        <div class="aside-panel">
          <div class="section-heading">
            <h3>我的提问</h3>
            <span class="pill">${mineData.items.length}</span>
          </div>
          <div class="stack-sm">
            ${mineData.items.slice(0, 6).map((item) => `
              <button class="mini-list-item" type="button" data-action="view-question" data-id="${item.id}" style="width:100%;border-width:0 0 1px;background:transparent;text-align:left">
                <span class="mini-list-copy">
                  <strong>${escapeHtml(item.title)}</strong>
                  <span>${statusLabelInline(item.status)} · ${relativeTime(item.createdAt)}</span>
                </span>
                ${icon('chevron-right', 'icon-sm')}
              </button>
            `).join('') || '<div class="muted small">还没有提交过问题</div>'}
          </div>
        </div>
        <div class="aside-panel">
          <h3>提问建议</h3>
          <p class="small muted" style="margin:0">请描述具体场景、已经尝试的方法和希望获得的支持。避免填写服务对象姓名、联系方式等可识别信息。</p>
        </div>
      </aside>
    </div>
  `;
}

function statusLabelInline(status) {
  return statusBadge(status);
}

export async function renderActivities(params) {
  const status = params.get('status') || '';
  const data = await api(`/api/activities${status ? `?status=${encodeURIComponent(status)}` : ''}`);
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('calendar-days', 'icon-sm')} 实践活动</span>
        <h1 class="page-title">活动</h1>
        <p class="page-subtitle">查看活动安排、报名参与，并在活动结束后提交结构化反馈。</p>
      </div>
      <div class="chips">
        <a class="chip ${!status ? 'active' : ''}" href="#/activities">全部</a>
        <a class="chip ${status === 'published' ? 'active' : ''}" href="#/activities?status=published">可报名</a>
        <a class="chip ${status === 'completed' ? 'active' : ''}" href="#/activities?status=completed">已结束</a>
      </div>
    </div>
    <div class="activity-list">
      ${data.items.map(activityRow).join('') || emptyState('暂无活动', '活动管理员发布后会显示在这里', 'calendar-days')}
    </div>
  `;
}

function activityRow(item) {
  const date = new Date(item.startsAt);
  return `
    <article class="activity-row">
      <div class="activity-date">
        <strong>${String(date.getDate()).padStart(2, '0')}</strong>
        <span>${date.getMonth() + 1}月</span>
      </div>
      <a href="#/activities/${item.id}">
        <div class="meta-row">
          ${statusBadge(item.status)}
          ${item.isJoined ? '<span class="pill pill-public">已报名</span>' : ''}
          ${item.hasFeedback ? '<span class="pill pill-internal">已提交反馈</span>' : ''}
        </div>
        <h3>${escapeHtml(item.title)}</h3>
        <p>${escapeHtml(item.introduction)}</p>
        <div class="meta-row small muted" style="margin-top:8px">
          <span>${icon('clock', 'icon-sm')} ${formatDateTime(item.startsAt)}–${new Date(item.endsAt).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', hour12: false })}</span>
          <span>${icon('map-pin', 'icon-sm')} ${escapeHtml(item.location)}</span>
          <span>${icon('users', 'icon-sm')} ${item.participantCount} 人</span>
        </div>
      </a>
      <a class="btn btn-secondary" href="#/activities/${item.id}">查看详情</a>
    </article>
  `;
}

export async function renderActivityDetail(id) {
  const { item } = await api(`/api/activities/${id}`);
  const canFeedback = item.status === 'completed';
  return `
    <a class="btn btn-ghost btn-small" href="#/activities">${icon('arrow-left', 'icon-sm')} 返回活动列表</a>
    <section class="activity-detail-band" style="margin-top:13px">
      <div>
        <div class="meta-row">${statusBadge(item.status)} ${item.isJoined ? '<span class="pill pill-public">已报名</span>' : ''}</div>
        <h1>${escapeHtml(item.title)}</h1>
        <p>${escapeHtml(item.introduction)}</p>
        <div class="inline-actions" style="margin-top:22px">
          ${
            item.status === 'published'
              ? `<button class="btn ${item.isJoined ? 'btn-secondary' : 'btn-accent'}" type="button" data-action="toggle-join" data-id="${item.id}" data-joined="${item.isJoined}">${icon(item.isJoined ? 'check' : 'users')} ${item.isJoined ? '已报名，取消报名' : '报名参加'}</button>`
              : ''
          }
          ${
            canFeedback
              ? item.myFeedbackId
                ? `<a class="btn btn-secondary" href="#/feedback/${item.myFeedbackId}">${icon('clipboard-check')} 查看我的反馈</a>`
                : `<a class="btn btn-accent" href="#/feedback/new/${item.id}">${icon('clipboard-check')} 填写活动反馈</a>`
              : ''
          }
        </div>
      </div>
      <div class="activity-facts">
        <span class="activity-fact">${icon('calendar-days')} ${formatDateTimeLong(item.startsAt)}</span>
        <span class="activity-fact">${icon('clock')} 至 ${formatDateTime(item.endsAt)}</span>
        <span class="activity-fact">${icon('map-pin')} ${escapeHtml(item.location)}</span>
        <span class="activity-fact">${icon('users')} ${item.participantCount} 人已报名</span>
      </div>
    </section>
    <div class="layout-two-col">
      <div class="stack">
        <section class="article" style="padding:28px">
          <div class="section-heading"><h2>活动内容</h2></div>
          <p style="white-space:pre-wrap;margin-bottom:0">${escapeHtml(item.content)}</p>
        </section>
        <div class="info-grid">
          <section class="info-block"><h3>参与要求</h3><p>${escapeHtml(item.requirements || '无特别要求')}</p></section>
          <section class="info-block"><h3>注意事项</h3><p>${escapeHtml(item.notes || '请遵循现场负责人安排')}</p></section>
        </div>
      </div>
      <aside>
        <div class="aside-panel">
          <h3>反馈提醒</h3>
          <p class="small muted">活动结束后，反馈会保留在你的个人中心。审核通过并选择公开后，其他志愿者才能看到。</p>
          ${canFeedback && !item.myFeedbackId ? `<a class="btn btn-accent btn-block" href="#/feedback/new/${item.id}">填写反馈</a>` : ''}
        </div>
        <div class="aside-panel">
          <h3>隐私提示</h3>
          <p class="small muted" style="margin:0">请勿在反馈中填写服务对象姓名、联系方式或可识别的家庭信息。必要时使用“参与者 A”等匿名表达。</p>
        </div>
      </aside>
    </div>
  `;
}

export async function renderFeedbackForm(activityId, existing = null) {
  let item = existing;
  if (!item) {
    const response = await api(`/api/activities/${activityId}`);
    item = response.item;
  }
  return `
    <a class="btn btn-ghost btn-small" href="#/activities/${activityId}">${icon('arrow-left', 'icon-sm')} 返回活动</a>
    <div class="page-heading" style="margin-top:13px">
      <div>
        <span class="eyebrow">${icon('clipboard-check', 'icon-sm')} 活动复盘</span>
        <h1 class="page-title">${escapeHtml(item.title)} · 活动反馈</h1>
        <p class="page-subtitle">请区分客观观察、个人感受和主观判断。反馈默认仅你和管理员可见，审核通过后才可能公开。</p>
      </div>
    </div>
    <form data-form="submit-feedback" data-activity-id="${activityId}" data-feedback-id="${existing?.id || ''}">
      <div class="feedback-fields">
        <section class="feedback-section">
          <h3>参与时间</h3>
          <p class="field-hint">填写你实际参与活动的时间。</p>
          <div class="field">
            <input class="input" type="datetime-local" name="participationDate" value="${toLocalDateTime(item.startsAt)}" required />
          </div>
        </section>
        <section class="feedback-section">
          <h3>今天遇到了什么问题？</h3>
          <p class="field-hint">描述具体情境和你当时不确定的地方。</p>
          <div class="field">
            <textarea class="textarea" name="problems" maxlength="5000" placeholder="例如：活动开始时参与者不愿进入场地，我不确定应该等待还是引导。">${escapeHtml(existing?.problems || '')}</textarea>
          </div>
        </section>
        <section class="feedback-section">
          <h3>观察到了哪些值得关注的表现？</h3>
          <p class="field-hint">尽量记录可见行为、发生时间和场景，避免性格标签。此项为必填。</p>
          <div class="field">
            <textarea class="textarea" name="observations" maxlength="8000" required minlength="5" placeholder="例如：活动开始后的十分钟内，参与者三次把材料推回桌面，并表示想休息。">${escapeHtml(existing?.observations || '')}</textarea>
          </div>
        </section>
        <section class="feedback-section">
          <h3>沟通或互动中有哪些困难？</h3>
          <p class="field-hint">记录沟通方式、环境和你的尝试。</p>
          <div class="field">
            <textarea class="textarea" name="communicationDifficulties" maxlength="5000" placeholder="例如：直接提问时没有回应，改为展示两个选项后有了反馈。">${escapeHtml(existing?.communicationDifficulties || '')}</textarea>
          </div>
        </section>
        <section class="feedback-section">
          <h3>今天学到了什么？</h3>
          <p class="field-hint">可以写下对你下一步服务有帮助的方法。</p>
          <div class="field">
            <textarea class="textarea" name="learnings" maxlength="5000" placeholder="写下你的学习收获">${escapeHtml(existing?.learnings || '')}</textarea>
          </div>
        </section>
        <section class="feedback-section">
          <h3>对心青年有哪些新的认识？</h3>
          <p class="field-hint">请用具体经验说明，不将单次表现概括为群体特征。</p>
          <div class="field">
            <textarea class="textarea" name="newUnderstanding" maxlength="5000" placeholder="写下新的理解">${escapeHtml(existing?.newUnderstanding || '')}</textarea>
          </div>
        </section>
        <section class="feedback-section">
          <h3>对活动组织有什么建议？</h3>
          <p class="field-hint">可以从动线、材料、人员分工、信息提示等方面提出。</p>
          <div class="field">
            <textarea class="textarea" name="suggestions" maxlength="5000" placeholder="写下改进建议">${escapeHtml(existing?.suggestions || '')}</textarea>
          </div>
        </section>
        <section class="feedback-section">
          <h3>其他补充</h3>
          <p class="field-hint">如有图片，可在提交后上传。请勿上传可识别服务对象身份的未授权照片。</p>
          <div class="field">
            <textarea class="textarea" name="additional" maxlength="5000" placeholder="其他需要说明的内容">${escapeHtml(existing?.additional || '')}</textarea>
          </div>
          <div class="field">
            <label for="feedback-files">图片或文档 <span class="muted">（选填）</span></label>
            <input class="input" id="feedback-files" name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.doc,.docx,.txt" />
          </div>
        </section>
      </div>
      <div class="notice notice-blue" style="margin-bottom:16px">
        ${icon('lock-keyhole')}
        <span>提交后状态为“待处理”。管理员可审核、回复或退回修改；在你确认公开前，内容不会进入公开社群。</span>
      </div>
      <div class="form-actions">
        <a class="btn btn-secondary" href="#/activities/${activityId}">取消</a>
        <button class="btn btn-primary" type="submit">${icon('send')} 提交反馈</button>
      </div>
    </form>
  `;
}

function toLocalDateTime(value) {
  if (!value) return '';
  const date = new Date(value);
  const offset = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offset).toISOString().slice(0, 16);
}

export async function renderFeedbackDetail(id) {
  const { item } = await api(`/api/feedback/${id}`);
  const reviewNotice = {
    pending: '反馈已提交，等待管理员审核。',
    approved: item.visibility === 'public' ? '反馈已审核通过并在社群公开。' : '反馈已审核通过，当前仅自己和管理员可见。',
    rejected: '反馈未通过审核，可查看管理员说明后重新提交。',
    revision: '管理员建议补充或修改，你可以编辑后重新提交。',
  }[item.status];
  return `
    <a class="btn btn-ghost btn-small" href="#/feedback">${icon('arrow-left', 'icon-sm')} 返回反馈记录</a>
    <div class="page-heading" style="margin-top:13px">
      <div>
        <span class="eyebrow">${icon('clipboard-check', 'icon-sm')} 活动复盘</span>
        <h1 class="page-title">${escapeHtml(item.activityTitle)}</h1>
        <p class="page-subtitle">参与时间：${formatDateTimeLong(item.participationDate)}</p>
      </div>
      <div class="inline-actions">
        ${statusBadge(item.status)}
        ${item.visibility === 'public' ? '<span class="pill pill-public">公开</span>' : '<span class="pill pill-internal">仅自己可见</span>'}
        ${['pending', 'revision', 'rejected'].includes(item.status) ? `<a class="btn btn-secondary" href="#/feedback/edit/${item.id}">${icon('pencil')} 修改</a>` : ''}
      </div>
    </div>
    <div class="notice ${item.status === 'approved' ? 'notice-blue' : item.status === 'rejected' ? 'notice-danger' : ''}" style="margin-bottom:18px">
      ${icon(item.status === 'approved' ? 'badge-check' : 'clock')}
      <span>${escapeHtml(reviewNotice)}</span>
    </div>
    <div class="layout-two-col">
      <div class="stack">
        ${feedbackSection('遇到的问题', item.problems)}
        ${feedbackSection('客观观察', item.observations)}
        ${feedbackSection('沟通与互动困难', item.communicationDifficulties)}
        ${feedbackSection('学习收获', item.learnings)}
        ${feedbackSection('新的认识', item.newUnderstanding)}
        ${feedbackSection('改进建议', item.suggestions)}
        ${feedbackSection('其他补充', item.additional)}
        ${item.attachments.length ? `<section class="side-panel"><h3>附件</h3><div class="attachment-list">${item.attachments.map(attachment).join('')}</div></section>` : ''}
      </div>
      <aside>
        <div class="aside-panel">
          <h3>审核记录</h3>
          <div class="stack-sm small">
            <span class="muted">提交时间：${formatDateTime(item.submittedAt)}</span>
            ${item.reviewedAt ? `<span class="muted">审核时间：${formatDateTime(item.reviewedAt)}</span>` : ''}
            ${item.reviewerName ? `<span class="muted">审核人：${escapeHtml(item.reviewerName)}</span>` : ''}
            ${item.reviewNote ? `<div class="notice">${escapeHtml(item.reviewNote)}</div>` : ''}
            ${item.adminReply ? `<div class="notice notice-blue">${escapeHtml(item.adminReply)}</div>` : ''}
          </div>
        </div>
        ${tagList(item.tags) ? `<div class="aside-panel"><h3>整理标签</h3>${tagList(item.tags)}</div>` : ''}
      </aside>
    </div>
  `;
}

function feedbackSection(title, content) {
  if (!content) return '';
  return `<section class="side-panel"><h3>${escapeHtml(title)}</h3><p class="small" style="white-space:pre-wrap;margin:0;color:var(--ink-soft)">${escapeHtml(content)}</p></section>`;
}

export async function renderCommunity() {
  const data = await api('/api/community?scope=public');
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('users', 'icon-sm')} 经验交流</span>
        <h1 class="page-title">志愿者社群</h1>
        <p class="page-subtitle">分享可复用的经验、活动心得与改进建议。新内容经管理员审核后公开。</p>
      </div>
      <button class="btn btn-primary" type="button" data-action="new-community-post">${icon('plus')} 发布分享</button>
    </div>
    <div class="layout-two-col">
      <div class="community-feed">
        ${data.items.map(postCard).join('') || emptyState('社群还没有公开内容', '发布经验分享后会显示在这里', 'message-square-check')}
      </div>
      <aside>
        <div class="aside-panel">
          <h3>社群公约</h3>
          <div class="stack-sm small muted">
            <span>尊重服务对象隐私，不发布可识别信息。</span>
            <span>区分个人判断与客观观察，不以单次表现贴标签。</span>
            <span>经验分享不能替代专业诊断和现场处置。</span>
          </div>
        </div>
        <div class="aside-panel">
          <h3>我的发布</h3>
          <a class="btn btn-secondary btn-block" href="#/profile">在个人中心查看</a>
        </div>
      </aside>
    </div>
  `;
}

function postCard(post) {
  return `
    <article class="post-card" id="post-${post.id}">
      <div class="post-head">
        <div class="post-author">
          ${avatar(post.userName)}
          <div>
            <strong>${escapeHtml(post.userName)}</strong>
            <span>${escapeHtml(post.category)} · ${relativeTime(post.createdAt)}</span>
          </div>
        </div>
        ${post.activityTitle ? `<span class="tag">${escapeHtml(post.activityTitle)}</span>` : ''}
      </div>
      <h2>${escapeHtml(post.title)}</h2>
      <div class="post-body">${escapeHtml(post.content)}</div>
      ${post.attachments.length ? `<div class="attachment-list" style="margin-top:14px">${post.attachments.map(attachment).join('')}</div>` : ''}
      <div class="post-footer">
        <span class="small muted">${post.commentCount} 条回应</span>
        <button class="btn btn-ghost btn-small" type="button" data-action="focus-comment" data-id="${post.id}">${icon('message-square-check', 'icon-sm')} 回应</button>
      </div>
      <div class="comments">
        ${post.comments.map((comment) => `
          <div class="comment">
            ${avatar(comment.userName, 'avatar-sm')}
            <div class="comment-copy">
              <strong>${escapeHtml(comment.userName)} · ${relativeTime(comment.createdAt)}</strong>
              ${escapeHtml(comment.content)}
            </div>
          </div>
        `).join('')}
        <form class="comment-form" data-form="community-comment" data-post-id="${post.id}">
          <input class="input" name="content" required minlength="2" maxlength="2000" placeholder="写下你的回应" id="comment-input-${post.id}" />
          <button class="btn btn-secondary btn-small" type="submit">${icon('send', 'icon-sm')} 发送</button>
        </form>
      </div>
    </article>
  `;
}

export async function renderProfile(user) {
  const [favorites, feedback, questions, posts, activities] = await Promise.all([
    api('/api/knowledge?favorites=1'),
    api('/api/feedback?scope=mine'),
    api('/api/questions?scope=mine'),
    api('/api/community?scope=mine'),
    api('/api/activities'),
  ]);
  const pendingFeedback = activities.items.filter((item) => item.status === 'completed' && !item.hasFeedback);
  return `
    <section class="profile-header">
      ${avatar(user.displayName)}
      <div>
        <h1>${escapeHtml(user.displayName)}</h1>
        <p>${escapeHtml(user.phone || '未绑定手机号')} · ${user.roles.map((role) => escapeHtml(role.name)).join(' / ')}</p>
        <p style="margin-top:5px">${escapeHtml(user.bio || '还没有填写个人简介')}</p>
      </div>
      <div class="profile-stats">
        <div class="profile-stat"><strong>${favorites.items.length}</strong><span>收藏</span></div>
        <div class="profile-stat"><strong>${feedback.items.length}</strong><span>活动反馈</span></div>
        <div class="profile-stat"><strong>${questions.items.length}</strong><span>我的提问</span></div>
      </div>
      <button class="btn btn-secondary" type="button" data-action="edit-profile">${icon('pencil')} 编辑资料</button>
    </section>

    ${pendingFeedback.length ? `
      <section class="side-panel" style="margin-top:18px">
        <div class="section-heading"><h2>待完成反馈</h2><span class="status status-pending">${pendingFeedback.length} 项</span></div>
        <div class="activity-list">
          ${pendingFeedback.map((item) => `
            <div class="activity-row">
              <div class="activity-date"><strong>${new Date(item.startsAt).getDate()}</strong><span>${new Date(item.startsAt).getMonth() + 1}月</span></div>
              <div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.location)} · ${formatDate(item.startsAt)}</p></div>
              <a class="btn btn-primary" href="#/feedback/new/${item.id}">填写反馈</a>
            </div>
          `).join('')}
        </div>
      </section>
    ` : ''}

    <div class="tabs" style="margin-top:22px">
      <button class="tab active" type="button" data-action="profile-tab" data-target="profile-feedback">活动反馈</button>
      <button class="tab" type="button" data-action="profile-tab" data-target="profile-favorites">我的收藏</button>
      <button class="tab" type="button" data-action="profile-tab" data-target="profile-questions">我的提问</button>
      <button class="tab" type="button" data-action="profile-tab" data-target="profile-posts">我的发布</button>
      <button class="tab" type="button" data-action="profile-tab" data-target="profile-info">个人信息</button>
    </div>

    <section id="profile-feedback" class="profile-panel">
      <div class="section-heading"><h2>活动反馈</h2><span class="small muted">共 ${feedback.items.length} 条</span></div>
      <div class="activity-list">
        ${feedback.items.map((item) => `
          <a class="activity-row" href="#/feedback/${item.id}">
            <span class="stat-icon">${icon('clipboard-check')}</span>
            <div>
              <div class="meta-row">${statusBadge(item.status)} <span class="tag">${item.visibility === 'public' ? '已公开' : '仅自己可见'}</span></div>
              <h3>${escapeHtml(item.activityTitle)}</h3>
              <p>${escapeHtml(item.observations).slice(0, 100)}</p>
            </div>
            <span class="small muted">${formatDate(item.submittedAt)}</span>
          </a>
        `).join('') || emptyState('还没有活动反馈', '参与活动结束后可以提交结构化反馈')}
      </div>
    </section>

    <section id="profile-favorites" class="profile-panel hidden">
      <div class="section-heading"><h2>我的收藏</h2><span class="small muted">共 ${favorites.items.length} 条</span></div>
      <div class="knowledge-grid">${favorites.items.map(knowledgeCard).join('') || emptyState('还没有收藏知识', '在知识详情页点击收藏后会出现在这里', 'heart')}</div>
    </section>

    <section id="profile-questions" class="profile-panel hidden">
      <div class="section-heading"><h2>我的提问</h2><button class="btn btn-secondary btn-small" type="button" data-action="ask-question">${icon('plus', 'icon-sm')} 新提问</button></div>
      <div class="activity-list">
        ${questions.items.map((item) => `
          <button class="activity-row" type="button" data-action="view-question" data-id="${item.id}" style="text-align:left">
            <span class="stat-icon">${icon('message-circle-question')}</span>
            <div><div class="meta-row">${statusBadge(item.status)} <span class="tag">${escapeHtml(item.category)}</span></div><h3>${escapeHtml(item.title)}</h3><p>${escapeHtml(item.answer || item.content).slice(0, 100)}</p></div>
            <span class="small muted">${formatDate(item.createdAt)}</span>
          </button>
        `).join('') || emptyState('还没有提问', '遇到具体问题时可以提交给管理员', 'message-circle-question')}
      </div>
    </section>

    <section id="profile-posts" class="profile-panel hidden">
      <div class="section-heading"><h2>我的发布</h2><button class="btn btn-secondary btn-small" type="button" data-action="new-community-post">${icon('plus', 'icon-sm')} 新分享</button></div>
      <div class="community-feed">
        ${posts.items.map((post) => `
          <article class="post-card">
            <div class="post-head"><div class="post-author"><div><strong>${escapeHtml(post.title)}</strong><span>${escapeHtml(post.category)} · ${relativeTime(post.createdAt)}</span></div></div>${statusBadge(post.status)}</div>
            <div class="post-body">${escapeHtml(post.content)}</div>
            ${post.reviewNote ? `<div class="notice" style="margin-top:12px">${escapeHtml(post.reviewNote)}</div>` : ''}
          </article>
        `).join('') || emptyState('还没有发布内容', '分享你的服务经验或改进建议', 'message-square-check')}
      </div>
    </section>

    <section id="profile-info" class="profile-panel hidden">
      <div class="section-heading"><h2>个人信息</h2><button class="btn btn-secondary btn-small" type="button" data-action="edit-profile">${icon('pencil', 'icon-sm')} 编辑</button></div>
      <div class="settings-grid">
        <div class="settings-item"><span class="stat-icon">${icon('user-round')}</span><div><strong>姓名或昵称</strong><span>${escapeHtml(user.displayName)}</span></div></div>
        <div class="settings-item"><span class="stat-icon">${icon('shield')}</span><div><strong>登录手机号</strong><span>${escapeHtml(user.phone || '未绑定手机号')}</span></div></div>
        <div class="settings-item"><span class="stat-icon">${icon('badge-check')}</span><div><strong>手机验证</strong><span>${user.phoneVerifiedAt ? '已完成验证' : '待验证'}</span></div></div>
      </div>
    </section>
  `;
}

export async function renderMyFeedbackList() {
  const data = await api('/api/feedback?scope=mine');
  return `
    <div class="page-heading">
      <div>
        <span class="eyebrow">${icon('clipboard-check', 'icon-sm')} 复盘记录</span>
        <h1 class="page-title">我的活动反馈</h1>
        <p class="page-subtitle">查看审核状态、管理员回复和公开范围。</p>
      </div>
      <a class="btn btn-secondary" href="#/activities">查找活动</a>
    </div>
    <div class="activity-list">
      ${data.items.map((item) => `
        <a class="activity-row" href="#/feedback/${item.id}">
          <span class="stat-icon">${icon('clipboard-check')}</span>
          <div>
            <div class="meta-row">${statusBadge(item.status)} <span class="tag">${item.visibility === 'public' ? '已公开' : '仅自己可见'}</span></div>
            <h3>${escapeHtml(item.activityTitle)}</h3>
            <p>${escapeHtml(item.observations).slice(0, 120)}</p>
          </div>
          <span class="small muted">${formatDate(item.submittedAt)}</span>
        </a>
      `).join('') || emptyState('还没有活动反馈', '参与活动结束后可以提交反馈', 'clipboard-check')}
    </div>
  `;
}
