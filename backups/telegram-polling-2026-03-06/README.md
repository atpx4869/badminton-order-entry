# 商单录入系统（羽毛球）

用于将聊天记录中的订单信息快速解析为可编辑表格，支持批量处理、汇总统计与 Excel 导出。

## 功能亮点

- 聊天文本导入解析（按空行分段）
- 三态解析结果：
  - `success`：可直接使用
  - `warning`：可导入但需人工确认
  - `failed`：不导入，保留失败原因与片段
- 导入策略：
  - 识别并追加（append）
  - 识别并覆盖（replace）
  - 可配置是否导入 `warning` 行
- 表格交互：**双击单元格才进入编辑态**，点击其他位置自动保存并退出编辑
- 地址智能校验（导入时 + 地址编辑失焦时）
- 商品描述规范化：
  - 自动去掉末尾地区后缀（如 `vt黑➕vt白(湖南)` -> `vt黑➕vt白`）
  - 页面与导出统一显示为 `（商品描述）`
- 商品数量解析支持 `vt`/`vt2` 型号写法（如 `vt2黑2` = 2 支）
- 虚拟号处理：从姓名/地址末尾 `[数字]` 提取，并附加展示到姓名和地址后
- 发货地逻辑：不再从商品描述识别，导入默认使用“设置”中的默认发货地（默认 `湖南`）
- 批量修改（代理人、发货地、快递单号、运费）
- 汇总统计（订单数、商品数量、运费合计等）
- 导出全部/选中订单为 Excel
- localStorage 持久化（兼容旧数据结构）

## 技术栈

- Vue 3 + TypeScript + Vite
- Ant Design Vue
- xlsx / xlsx-js-style

---

## 一键部署到 Vercel

> 建议先把项目上传到 GitHub，再使用一键部署。

将下面按钮中的仓库地址替换为你的仓库地址：

```md
[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/atpx4869/badminton-order-entry)
```

替换后效果示例：

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https://github.com/atpx4869/badminton-order-entry)

### Vercel 手动配置（可选）

本项目是标准 Vite 静态站点，通常无需额外 `vercel.json`。

在 Vercel 中可使用：

- Framework Preset: `Vite`
- Install Command: `npm install`
- Build Command: `npm run build`
- Output Directory: `dist`

---

## 本地运行

### 环境要求

- Node.js 18+
- npm 9+

### 启动开发

```bash
npm install
npm run dev
```

### 构建

```bash
npm run build
```

### 本地预览构建结果

```bash
npm run preview
```

---

## 上传到 GitHub（参考）

如果你是首次上传：

```bash
git init
git add .
git commit -m "chore: init project"
git branch -M main
git remote add origin https://github.com/atpx4869/badminton-order-entry.git
git push -u origin main
```

---

## 使用说明

### 1) 导入订单

点击右上角「导入信息」，粘贴聊天文本后选择：

- 导入模式：`识别并追加` / `识别并覆盖`
- 是否导入待确认行：`导入待确认行（Warning）`

点击「开始导入」后，会显示最近一次解析统计：成功 / 待确认 / 失败。

### 2) 表格修复与编辑

- 表格标题提示：`双击单元格可编辑`
- 进入编辑后，点击其他位置自动保存
- 地址编辑后会触发智能校验
- 商品描述编辑后会刷新数量与相关联字段

### 3) 批量操作

可对选中行批量更新：

- 代理人
- 发货地
- 快递单号
- 运费

### 4) 导出

- 支持导出全部 / 导出选中
- 导出内容与页面展示逻辑保持一致（包括商品描述格式）

---

## 解析与规则说明（当前版本）

### 虚拟号

- 从姓名或地址末尾提取 `[数字]`
- 提取后会显示为：
  - `张三[1234]`
  - `湖北省武汉市武昌区[1234]`

### 商品描述

- 会移除末尾地区括号（如 `(湖南)` / `（湖南）`）
- 页面和导出展示统一为 `（商品描述）`
- `vt` / `vt2` 均按型号识别；示例：
  - `vt2黑1` -> 1 支
  - `vt2白1` -> 1 支
  - `vt2黑2` -> 2 支

### 发货地

- 不再从商品描述自动识别
- 导入时默认发货地来自「设置 -> 运费规则 -> 默认发货地」
- 默认值：`湖南`
- 用户手动修改后，以用户修改为准

### 地址智能校验

- 空地址：`failed`
- 地址过短（< 8）：`warning`
- 缺少常见地址结构特征（省/市/区/县/镇/乡/街道/路/号等）：`warning`
- 地址中疑似混入商品关键词：`warning`

---

## 数据持久化键

- 订单数据：`badminton-order-rows-v1`
- 解析规则：`badminton-parser-rules-v1`
- 运费与默认发货地：`badminton-freight-rules-v1`
- AI辅助识别配置：`badminton-ai-assist-config-v1`

---

## 解析问题码（ParseIssueCode）

- `EMPTY_BLOCK`
- `MISSING_NAME_AND_PHONE`
- `MISSING_ADDRESS`
- `MISSING_PRODUCT`
- `ADDRESS_SUSPECT`
- `ADDRESS_TOO_SHORT`
- `ADDRESS_CONTAINS_PRODUCT`
- `INVALID_PHONE`
- `MISSING_PHONE`

---

## Telegram Bot

项目已新增 Telegram Bot 入口，支持：

- 直接发送订单文本
- 上传 `.txt` 文件后自动解析
- 自动返回 Excel 文件
- 将 `warning` 行在 Excel 的 `订单` 工作表中标黄
- 将无法识别的内容写入 `识别失败` 工作表

### 启动方式

1. 复制环境变量模板：

```bash
cp .env.example .env
```

2. 在 `.env` 中配置：

```bash
TELEGRAM_BOT_TOKEN=你的新token
```

3. 启动 Bot：

```bash
npm run bot:telegram
```

### 可选环境变量

- `TELEGRAM_ALLOWED_CHAT_IDS`：限制允许使用机器人的 chat id，多个用英文逗号分隔
- `TELEGRAM_POLLING_TIMEOUT_SEC`：Telegram 长轮询超时时间
- `TELEGRAM_RETRY_DELAY_MS`：接口失败后的重试间隔

### 返回结果说明

- `订单` 工作表：成功和待确认订单
- `识别失败` 工作表：无法识别的原始片段、问题码、问题说明
- Bot 回复消息：会同步提示成功 / 待确认 / 失败数量

### 安全建议

- 不要把 Bot token 提交到仓库
- 如果 token 已泄露，请先去 BotFather 重新生成后再使用
