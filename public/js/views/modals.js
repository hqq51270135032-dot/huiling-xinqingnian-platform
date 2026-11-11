import {
  escapeHtml,
  formatDateTime,
  icon,
  statusBadge,
  toLocalInputValue,
  visibilityBadge,
} from '../core.js';

const KNOWLEDGE_CATEGORIES = [
  '基础认知',
  '沟通技巧',
  '服务规范',
  '常见问题',
  '服务案例',
  '实践经验',
  '内部培训',
  '受限案例',
];

const QUESTION_CATEGORIES = [
  '心智障碍基础认知',
  '沟通与互动',
  '行为理解',
  '情绪支持',
  '活动参与',
  '服务规范',
  '志愿者自身困惑',
  '其他问题',
];

function modalHeader(title, description = '') {
  return `
    <div class="modal-header">
      <h2>${escapeHtml(title)}</h2>
      ${description ? `<p>${escapeHtml(description)}</p>` : ''}
    </div>
  `;
}

export function questionFormModal() {
  return `
    ${modalHeader('提交问题', '描述具体场景和希望获得的支持，避免填写可识别服务对象身份的信息。')}
    <form data-form="create-question">
      <div class="field">
        <label for="question-title">问题标题</label>
        <input class="input" id="question-title" name="title" required minlength="4" maxlength="120" placeholder="用一句话说明你的问题" />
      </div>
      <div class="field">
        <label for="question-category">问题分类</label>
        <select class="select" id="question-category" name="category" required>
          ${QUESTION_CATEGORIES.map((category) => `<option value="${category}">${category}</option>`).join('')}
        </select>
      </div>
      <div class="field">
        <label for="question-content">问题描述</label>
        <textarea class="textarea" id="question-content" name="content" required minlength="10" maxlength="8000" placeholder="发生了什么？你尝试过什么？目前最大的困惑是什么？"></textarea>
      </div>
      <div class="field">
        <label for="question-files">补充图片或文档 <span class="muted">（选填）</span></label>
        <input class="input" id="question-files" name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.doc,.docx,.txt" />
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${icon('send')} 提交问题</button>
      </div>
    </form>
  `;
}

export function questionDetailModal(item) {
  return `
    ${modalHeader(item.title, `${item.category} · ${item.userName} 提问`)}
    <div class="meta-row" style="margin-bottom:16px">${statusBadge(item.status)} ${item.isFaq ? '<span class="pill pill-public">常见问题</span>' : ''}</div>
    <div class="notice" style="margin-bottom:14px">${icon('message-circle-question')}<span>${escapeHtml(item.content)}</span></div>
    ${
      item.answer
        ? `<section class="form-section"><h3 class="form-section-title">${icon('badge-check')} 管理员回复</h3><p style="white-space:pre-wrap;margin:0">${escapeHtml(item.answer)}</p><div class="meta-row small muted" style="margin-top:12px"><span>${escapeHtml(item.answererName)}</span><span>${formatDateTime(item.answeredAt)}</span></div></section>`
        : `<div class="notice notice-blue">${icon('clock')}<span>问题正在处理中，管理员回复后会显示在这里。</span></div>`
    }
    ${item.attachments?.length ? `<div class="attachment-list" style="margin-top:14px">${item.attachments.map((file) => `<a class="attachment" href="${file.url}" target="_blank" rel="noopener">${icon('file-text', 'icon-sm')}<span class="attachment-name">${escapeHtml(file.originalName)}</span></a>`).join('')}</div>` : ''}
  `;
}

export function communityFormModal(activities) {
  return `
    ${modalHeader('发布经验分享', '内容会先进入审核，通过后对其他志愿者公开。请完成匿名化并确认事实准确。')}
    <form data-form="create-community-post">
      <div class="field-row">
        <div class="field">
          <label for="post-category">分类</label>
          <select class="select" id="post-category" name="category">
            <option>经验分享</option>
            <option>活动心得</option>
            <option>改进建议</option>
            <option>问题讨论</option>
          </select>
        </div>
        <div class="field">
          <label for="post-activity">关联活动 <span class="muted">（选填）</span></label>
          <select class="select" id="post-activity" name="activityId">
            <option value="">不关联活动</option>
            ${activities.map((activity) => `<option value="${activity.id}">${escapeHtml(activity.title)}</option>`).join('')}
          </select>
        </div>
      </div>
      <div class="field">
        <label for="post-title">标题</label>
        <input class="input" id="post-title" name="title" required minlength="4" maxlength="120" placeholder="概括你想分享的经验" />
      </div>
      <div class="field">
        <label for="post-content">正文</label>
        <textarea class="textarea" id="post-content" name="content" required minlength="10" maxlength="20000" style="min-height:180px" placeholder="写下具体情境、你的做法、结果和仍待确认的问题"></textarea>
      </div>
      <div class="field">
        <label for="post-files">图片或文档 <span class="muted">（选填）</span></label>
        <input class="input" id="post-files" name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.doc,.docx,.txt" />
      </div>
      <div class="notice notice-blue" style="margin-bottom:16px">${icon('lock-keyhole')}<span>请勿发布服务对象姓名、联系方式和未经同意的照片。</span></div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${icon('send')} 提交审核</button>
      </div>
    </form>
  `;
}

export function profileFormModal(user) {
  return `
    ${modalHeader('编辑个人信息')}
    <form data-form="update-profile">
      <div class="field">
        <label for="profile-name">昵称</label>
        <input class="input" id="profile-name" name="displayName" required minlength="2" maxlength="20" value="${escapeHtml(user.displayName)}" />
      </div>
      <div class="field">
        <label for="profile-phone">登录手机号</label>
        <input class="input" id="profile-phone" value="${escapeHtml(user.phone)}" disabled />
        <span class="field-hint">手机号是唯一登录账号，暂不支持在个人中心修改。</span>
      </div>
      <div class="field">
        <label for="profile-bio">个人简介</label>
        <textarea class="textarea" id="profile-bio" name="bio" maxlength="500" placeholder="简单介绍你的志愿服务兴趣或经验">${escapeHtml(user.bio)}</textarea>
      </div>
      <div class="notice">${icon('shield')}<span>联系方式仅用于组织内部沟通，不会在公开社群展示。</span></div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">保存资料</button>
      </div>
    </form>
  `;
}

export function knowledgeFormModal(item = null) {
  const editing = Boolean(item);
  return `
    ${modalHeader(editing ? '编辑知识内容' : '新建知识内容', '公开知识对普通志愿者可见；内部资料和受限案例还会校验账号授权。')}
    <form data-form="save-knowledge" data-id="${item?.id || ''}">
      <div class="field">
        <label for="knowledge-title">标题</label>
        <input class="input" id="knowledge-title" name="title" required minlength="2" maxlength="120" value="${escapeHtml(item?.title || '')}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="knowledge-category">分类</label>
          <select class="select" id="knowledge-category" name="category">
            ${KNOWLEDGE_CATEGORIES.map((category) => `<option ${item?.category === category ? 'selected' : ''}>${category}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="knowledge-visibility">可见范围</label>
          <select class="select" id="knowledge-visibility" name="visibility">
            <option value="public" ${item?.visibility === 'public' ? 'selected' : ''}>公开分享</option>
            <option value="internal" ${item?.visibility === 'internal' ? 'selected' : ''}>内部资料</option>
            <option value="restricted" ${item?.visibility === 'restricted' ? 'selected' : ''}>受限案例</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="knowledge-summary">摘要</label>
        <textarea class="textarea" id="knowledge-summary" name="summary" maxlength="300" style="min-height:76px" placeholder="用一两句话概括学习重点">${escapeHtml(item?.summary || '')}</textarea>
      </div>
      <div class="field">
        <label for="knowledge-content">正文</label>
        <textarea class="textarea" id="knowledge-content" name="content" required minlength="10" maxlength="80000" style="min-height:300px" placeholder="可使用自然段落，不建议填入服务对象可识别信息">${escapeHtml(item?.content || '')}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="knowledge-tags">标签</label>
          <input class="input" id="knowledge-tags" name="tags" value="${escapeHtml(item?.tags?.join(',') || '')}" placeholder="使用逗号分隔" />
        </div>
        <div class="field">
          <label for="knowledge-status">状态</label>
          <select class="select" id="knowledge-status" name="status">
            <option value="draft" ${item?.status === 'draft' ? 'selected' : ''}>保存草稿</option>
            <option value="pending" ${item?.status === 'pending' ? 'selected' : ''}>提交审核</option>
            <option value="published" ${item?.status === 'published' ? 'selected' : ''}>发布</option>
            <option value="archived" ${item?.status === 'archived' ? 'selected' : ''}>归档</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="knowledge-files">附件 <span class="muted">（选填，图片 / PDF / Office）</span></label>
        <input class="input" id="knowledge-files" name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" />
      </div>
      ${item?.attachments?.length ? `<div class="attachment-list" style="margin-bottom:16px">${item.attachments.map((file) => `<a class="attachment" href="${file.url}" target="_blank" rel="noopener">${icon('paperclip', 'icon-sm')}<span class="attachment-name">${escapeHtml(file.originalName)}</span></a>`).join('')}</div>` : ''}
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${icon('check')} ${editing ? '保存修改' : '创建内容'}</button>
      </div>
    </form>
  `;
}

export function knowledgeReviewModal(item) {
  return `
    ${modalHeader('审核知识内容', item.title)}
    <div class="meta-row" style="margin-bottom:16px">${visibilityBadge(item.visibility)} ${statusBadge(item.status)}</div>
    <div class="notice" style="margin-bottom:16px">${icon('eye')}<span>${escapeHtml(item.summary || item.content.slice(0, 180))}</span></div>
    <form data-form="review-knowledge" data-id="${item.id}">
      <div class="field">
        <label for="knowledge-review-note">审核说明</label>
        <textarea class="textarea" id="knowledge-review-note" name="note" maxlength="1000" placeholder="记录匿名化、事实核验或后续修改建议"></textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-secondary" type="submit" name="decision" value="draft">退回草稿</button>
        <button class="btn btn-primary" type="submit" name="decision" value="published">${icon('badge-check')} 审核发布</button>
      </div>
    </form>
  `;
}

export function knowledgeAclModal(item, users) {
  return `
    ${modalHeader('受限案例个案授权', item.title)}
    <div class="notice notice-danger" style="margin-bottom:16px">${icon('shield')}<span>只有同时具备“查看受限案例”权限且在此名单中的用户才能访问。</span></div>
    <form data-form="save-knowledge-acl" data-id="${item.id}">
      <div class="checkbox-grid">
        ${users.map((user) => `
          <label class="check-item">
            <input type="checkbox" name="userIds" value="${user.id}" ${item.aclUserIds?.includes(user.id) ? 'checked' : ''} />
            <span><strong>${escapeHtml(user.displayName)}</strong><br><span class="muted">${escapeHtml(user.phone || '未绑定手机号')}</span></span>
          </label>
        `).join('')}
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">保存授权</button>
      </div>
    </form>
  `;
}

export function activityFormModal(item = null) {
  return `
    ${modalHeader(item ? '编辑活动' : '创建活动', '草稿不会对志愿者展示。发布后志愿者可查看和报名。')}
    <form data-form="save-activity" data-id="${item?.id || ''}">
      <div class="field">
        <label for="activity-title">活动名称</label>
        <input class="input" id="activity-title" name="title" required minlength="2" maxlength="100" value="${escapeHtml(item?.title || '')}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="activity-start">开始时间</label>
          <input class="input" id="activity-start" name="startsAt" type="datetime-local" required value="${toLocalInputValue(item?.startsAt)}" />
        </div>
        <div class="field">
          <label for="activity-end">结束时间</label>
          <input class="input" id="activity-end" name="endsAt" type="datetime-local" required value="${toLocalInputValue(item?.endsAt)}" />
        </div>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="activity-location">活动地点</label>
          <input class="input" id="activity-location" name="location" required minlength="2" maxlength="120" value="${escapeHtml(item?.location || '')}" />
        </div>
        <div class="field">
          <label for="activity-status">活动状态</label>
          <select class="select" id="activity-status" name="status">
            <option value="draft" ${item?.status === 'draft' ? 'selected' : ''}>草稿</option>
            <option value="published" ${item?.status === 'published' ? 'selected' : ''}>发布</option>
            <option value="completed" ${item?.status === 'completed' ? 'selected' : ''}>已结束</option>
            <option value="cancelled" ${item?.status === 'cancelled' ? 'selected' : ''}>已取消</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="activity-introduction">活动介绍</label>
        <textarea class="textarea" id="activity-introduction" name="introduction" required minlength="5" maxlength="3000" style="min-height:90px">${escapeHtml(item?.introduction || '')}</textarea>
      </div>
      <div class="field">
        <label for="activity-content">活动内容</label>
        <textarea class="textarea" id="activity-content" name="content" required minlength="5" maxlength="10000">${escapeHtml(item?.content || '')}</textarea>
      </div>
      <div class="field-row">
        <div class="field">
          <label for="activity-requirements">参与要求</label>
          <textarea class="textarea" id="activity-requirements" name="requirements" maxlength="3000" style="min-height:90px">${escapeHtml(item?.requirements || '')}</textarea>
        </div>
        <div class="field">
          <label for="activity-notes">注意事项</label>
          <textarea class="textarea" id="activity-notes" name="notes" maxlength="3000" style="min-height:90px">${escapeHtml(item?.notes || '')}</textarea>
        </div>
      </div>
      <div class="field">
        <label for="activity-files">活动附件 <span class="muted">（选填）</span></label>
        <input class="input" id="activity-files" name="files" type="file" multiple accept=".jpg,.jpeg,.png,.webp,.gif,.mp4,.webm,.pdf,.doc,.docx,.ppt,.pptx,.xls,.xlsx,.txt" />
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${icon('check')} 保存活动</button>
      </div>
    </form>
  `;
}

export function questionReplyModal(item) {
  return `
    ${modalHeader('回复问题', item.title)}
    <div class="notice" style="margin-bottom:16px">${icon('message-circle-question')}<span>${escapeHtml(item.content)}</span></div>
    <form data-form="reply-question" data-id="${item.id}">
      <div class="field">
        <label for="question-status">问题状态</label>
        <select class="select" id="question-status" name="status">
          <option value="processing" ${item.status === 'processing' ? 'selected' : ''}>处理中</option>
          <option value="replied" ${['replied', 'archived'].includes(item.status) ? 'selected' : ''}>已回复</option>
          <option value="archived" ${item.status === 'archived' ? 'selected' : ''}>已归档</option>
        </select>
      </div>
      <div class="field">
        <label for="question-answer">回复内容</label>
        <textarea class="textarea" id="question-answer" name="answer" maxlength="10000" style="min-height:220px" placeholder="给出清楚、具体、可执行的回复">${escapeHtml(item.answer || '')}</textarea>
      </div>
      <label class="check-item"><input type="checkbox" name="isFaq" value="1" ${item.isFaq ? 'checked' : ''} /><span><strong>设为常见问题</strong><br><span class="muted">仅已回复或已归档问题可设为 FAQ，并对其他志愿者公开。</span></span></label>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${icon('send')} 保存回复</button>
      </div>
    </form>
  `;
}

export function convertModal(type, item) {
  const sourceTitle = type === 'feedback' ? item.activityTitle : item.title;
  return `
    ${modalHeader('转为知识草稿', `来源：${sourceTitle}`)}
    <div class="notice notice-accent" style="margin-bottom:16px">${icon('triangle-alert')}<span>转换后只生成草稿，不会自动发布。请完成匿名化、事实核验和专业审核。</span></div>
    <form data-form="convert-knowledge" data-type="${type}" data-id="${item.id}">
      <div class="field">
        <label for="convert-title">知识标题</label>
        <input class="input" id="convert-title" name="title" required value="${escapeHtml(type === 'feedback' ? `服务复盘：${sourceTitle}` : sourceTitle)}" />
      </div>
      <div class="field-row">
        <div class="field">
          <label for="convert-category">分类</label>
          <select class="select" id="convert-category" name="category">
            ${KNOWLEDGE_CATEGORIES.map((category) => `<option ${category === (type === 'feedback' ? '服务案例' : '常见问题') ? 'selected' : ''}>${category}</option>`).join('')}
          </select>
        </div>
        <div class="field">
          <label for="convert-visibility">可见范围</label>
          <select class="select" id="convert-visibility" name="visibility">
            <option value="public">公开</option>
            <option value="internal">内部</option>
            <option value="restricted">受限</option>
          </select>
        </div>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">${icon('book-open')} 创建知识草稿</button>
      </div>
    </form>
  `;
}

export function feedbackReviewModal(item) {
  const field = (title, value) => value
    ? `<section class="info-block" style="margin-bottom:10px"><h3>${escapeHtml(title)}</h3><p>${escapeHtml(value)}</p></section>`
    : '';
  return `
    ${modalHeader('审核活动反馈', `${item.activityTitle} · ${item.userName}`)}
    <div class="meta-row" style="margin-bottom:14px">${statusBadge(item.status)}<span class="tag">${formatDateTime(item.submittedAt)}</span></div>
    <div style="max-height:310px;overflow:auto;padding-right:4px;margin-bottom:16px">
      ${field('遇到的问题', item.problems)}
      ${field('客观观察', item.observations)}
      ${field('沟通与互动困难', item.communicationDifficulties)}
      ${field('学习收获', item.learnings)}
      ${field('新的认识', item.newUnderstanding)}
      ${field('改进建议', item.suggestions)}
      ${field('其他补充', item.additional)}
    </div>
    <form data-form="review-feedback" data-id="${item.id}">
      <div class="field-row">
        <div class="field">
          <label for="feedback-review-status">审核结论</label>
          <select class="select" id="feedback-review-status" name="status">
            <option value="revision" ${item.status === 'revision' ? 'selected' : ''}>退回修改</option>
            <option value="approved" ${item.status === 'approved' ? 'selected' : ''}>审核通过</option>
            <option value="rejected" ${item.status === 'rejected' ? 'selected' : ''}>未通过</option>
          </select>
        </div>
        <div class="field">
          <label for="feedback-visibility">公开范围</label>
          <select class="select" id="feedback-visibility" name="visibility">
            <option value="private" ${item.visibility === 'private' ? 'selected' : ''}>仅提交者与管理员</option>
            <option value="public" ${item.visibility === 'public' ? 'selected' : ''}>审核通过后公开</option>
          </select>
        </div>
      </div>
      <div class="field">
        <label for="feedback-tags">分类标签</label>
        <input class="input" id="feedback-tags" name="tags" value="${escapeHtml(item.tags.join(','))}" placeholder="例如：沟通,选择权,活动复盘" />
      </div>
      <div class="field">
        <label for="feedback-review-note">审核说明 <span class="muted">（仅管理员和提交者可见）</span></label>
        <textarea class="textarea" id="feedback-review-note" name="reviewNote" maxlength="2000" style="min-height:80px">${escapeHtml(item.reviewNote)}</textarea>
      </div>
      <div class="field">
        <label for="feedback-admin-reply">给志愿者的回复</label>
        <textarea class="textarea" id="feedback-admin-reply" name="adminReply" maxlength="3000" style="min-height:90px">${escapeHtml(item.adminReply)}</textarea>
      </div>
      <label class="check-item"><input type="checkbox" name="featured" value="1" ${item.featured ? 'checked' : ''} /><span><strong>标记为精选经验</strong><br><span class="muted">仅在审核通过后生效。</span></span></label>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">保存审核结果</button>
      </div>
    </form>
  `;
}

export function communityReviewModal(item) {
  return `
    ${modalHeader('审核社群内容', item.title)}
    <div class="notice" style="margin-bottom:14px">${icon('message-square-check')}<span>${escapeHtml(item.content)}</span></div>
    <form data-form="review-community" data-id="${item.id}">
      <div class="field">
        <label for="community-review-status">审核结论</label>
        <select class="select" id="community-review-status" name="status">
          <option value="published" ${item.status === 'published' ? 'selected' : ''}>审核通过并公开</option>
          <option value="rejected" ${item.status === 'rejected' ? 'selected' : ''}>未通过</option>
          <option value="hidden" ${item.status === 'hidden' ? 'selected' : ''}>隐藏内容</option>
        </select>
      </div>
      <div class="field">
        <label for="community-review-note">审核说明</label>
        <textarea class="textarea" id="community-review-note" name="reviewNote" maxlength="2000" placeholder="如涉及隐私、事实或表达方式问题，请具体说明">${escapeHtml(item.reviewNote || '')}</textarea>
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">保存审核结果</button>
      </div>
    </form>
  `;
}

export function userRolesModal(user, roles) {
  return `
    ${modalHeader('分配用户角色', `${user.displayName} · ${user.phone || '未绑定手机号'}`)}
    <form data-form="save-user-roles" data-id="${user.id}">
      <div class="checkbox-grid">
        ${roles.map((role) => `
          <label class="check-item">
            <input type="checkbox" name="roleIds" value="${role.id}" ${user.roles.some((item) => item.id === role.id) ? 'checked' : ''} />
            <span><strong>${escapeHtml(role.name)}</strong><br><span class="muted">${escapeHtml(role.description || '')}</span></span>
          </label>
        `).join('')}
      </div>
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">保存角色</button>
      </div>
    </form>
  `;
}

export function userPermissionsModal(user, permissions) {
  const groups = Object.groupBy
    ? Object.groupBy(permissions, (permission) => permission.group)
    : permissions.reduce((result, permission) => {
        (result[permission.group] ||= []).push(permission);
        return result;
      }, {});
  const directCodes = new Set(user.directPermissions.map((permission) => permission.code));
  return `
    ${modalHeader('用户单独授权', `${user.displayName} · ${user.phone || '未绑定手机号'}`)}
    <div class="notice notice-blue" style="margin-bottom:16px">${icon('shield')}<span>单独授权与角色权限取并集。此处仅新增直接权限，不会移除角色自带权限。</span></div>
    <form data-form="save-user-permissions" data-id="${user.id}">
      ${Object.entries(groups).map(([group, items]) => `
        <div class="form-section">
          <h3 class="form-section-title">${escapeHtml(group)}</h3>
          <div class="checkbox-grid">
            ${items.map((permission) => `
              <label class="check-item">
                <input type="checkbox" name="permissionCodes" value="${escapeHtml(permission.code)}" ${directCodes.has(permission.code) ? 'checked' : ''} />
                <span><strong>${escapeHtml(permission.name)}</strong><br><span class="muted">${escapeHtml(permission.code)}</span></span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">保存单独授权</button>
      </div>
    </form>
  `;
}

export function roleFormModal(role, permissions) {
  const selected = new Set(role?.permissions?.map((permission) => permission.code));
  const groups = permissions.reduce((result, permission) => {
    (result[permission.group] ||= []).push(permission);
    return result;
  }, {});
  return `
    ${modalHeader(role ? '配置角色' : '创建角色', '功能权限和内容访问权限均会由服务端强制执行。')}
    <form data-form="save-role" data-id="${role?.id || ''}">
      <div class="field-row">
        <div class="field">
          <label for="role-code">角色标识</label>
          <input class="input" id="role-code" name="code" value="${escapeHtml(role?.code || '')}" ${role ? 'disabled' : ''} required pattern="[a-z][a-z0-9_]{2,31}" placeholder="例如 service_lead" />
        </div>
        <div class="field">
          <label for="role-name">角色名称</label>
          <input class="input" id="role-name" name="name" value="${escapeHtml(role?.name || '')}" required maxlength="30" />
        </div>
      </div>
      <div class="field">
        <label for="role-description">角色说明</label>
        <input class="input" id="role-description" name="description" value="${escapeHtml(role?.description || '')}" maxlength="300" />
      </div>
      <label class="check-item" style="margin-bottom:16px">
        <input type="checkbox" name="adminAccess" value="1" ${role?.adminAccess ? 'checked' : ''} />
        <span><strong>允许进入管理者后台</strong><br><span class="muted">仍需勾选后台功能权限才能使用对应模块。</span></span>
      </label>
      ${Object.entries(groups).map(([group, items]) => `
        <div class="form-section">
          <h3 class="form-section-title">${escapeHtml(group)}</h3>
          <div class="checkbox-grid">
            ${items.map((permission) => `
              <label class="check-item">
                <input type="checkbox" name="permissionCodes" value="${escapeHtml(permission.code)}" ${selected.has(permission.code) ? 'checked' : ''} />
                <span><strong>${escapeHtml(permission.name)}</strong><br><span class="muted">${escapeHtml(permission.code)}</span></span>
              </label>
            `).join('')}
          </div>
        </div>
      `).join('')}
      <div class="form-actions">
        <button class="btn btn-secondary" type="button" data-action="close-modal">取消</button>
        <button class="btn btn-primary" type="submit">保存角色配置</button>
      </div>
    </form>
  `;
}

export function searchResultsModal(data) {
  const section = (title, items, renderItem) => items.length
    ? `<section class="search-modal-section"><h3>${escapeHtml(title)}</h3>${items.map(renderItem).join('')}</section>`
    : '';
  return `
    ${modalHeader(`搜索“${data.query}”`, `共找到 ${data.total} 条可访问结果`)}
    ${data.total === 0 ? `<div class="empty-state">${icon('search', 'icon')}<strong>没有找到匹配内容</strong><div class="small">尝试使用更简短或不同的关键词</div></div>` : ''}
    ${section('知识库', data.knowledge, (item) => `
      <a class="search-result" href="#/knowledge/${item.id}" data-action="close-modal">
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.summary || '')}</small></span>
        ${icon('arrow-right', 'icon-sm')}
      </a>
    `)}
    ${section('问题答疑', data.questions, (item) => `
      <a class="search-result" href="#/questions" data-action="close-modal">
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)}</small></span>
        ${icon('arrow-right', 'icon-sm')}
      </a>
    `)}
    ${section('活动', data.activities, (item) => `
      <a class="search-result" href="#/activities/${item.id}" data-action="close-modal">
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.location)} · ${formatDateTime(item.startsAt)}</small></span>
        ${icon('arrow-right', 'icon-sm')}
      </a>
    `)}
    ${section('社群', data.community, (item) => `
      <a class="search-result" href="#/community" data-action="close-modal">
        <span><strong>${escapeHtml(item.title)}</strong><small>${escapeHtml(item.category)} · ${escapeHtml(item.userName)}</small></span>
        ${icon('arrow-right', 'icon-sm')}
      </a>
    `)}
  `;
}
