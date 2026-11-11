# 云端部署

本项目已包含 Docker 镜像配置，可部署到支持持久化磁盘和单一实例的 Node 容器平台。当前推荐 Render 的付费 Web Service，因为免费实例不提供持久化磁盘，重新部署后 SQLite 数据和上传文件会丢失。

## 部署前提

- 一个 Git 仓库，建议将本项目推送到 GitHub 私有仓库
- 一个 Render 账号
- 一个至少 1GB 的持久化磁盘
- 阿里云短信服务账号、已审核的签名和验证码模板
- 初始管理员手机号
- 至少 8 位的一次性初始化令牌

## Render 部署

1. 将项目推送到 GitHub。
2. 在 Render 控制台选择 New > Blueprint。
3. 连接该 GitHub 仓库，Render 会自动读取根目录的 `render.yaml`。
4. 确认使用 `starter` 实例和 1GB 持久化磁盘。
5. 填写 `INITIAL_ADMIN_PHONE` 和阿里云短信服务凭据。
6. 保存 Render 自动生成的 `INITIAL_SETUP_TOKEN`，它只在首次初始化时使用。
7. 完成部署后访问 Render 提供的 `https://*.onrender.com/#/setup`。

`render.yaml` 已配置：

- Docker 容器启动
- `HOST=0.0.0.0`
- HTTPS 安全 Cookie
- `/var/data` 持久化磁盘
- SQLite 数据库和上传目录
- 健康检查 `/api/health`
- 单实例部署

## 生产环境行为

生产模式首次启动时：

- 创建被禁用的管理员占位账号，但不会启用公开管理员账号
- 只有配置的管理员手机号和一次性初始化令牌都正确，并完成短信验证后，才激活“平台管理员”
- 普通注册用户不能创建管理员账号，也不能自行选择管理角色
- 演示管理员、活动管理员和演示志愿者账号会被禁用
- 演示知识、活动和公开内容仍作为初始内容保留，可由管理员修改或删除
- 新注册用户自动获得普通志愿者角色
- 注册与登录均使用手机号短信验证码，不设置公开默认密码

如果数据库已完成初始化，修改 `INITIAL_SETUP_TOKEN` 不会重新开放初始化入口。需要重新初始化时必须使用新的空数据库。

## 短信服务

当前实现阿里云短信 `SendSms` API。模板变量默认名称为 `code`，模板内容需要包含 6 位验证码。

| 变量 | 说明 |
| --- | --- |
| `SMS_PROVIDER` | 生产固定为 `aliyun` |
| `SMS_ALIYUN_ACCESS_KEY_ID` | 阿里云 AccessKey ID |
| `SMS_ALIYUN_ACCESS_KEY_SECRET` | 阿里云 AccessKey Secret |
| `SMS_ALIYUN_SIGN_NAME` | 已审核短信签名 |
| `SMS_ALIYUN_TEMPLATE_CODE` | 验证码模板编号，例如 `SMS_...` |
| `SMS_ALIYUN_REGION_ID` | 默认 `cn-hangzhou` |
| `SMS_ALIYUN_TEMPLATE_PARAM_NAME` | 默认 `code` |
| `SMS_CODE_SECRET` | 验证码摘要密钥，Render 可自动生成 |

如果短信密钥未配置，验证码接口会明确返回 `sms_not_configured`，不会伪造发送成功。

## 必须保持的约束

- 保持单实例。当前 SQLite 和本地附件目录不支持多个实例同时写入。
- 不要删除或更换持久化磁盘挂载路径。
- 定期备份 `/var/data/xinqingnian.db` 和 `/var/data/uploads`。
- 正式对外前修改或删除全部演示账号，并核查演示内容。
- 数据量增长或需要多实例时，迁移到 PostgreSQL 与对象存储。

## 环境变量

| 变量 | 生产值 |
| --- | --- |
| `NODE_ENV` | `production` |
| `HOST` | `0.0.0.0` |
| `PORT` | 平台自动提供，默认 `10000` |
| `DB_PATH` | `/var/data/xinqingnian.db` |
| `UPLOAD_DIR` | `/var/data/uploads` |
| `COOKIE_SECURE` | `1` |
| `INITIAL_ADMIN_PHONE` | 部署人指定的管理员手机号 |
| `INITIAL_SETUP_TOKEN` | 至少 8 位随机值，首次初始化后停用 |
| `SMS_CODE_SECRET` | 至少 32 位随机值 |
| `SMS_PROVIDER` | `aliyun` |

## 验证

部署完成后检查：

```text
https://你的域名/api/health
```

应返回 `ok: true` 和 `database: connected`。随后分别验证志愿者注册、管理员登录、知识访问、文件上传和活动反馈提交。
