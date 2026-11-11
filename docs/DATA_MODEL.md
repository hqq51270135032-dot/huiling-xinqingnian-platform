# 数据模型

## 核心实体关系

```text
users(phone unique) ──< user_roles >── roles ──< role_permissions >── permissions
  │                         │
  ├──< sessions            └──< user_permissions >── permissions
  │
  ├──< knowledge_acl >── knowledge
  ├──< favorites >────── knowledge
  ├──< reading_history > knowledge
  ├──< questions
  ├──< feedback >────── activities
  ├──< community_posts >── activities
  ├──< comments >────── community_posts
  └──< audit_logs

knowledge ──< attachments
activities ──< attachments
feedback ──< attachments
questions ──< attachments
community_posts ──< attachments
```

## 主要表

- `users`：内部标识、唯一手机号、昵称、状态与最近登录时间
- `sms_verification_codes`：手机号、验证码用途、HMAC 摘要、过期时间、错误次数与发送请求 IP
- `system_settings`：短信摘要密钥、初始管理员完成状态等非公开运行配置
- `roles`：角色标识、名称、是否可进入后台
- `permissions`：稳定的权限代码、分组、中文名称
- `user_roles`：用户与多角色的关联
- `role_permissions`：角色权限配置
- `user_permissions`：用户单独授权
- `sessions`：会话令牌摘要、过期时间
- `knowledge`：知识内容、可见范围、审核状态、标签
- `knowledge_acl`：受限知识对具体用户的访问授权
- `activities`：活动信息、状态、发布者
- `activity_participants`：报名记录
- `feedback`：结构化活动反馈、审核与公开状态
- `questions`：提问、回复、状态、FAQ 标记
- `community_posts`：经验分享、审核状态
- `comments`：经验分享评论
- `attachments`：统一附件元数据和受控文件路径
- `favorites` / `reading_history`：知识与用户的个人学习关系
- `audit_logs`：重要管理操作审计

登录手机号具有唯一索引；短信验证码和会话令牌只存摘要，文件按随机名称存储，原始文件名仅作为展示元数据。
