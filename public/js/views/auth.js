import { escapeHtml, icon } from '../core.js';

export function renderAuth({
  portal = 'volunteer',
  mode = 'login',
  setup = false,
  setupStatus = null,
} = {}) {
  const isAdminPortal = portal === 'admin';
  const isRegister = mode === 'register';
  const heading = setup
    ? '初始化平台管理员'
    : isRegister
      ? '创建志愿者账号'
      : isAdminPortal
        ? '管理者登录'
        : '志愿者登录';
  const subtitle = setup
    ? '使用部署阶段配置的管理员手机号完成短信验证'
    : isAdminPortal
      ? '使用已授权的手机号进入管理工作台'
      : isRegister
        ? '只需手机号、短信验证码和昵称，注册后自动获得普通志愿者身份'
        : '使用手机号和短信验证码登录，无需记住密码';

  return `
    <main class="auth-page">
      <header class="auth-header">
        <a class="brand" href="#/login/volunteer" aria-label="返回登录页">
          <img class="brand-mark" src="/assets/mark.svg" alt="" />
          <span class="brand-copy">
            <span class="brand-title">心青年志愿服务</span>
            <span class="brand-caption">知识管理平台</span>
          </span>
        </a>
        <span class="auth-header-note">知识学习 · 实践反馈 · 经验沉淀</span>
      </header>

      <section class="auth-layout">
        <div class="auth-visual">
          <div>
            <span class="eyebrow" style="color:#d6e9dc">${icon('heart', 'icon-sm')} 尊重每一种节奏</span>
            <h1>让每一次陪伴，<br />都成为可以积累的知识。</h1>
            <p>把学习、实践中的观察和疑问连接起来，让志愿者更容易获得支持，也让组织的经验持续被看见、被整理、被更新。</p>
            <div class="auth-values">
              <span>${icon('user-round', 'icon-sm')} 平等参与</span>
              <span>${icon('lock-keyhole', 'icon-sm')} 隐私保护</span>
              <span>${icon('book-open', 'icon-sm')} 持续学习</span>
            </div>
          </div>
          <img class="auth-illustration" src="/assets/connection.svg" alt="志愿者与心青年在社区活动中共同参与" />
        </div>

        <div class="auth-panel">
          <div class="auth-panel-inner">
            <span class="eyebrow">${setup ? icon('shield', 'icon-sm') + ' 安全初始化' : isAdminPortal ? icon('shield', 'icon-sm') + ' 管理入口' : icon('users', 'icon-sm') + ' 志愿者入口'}</span>
            <h2>${heading}</h2>
            <p class="auth-subtitle">${subtitle}</p>

            ${
              setup
                ? setupPanel(setupStatus)
                : `
                  <div class="auth-tabs" role="tablist" aria-label="选择使用入口">
                    <a class="auth-tab ${!isAdminPortal ? 'active' : ''}" href="${isRegister ? '#/register' : '#/login/volunteer'}">志愿者端</a>
                    <a class="auth-tab ${isAdminPortal ? 'active' : ''}" href="#/login/admin">管理者后台</a>
                  </div>
                  ${isRegister ? registerForm() : loginForm(isAdminPortal)}
                  <div class="auth-footer">
                    ${
                      isRegister
                        ? `已有账号？<a class="text-success" href="#/login/volunteer">返回登录</a>`
                        : !isAdminPortal
                          ? `还没有账号？<a class="text-success" href="#/register">立即注册</a>`
                          : `管理者账号必须先在后台获得管理角色 · <a class="text-success" href="#/setup">首次部署初始化</a>`
                    }
                  </div>
                `
            }
          </div>
        </div>
      </section>
    </main>
  `;
}

function loginForm(isAdminPortal) {
  return `
    <form data-form="login" data-portal="${isAdminPortal ? 'admin' : 'volunteer'}">
      ${formError()}
      <div class="field">
        <label for="login-phone">手机号</label>
        <input
          class="input"
          id="login-phone"
          name="phone"
          type="tel"
          inputmode="numeric"
          autocomplete="tel"
          required
          maxlength="11"
          pattern="1[3-9][0-9]{9}"
          placeholder="请输入 11 位手机号"
        />
      </div>
      <div class="field">
        <label for="login-code">短信验证码</label>
        <div class="code-input-row">
          <input
            class="input"
            id="login-code"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
            maxlength="6"
            pattern="[0-9]{6}"
            placeholder="6 位验证码"
          />
          <button
            class="btn btn-secondary sms-button"
            type="button"
            data-action="send-sms-code"
            data-purpose="login"
            data-portal="${isAdminPortal ? 'admin' : 'volunteer'}"
          >获取验证码</button>
        </div>
        <span class="field-hint" data-sms-hint>验证码发送后 5 分钟内有效</span>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${icon('arrow-right')} 登录${isAdminPortal ? '后台' : ''}</button>
    </form>
  `;
}

function registerForm() {
  return `
    <form data-form="register">
      ${formError()}
      <div class="field">
        <label for="register-phone">手机号</label>
        <input
          class="input"
          id="register-phone"
          name="phone"
          type="tel"
          inputmode="numeric"
          autocomplete="tel"
          required
          maxlength="11"
          pattern="1[3-9][0-9]{9}"
          placeholder="手机号将作为唯一登录账号"
        />
      </div>
      <div class="field">
        <label for="register-code">短信验证码</label>
        <div class="code-input-row">
          <input
            class="input"
            id="register-code"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
            maxlength="6"
            pattern="[0-9]{6}"
            placeholder="6 位验证码"
          />
          <button
            class="btn btn-secondary sms-button"
            type="button"
            data-action="send-sms-code"
            data-purpose="register"
          >获取验证码</button>
        </div>
        <span class="field-hint" data-sms-hint>验证码发送后 5 分钟内有效</span>
      </div>
      <div class="field">
        <label for="register-nickname">昵称</label>
        <input
          class="input"
          id="register-nickname"
          name="nickname"
          autocomplete="nickname"
          required
          minlength="2"
          maxlength="20"
          placeholder="用于平台内展示，2-20 个字符"
        />
        <span class="field-hint">无需填写真实姓名、邮箱或其他个人信息。</span>
      </div>
      <button class="btn btn-primary btn-block" type="submit">${icon('user-round')} 注册并进入平台</button>
    </form>
  `;
}

function setupPanel(status) {
  if (!status) {
    return `<div class="notice notice-danger">${icon('alert-circle')}<span>无法读取初始化状态，请稍后刷新页面。</span></div>`;
  }
  if (status.completed) {
    return `
      <div class="notice notice-blue">
        ${icon('badge-check')}
        <span>系统初始化已经完成，请使用管理员手机号登录。</span>
      </div>
      <a class="btn btn-primary btn-block" style="margin-top:16px" href="#/login/admin">前往管理者登录</a>
    `;
  }
  if (!status.configured) {
    return `
      <div class="notice notice-danger">
        ${icon('alert-circle')}
        <span>尚未配置初始管理员手机号和一次性初始化令牌。请在部署环境变量中完成配置后重启服务。</span>
      </div>
      <div class="setup-env-list">
        <code>INITIAL_ADMIN_PHONE</code>
        <code>INITIAL_SETUP_TOKEN</code>
      </div>
    `;
  }
  return `
    <div class="notice notice-blue" style="margin-bottom:18px">
      ${icon('shield')}
      <span>本次初始化使用部署配置的手机号 <strong>${escapeHtml(status.maskedPhone)}</strong>，普通用户无法创建或申请管理员角色。</span>
    </div>
    ${
      !status.smsConfigured
        ? `<div class="notice notice-danger" style="margin-bottom:16px">${icon('alert-circle')}<span>短信服务尚未配置，初始化无法发送验证码。请先配置短信服务商环境变量。</span></div>`
        : ''
    }
    <form data-form="setup-admin">
      ${formError()}
      <div class="field">
        <label for="setup-token">一次性初始化令牌</label>
        <input class="input" id="setup-token" name="setupToken" type="password" required minlength="8" autocomplete="off" placeholder="请输入部署配置的初始化令牌，至少 8 位" />
      </div>
      <div class="field">
        <label for="setup-code">管理员手机短信验证码</label>
        <div class="code-input-row">
          <input
            class="input"
            id="setup-code"
            name="code"
            inputmode="numeric"
            autocomplete="one-time-code"
            required
            maxlength="6"
            pattern="[0-9]{6}"
            placeholder="6 位验证码"
          />
          <button
            class="btn btn-secondary sms-button"
            type="button"
            data-action="send-sms-code"
            data-purpose="setup"
          >获取验证码</button>
        </div>
        <span class="field-hint" data-sms-hint>验证码只会发送到部署配置的管理员手机号</span>
      </div>
      <div class="field">
        <label>管理员昵称</label>
        <input class="input" value="平台管理员" disabled />
      </div>
      <button class="btn btn-primary btn-block" type="submit">${icon('shield')} 完成初始化并登录</button>
    </form>
    <div class="auth-footer">
      已完成初始化？<a class="text-success" href="#/login/admin">返回管理者登录</a>
    </div>
  `;
}

function formError() {
  return `<div class="auth-inline-error hidden" data-form-error></div>`;
}
