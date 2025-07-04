# 📧 Cloudflare Serverless 临时邮件服务

这是一个基于 Cloudflare 全家桶（Workers, D1, Email Routing）搭建的、功能完整的个人临时邮件接收服务。

## 🌟 主要功能

* **动态生成邮箱**：自动生成易于记忆的、独一无二的邮箱地址（例如 `clever-fox-123@your-domain.com`）。
* **实时邮件查收**：在美观的网页界面上实时查看接收到的邮件，无需刷新页面。
* **持久化恢复**：通过“恢复码” (`mailbox_code`) 可以在任何设备上找回历史邮箱和邮件。
* **纯云端 Serverless 架构**：所有服务均运行在 Cloudflare 的全球边缘网络，无需购买和管理服务器。
* **现代化界面**：使用 Tailwind CSS 和图标库构建，提供流畅的用户体验和美观的提示。

## 🛠️ 技术栈

* **邮件接收**: Cloudflare Email Routing
* **后端逻辑与 API**: Cloudflare Workers
* **数据库**: Cloudflare D1
* **前端界面**: 通过 Worker 动态生成的 HTML / Tailwind CSS / Vanilla JavaScript
* **部署与管理**: Cloudflare Wrangler CLI
* **邮件解析**: `postal-mime`

## 🚀 部署指南 (纯网页操作)

此方法无需在您的电脑上安装任何开发工具，所有操作都在 Cloudflare 的网页控制台中完成。**此指南假设您已拥有本项目的完整文件。**

**第一步：创建 D1 数据库**

1. 登录 Cloudflare 仪表板，进入左侧菜单的 **Workers & Pages** -> **D1** 标签页。
2. 点击 **“创建数据库 (Create database)”**。
3. 数据库名称填写 `email_db`，选择一个地理位置，然后点击“创建”。

**第二步：创建 `emails` 表**

1. 在 D1 数据库列表中，点击刚刚创建的 `email_db`。
2. 进入 **“控制台 (Console)”** 标签页。
3. 将项目根目录下 **`schema.sql`** 文件中的 SQL 代码完整地粘贴到输入框中，然后点击 **“执行 (Execute)”**。

**第三步：创建并配置 Worker**

1. 进入左侧菜单的 **Workers & Pages**，点击 **“创建应用程序 (Create Application)”** -> **“创建 Worker (Create Worker)”**。
2. 给 Worker 命名，例如 `email-service`，然后点击 **“部署 (Deploy)”**。
3. 部署成功后，点击 **“编辑代码 (Quick Edit)”**。
4. 在代码编辑器中，**删除所有默认代码**，然后将项目 **`src/index.js`** 文件中的完整 Worker 脚本粘贴进去。
5. 点击 **“保存并部署 (Save and Deploy)”**。

**第四步：关联数据库和域名**

1. 代码部署后，在 `email-service` Worker 的管理页面，点击 **“设置 (Settings)”** 标签页。
2. 进入 **“变量 (Variables)”**，在“环境变量”部分，点击 **“添加变量 (Add variable)”**。
   * 变量名称填写 `MY_DOMAIN`。
   * 变量值填写你的域名，例如 `tianshan.edu.kg`。
   * 保存。
3. 在同一页面，向下滚动到 **“D1 数据库绑定 (D1 Database Bindings)”**，点击 **“添加绑定 (Add binding)”**。
   * 变量名称填写 `DB`。
   * D1 数据库选择 `email_db`。
   * 保存。

**第五步：配置邮件路由**

1. 登录 Cloudflare 仪表板，选择你的域名。
2. 进入 **Email > Email Routing** -> **Routes (路由)**。
3. 找到 **Catch-all address (全匹配地址)**，启用它。
4. 将其 **Action (操作)** 设置为 **Send to a Worker (发送到 Worker)**。
5. 将 **Destination (目标位置)** 选择为你的 Worker：**`email-service`**。
6. 保存设置。

部署成功后，访问 Worker 提供的 URL 即可开始使用。

## 🔧 工作原理

1.  **邮件流**: `外部邮件` -> `Cloudflare MX 记录` -> `Email Routing (Catch-all 规则)` -> `email-service Worker` 的 `email()` 函数。
2.  **数据处理**: `email()` 函数使用 `postal-mime` 解析邮件，提取 `mailbox_code`，并将邮件内容存入 D1 数据库。
3.  **前端访问**: 用户浏览器访问 Worker URL，`fetch()` 函数被触发，返回包含完整前端应用的 HTML。
4.  **数据获取**: 前端页面的 JavaScript 通过 API (`/api/emails/:code`) 请求邮件列表，`fetch()` 函数接收到 API 请求，从 D1 查询数据并以 JSON 格式返回。

## 📁 项目结构

```
.
├── src
│   └── index.js       # 核心代码：Worker后端逻辑 + 前端HTML/JS生成
├── .gitignore         # Git 忽略文件配置
├── package.json       # 项目依赖与脚本
├── schema.sql         # D1 数据库表结构
└── wrangler.jsonc     # Wrangler 部署与环境配置文件
