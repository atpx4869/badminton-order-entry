# 企业微信 Bot 待做清单

更新时间：2026-03-06

## 背景

当前项目已经支持：

- 网页端导入文本 / `.txt` 并导出 Excel
- Telegram Bot 通过 webhook 接收文本 / `.txt`，解析后回传 Excel

后续希望新增：

- 企业微信入口
- 用户在企业微信中发送订单文本或 `.txt`
- 系统解析后直接返回 Excel
- `warning` / `failed` 信息继续在 Excel 中标识，并在回复里提示

## 推荐方案

优先采用：**企业微信自建应用 + 消息回调**

原因：

- 最接近当前 Telegram Bot 的使用方式
- 更适合“接收消息 -> 处理 -> 回消息/文件”流程
- 可复用当前 `shared/parser` 与 `shared/export` 能力

不建议作为主入口的方案：

- 企业微信群机器人 webhook

原因：

- 更适合发通知
- 不适合做完整的双向消息接收与文件处理入口

## 目标能力

企业微信 Bot 最终应支持：

1. 用户发送纯文本订单
2. 用户发送 `.txt` 文件
3. 自动解析文本
4. 导出 Excel
5. 在 Excel 中标记：
   - `warning` 行
   - `failed` 段落
6. 在企业微信回复中提示：
   - 总段落
   - 成功数
   - 待确认数
   - 失败数

## 设计原则

### 1. 不重复造轮子

继续复用现有核心模块：

- `shared/parser/order-parser.js`
- `shared/export/excel-export.js`

### 2. 渠道适配层独立

新增企业微信时，尽量只新增“渠道适配逻辑”，不要改动解析核心。

建议结构：

- `server/wecom/`
  - `wecom-client.js`
  - `message-handler.js`
  - `webhook-handler.js`
  - `crypto.js`（如果需要）

### 3. 与 Telegram 逻辑保持一致

企业微信入口的行为尽量与 Telegram 一致：

- 文本 / txt 输入一致
- 汇总提示一致
- Excel 输出结构一致

## 待做任务

### 阶段一：企业微信接入准备

- [ ] 确认企业微信使用场景
  - [ ] 仅内部员工使用
  - [ ] 是否涉及外部客户
- [ ] 在企业微信后台创建自建应用
- [ ] 记录并保存以下信息：
  - [ ] `CORP_ID`
  - [ ] `AGENT_ID`
  - [ ] `SECRET`
  - [ ] 回调 `Token`
  - [ ] `EncodingAESKey`

### 阶段二：Vercel 路由设计

- [ ] 新增企业微信回调 API
  - [ ] 建议路径：`api/wecom-webhook.js`
- [ ] 支持 GET 校验回调
- [ ] 支持 POST 接收消息 / 事件
- [ ] 完成企业微信消息验签 / 解密

### 阶段三：消息处理逻辑

- [ ] 识别文本消息
- [ ] 识别文件消息
- [ ] 下载 `.txt` 文件内容
- [ ] 调用 `parseInputText()`
- [ ] 调用 `buildParseWorkbook()`
- [ ] 回传摘要消息
- [ ] 回传 Excel 文件

### 阶段四：文件处理

- [ ] 确认企业微信文件消息的接收方式
- [ ] 确认媒体文件下载接口
- [ ] 确认回传文件所需的上传接口
- [ ] 做临时文件或内存 buffer 方案

### 阶段五：配置与环境变量

- [ ] 新增 `.env.example` 配置项
- [ ] 新增 README 企业微信部署说明
- [ ] 在 Vercel 中添加企业微信环境变量

建议环境变量：

- [ ] `WECOM_CORP_ID`
- [ ] `WECOM_AGENT_ID`
- [ ] `WECOM_SECRET`
- [ ] `WECOM_TOKEN`
- [ ] `WECOM_ENCODING_AES_KEY`
- [ ] `WECOM_WEBHOOK_BASE_URL`
- [ ] `WECOM_WEBHOOK_PATH`

### 阶段六：测试

- [ ] 测试文本消息解析
- [ ] 测试 `.txt` 文件解析
- [ ] 测试 warning 标识是否正确
- [ ] 测试 failed sheet 是否正确
- [ ] 测试企业微信回消息是否成功
- [ ] 测试 Vercel 日志是否可定位错误

## 推荐技术路线

### 方案 A：企业微信自建应用（推荐）

流程：

1. 企业微信消息回调到 Vercel
2. 服务端验证签名并解密消息
3. 提取文本或文件
4. 调用共享解析/导出模块
5. 通过企业微信接口回发消息和文件

优点：

- 正式可用
- 能做完整交互
- 能复用现有 Bot 架构

### 方案 B：群机器人（仅通知）

适合做：

- 处理完成后把结果发群里
- 发布异常提醒
- 发汇总消息

不适合做：

- 主入口收单
- 接收用户文件并回文件

## 与现有代码的对应关系

当前可复用模块：

- 解析：`shared/parser/order-parser.js`
- 导出：`shared/export/excel-export.js`
- Telegram 渠道适配可参考：
  - `server/telegram/telegram-client.js`
  - `server/telegram/message-handler.js`
  - `server/telegram/webhook-handler.js`

新增企业微信时，建议参照 Telegram 的目录风格实现。

## 风险点

- 企业微信回调需要签名校验与解密，复杂度高于 Telegram
- 文件上传/下载流程可能与 Telegram 差异较大
- Vercel 函数时间限制需要关注
- 企业微信接口权限、可见范围、媒体接口限制需要提前确认

## 上线前检查清单

- [ ] 企业微信后台应用配置完整
- [ ] 回调 URL 已正确配置
- [ ] 回调验签通过
- [ ] 文本消息可正常解析
- [ ] `.txt` 文件可正常下载并解析
- [ ] Excel 可正常回传
- [ ] 错误日志可在 Vercel 中查看
- [ ] 使用新密钥完成一次完整联调

## 后续可选增强

- [ ] 企业微信群通知机器人
- [ ] 处理结果同步到群里
- [ ] 失败消息自动告警
- [ ] 增加渠道统一抽象层
- [ ] 支持更多输入格式

## 开始时建议先做什么

后面继续做时，建议按这个顺序开始：

1. 先确认企业微信自建应用所需参数都已拿到
2. 先做 `api/wecom-webhook.js` 的 GET 校验
3. 再做 POST 回调解密
4. 跑通“文本消息 -> 解析 -> 回摘要”
5. 最后再补 `.txt` 文件处理与 Excel 回传

