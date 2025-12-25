### Logto email templates as code (Management API)

Manage Logto **email templates** in Git (templates-as-code) and **sync** them to your Logto tenant via **Management API**.

- Docs:
  - Management API: `https://docs.logto.io/integrate-logto/interact-with-management-api`
  - Email templates: `https://docs.logto.io/connectors/email-connectors/email-templates`

---

### What this repo gives you

- **A CLI tool** (Node.js 18+) that:
  - Uses official **`@logto/api` SDK** for Management API access
  - Loads secrets from environment variables (supports `.env`)
  - Reads templates from `templates/<templateType>/<languageTag>/...`
  - Syncs templates to Logto Management API
  - Exports templates from Logto back to folders

---

### Quick start (English)

#### Prerequisites

- Node.js **18+**
- Install dependencies: `npm install` (or `npm ci`)
- A Logto **M2M app** with **Management API** permission (see docs above)

#### 1) Configure env

Copy `env.example` to `.env`, then fill it:

```bash
cp env.example .env
```

Required variables:

- `LOGTO_ENDPOINT` (e.g. `https://<tenant-id>.logto.app`)
- `LOGTO_M2M_CLIENT_ID` (M2M app client ID)
- `LOGTO_M2M_CLIENT_SECRET` (M2M app client secret)

Optional:

- `LOGTO_TENANT_ID` (auto-extracted from `LOGTO_ENDPOINT` for `.logto.app` domains; required for custom domains)
- `LOGTO_EMAIL_TEMPLATES_PATH` (default: `email-templates`)

#### 2) Put templates on disk

Folder layout:

```
templates/
  SignIn/
    en/
      subject.txt
      content.html
    zh-CN/
      subject.txt
      content.html
```

#### 3) Dry-run

```bash
node src/cli.js sync --dry-run
```

#### 4) Sync (apply)

```bash
node src/cli.js sync
```

#### 5) Export templates from Logto

```bash
node src/cli.js export --out exported-templates
```

---

### 快速开始（中文）

这个仓库用于把 Logto 的 **Email templates** 以“**模板即代码**”方式放进 Git，并通过 **Management API** 覆盖/同步到租户。

#### 前置条件

- Node.js **18+**
- 安装依赖：`npm install`（或 `npm ci`）
- 在 Logto 控制台创建 **M2M 应用**，并授予 **Management API** 权限（参考：
  - `https://docs.logto.io/integrate-logto/interact-with-management-api`
  - `https://docs.logto.io/connectors/email-connectors/email-templates`
  ）

#### 1）配置环境变量（支持 .env）

```bash
cp env.example .env
```

必填：

- `LOGTO_ENDPOINT`（例如：`https://<tenant-id>.logto.app`）
- `LOGTO_M2M_CLIENT_ID`（M2M 应用的客户端 ID）
- `LOGTO_M2M_CLIENT_SECRET`（M2M 应用的客户端密钥）

可选：

- `LOGTO_TENANT_ID`（对于 `.logto.app` 域名会自动从 `LOGTO_ENDPOINT` 提取；自定义域名需要手动设置）
- `LOGTO_EMAIL_TEMPLATES_PATH`（默认：`email-templates`）

#### 2）按目录放模板

```
templates/<templateType>/<languageTag>/
  subject.txt
  content.html 或 content.txt
  meta.json（可选：replyTo / sendFrom / contentType）
```

#### 3）预览（不写入）

```bash
node src/cli.js sync --dry-run
```

#### 4）同步到 Logto（写入）

```bash
node src/cli.js sync
```

---

### Notes / 注意事项

- This tool uses the official **`@logto/api` SDK** for all Management API calls.
- Email templates endpoint: `/api/${LOGTO_EMAIL_TEMPLATES_PATH}` (default: `/api/email-templates`)
  - If your tenant uses a different path, set `LOGTO_EMAIL_TEMPLATES_PATH`.
- For template types/variables (`SignIn`, `Register`, `ForgotPassword`, ...), follow Logto docs:
  `https://docs.logto.io/connectors/email-connectors/email-templates`
- The SDK handles authentication automatically (no manual token management needed).

