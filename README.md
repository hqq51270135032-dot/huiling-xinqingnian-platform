# 心青年志愿服务知识管理平台

面向心智障碍者志愿服务组织的知识学习、答疑、活动反馈与经验沉淀平台。

## 技术方案

- 前端：原生 ES Modules、HTML、CSS，响应式单页应用
- 后端：Node.js 原生 HTTP 服务
- 数据库：Node.js 内置 `node:sqlite`
- 存储：SQLite 持久化业务数据，本地受控目录存储上传文件
- 鉴权：手机号 + 短信验证码、HttpOnly 会话 Cookie、服务端 RBAC 权限校验
- 短信：阿里云短信服务；开发环境使用服务端测试收件文件，不向浏览器暴露验证码

项目不依赖外部 npm 包，Node.js 22.5 及以上版本即可运行。

## 启动

```powershell
cd D:\programming\codex\xinqingnian-platform
node server/index.js
```

打开 <http://localhost:4173>。

首次启动会自动创建 `data/xinqingnian.db` 并写入演示内容。用户账号必须通过手机号短信验证码注册；验证码仅保存 HMAC 摘要，不保存明文。

云端部署方式见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。项目包含 `Dockerfile` 和 Render 蓝图配置，生产容器使用持久化磁盘保存数据库与上传文件。

## 本地开发

开发环境默认使用 `development` 短信通道。验证码会写入 `data/sms-outbox.log`，同时在服务端控制台显示，不会通过 API 返回或在浏览器中展示。

首次本地初始化管理员：

```powershell
$env:INITIAL_ADMIN_PHONE="你的管理员手机号"
$env:INITIAL_SETUP_TOKEN="至少8位的随机字符串"
$env:SMS_PROVIDER="development"
node server/index.js
```

打开 <http://localhost:4173/#/setup>，输入初始化令牌并完成短信验证。初始化完成后，管理员使用同一手机号和短信验证码登录 `#/login/admin`。

生产环境禁止使用开发短信通道，必须配置阿里云短信服务。完整配置见 [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md)。

## 已实现范围

- 手机号短信验证码注册、志愿者端/管理端登录、会话退出、个人信息维护
- 初始超级管理员安全初始化、手机号唯一约束、发送频率和验证码错误次数限制
- 志愿者端首页、知识库、问题答疑、活动、社群、个人中心
- 公开知识、内部资料、受限个性授权与服务端访问校验
- 知识创建、编辑、审核、发布、搜索、收藏、阅读记录和附件
- 活动发布、报名、活动反馈提交、审核、公开控制、回复与转化知识
- 问题提问、管理员回复、状态流转、FAQ 归档与转化知识
- 社群经验发布、评论、管理员审核
- 用户启用/禁用、角色分配、自定义角色、功能权限与内容权限配置
- 数据概览、操作日志、基础全局搜索
- 图片、视频、PDF 与常见 Office 文档上传（单文件上限 50MB）

AI 问答、智能分类和个性化推荐属于 P2，本版本没有伪装实现。详细边界见 [docs/PRODUCT.md](docs/PRODUCT.md)。

## 测试

```powershell
node --test test/*.test.js
```
