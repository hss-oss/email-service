# 📧 Cloudflare Serverless 临时邮件服务

这是一个基于 Cloudflare 全家桶（Workers, D1, Email Routing）搭建的、功能完整的个人临时邮件接收服务。

## 🚀 在线演示

* **普通用户入口:** [**➡️ 点击这里访问: mail.tienshan.edu.kg**](https://mail.tienshan.edu.kg)

* **管理员入口:** [**➡️ 点击这里访问 (管理员)**](https://mail.tienshan.edu.kg/?admin=6242a64b-a151-4531-820b-2009899775cd)

## 🌟 主要功能

* **权限管理**: 区分**管理员**和**普通用户**两种角色。

* **账户系统**:

  * 管理员拥有所有权限，可以创建新的邮箱账户。

  * 每个新账户都有一个独立的邮箱码和初始密码。

* **安全登录**: 普通用户必须凭**邮箱码和密码**才能登录和查看邮件。

* **密码修改**: 普通用户登录后可以修改自己的密码，提升账户安全性。

* **纯云端 Serverless 架构**：所有服务均运行在 Cloudflare 的全球边缘网络，无需购买和管理服务器。

* **现代化界面**：使用 Tailwind CSS 和图标库构建，提供流畅的用户体验和美观的提示。

## 🛠️ 技术栈

* **邮件接收**: Cloudflare Email Routing

* **后端逻辑与 API**: Cloudflare Workers

* **数据库**: Cloudflare D1

* **前端界面**: 通过 Worker 动态生成的 HTML / Tailwind CSS / Vanilla JavaScript

* **部署与管理**: Cloudflare Wrangler CLI / Git-driven Deployment

* **邮件解析**: `postal-mime`

## 🚀 部署指南

我们提供两种部署方式，推荐使用对新手最友好的“通过 GitHub 部署”。

### A) 通过 GitHub 部署 (推荐，无需本地环境)

此方法利用 GitHub 和 Cloudflare 的集成，实现全自动部署，**无需在您的电脑上安装任何开发工具**。

**第一步：准备 GitHub 仓库**

1. 登录您的 GitHub 账户。

2. **Fork 本项目**：点击本项目页面右上角的 "Fork" 按钮，将此项目复制到您自己的 GitHub 账户下。

**第二步：创建 D1 数据库**

1. 登录 Cloudflare 仪表板，进入左侧菜单的 **Workers & Pages** -> **D1** 标签页。

2. 点击 **“创建数据库 (Create database)”**，名称填写 `email_db`，然后创建。

3. 创建后，**复制并保存好**这个数据库的 **ID** (例如 `xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx`)，下一步会用到。

**第三步：连接 GitHub 并创建应用**

1. 在 Cloudflare 仪表板，进入 **Workers & Pages**，点击 **“创建应用程序 (Create Application)”**。

2. 选择 **“连接到 Git (Connect to Git)”**。

3. 选择您刚刚 Fork 的项目仓库，并授权 Cloudflare 访问。

4. 在“构建和部署设置”页面：

   * **生产分支 (Production branch)**: 确保选择 `main`。

   * **构建命令 (Build command)**: 填写 `npm install`。

   * **构建输出目录 (Build output directory)**: 保持为 `/`。

5. 点击 **“保存并部署 (Save and Deploy)”**。Cloudflare 会进行第一次部署（此时会因为缺少配置而无法正常工作，这是正常的）。

**第四步：配置 Worker**

1. 部署完成后，进入新创建的 `email-service` 应用的管理页面，点击 **“设置 (Settings)”** 标签页。

2. 进入 **“环境变量 (Environment Variables)”**，点击 **“添加变量 (Add variable)”**：

   * **`MY_DOMAIN`**: 变量值填写你的域名，例如 `tianshan.edu.kg`。

   * **`ADMIN_UUID`**: 自己生成一个 [UUID](https://www.uuidgenerator.net/) 并粘贴到值中（这是你的管理员密码）。

3. 在同一页面，向下滚动到 **“D1 数据库绑定 (D1 Database Bindings)”**，点击 **“添加绑定 (Add binding)”**：

   * 变量名称填写 `DB`。

   * D1 数据库选择 `email_db`。

4. 保存所有绑定和变量。

**第五步：初始化数据库表**

1. 回到 `email-service` 应用的管理页面，点击 **“D1 数据库”** 标签页。

2. 你应该能看到绑定的 `email_db`。点击进入它的 **“控制台 (Console)”**。

3. 将项目根目录下 **`schema.sql`** 文件中的 SQL 代码完整地粘贴到输入框中，然后点击 **“执行 (Execute)”**。

**第六步：配置邮件路由**

1. 在 Cloudflare 仪表板，选择你的域名。

2. 进入 **Email > Email Routing** -> **Routes (路由)**。

3. 找到 **Catch-all address (全匹配地址)**，启用它。

4. 将其 **Action (操作)** 设置为 **Send to a Worker (发送到 Worker)**。

5. 将 **Destination (目标位置)** 选择为你的 Worker：`email-service`。

6. 保存设置。

至此，您的应用已完全配置并部署成功！访问 Worker 提供的 URL 即可开始使用。

### B) 本地开发部署指南 (适用于开发者)

此方法需要您在本地电脑上安装 [Node.js](https://nodejs.org/)、[Git](https://git-scm.com/) 和 [Wrangler CLI](https://developers.cloudflare.com/workers/wrangler/install-and-update/)，适合需要进行代码修改和版本控制的场景。

1. **安装 Wrangler**

   ```bash
   npm install -g wrangler
   ```

2. **克隆或准备好项目文件**
   将本项目的代码完整地下载或克隆到您的本地电脑。

3. **安装依赖 (关键步骤)**
   在项目文件夹的终端中，运行 `npm install`。

4. **创建 D1 数据库**
   运行 `wrangler d1 create email_db` 并复制保存好返回的 `database_id`。

5. **配置 `wrangler.jsonc`**
   参考项目中的 `wrangler.jsonc` 文件，填入您自己的 `name`, `database_id` 和 `MY_DOMAIN` 等信息。

6. **初始化数据库表结构**
   运行 `wrangler d1 execute email_db --file=./schema.sql --remote`。

7. **配置邮件路由** (同上)。

8. **部署 Worker！**
   运行 `wrangler deploy` 命令进行部署。