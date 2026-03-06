当前目录保存的是 2026-03-06 的 Telegram 轮询版快照。

包含文件：
- `package.json`
- `README.md`
- `.gitignore`
- `.env.example`
- `server/config/telegram-config.js`
- `server/telegram/bot.js`
- `shared/parser/order-parser.js`
- `shared/export/excel-export.js`

如果后续 webhook 版不满意，可用这些文件覆盖项目当前同路径文件进行回退。

PowerShell 回退示例：

```powershell
Copy-Item backups\telegram-polling-2026-03-06\package.json package.json -Force
Copy-Item backups\telegram-polling-2026-03-06\README.md README.md -Force
Copy-Item backups\telegram-polling-2026-03-06\.gitignore .gitignore -Force
Copy-Item backups\telegram-polling-2026-03-06\.env.example .env.example -Force
Copy-Item backups\telegram-polling-2026-03-06\server\config\telegram-config.js server\config\telegram-config.js -Force
Copy-Item backups\telegram-polling-2026-03-06\server\telegram\bot.js server\telegram\bot.js -Force
Copy-Item backups\telegram-polling-2026-03-06\shared\parser\order-parser.js shared\parser\order-parser.js -Force
Copy-Item backups\telegram-polling-2026-03-06\shared\export\excel-export.js shared\export\excel-export.js -Force
```
