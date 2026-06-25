# 简历工作室网页版 · 部署与运维指南

> 适用仓库：`https://github.com/SINZHUAN/web-studio`  
> 线上地址：`https://sinzhuan.github.io/web-studio/`  
> 后端环境：`jiandacom-prod`（CloudBase 云函数 / 数据库 / HTTP 网关，**不随前端部署变更**）

---

## 一、架构说明（更新网站时改什么）

| 层级 | 内容 | 更新方式 |
|------|------|----------|
| **前端静态站** | Vue 页面（`src/`） | `git push` → GitHub Actions 自动构建部署 |
| **云函数 / 数据库** | `cloud-functions/`、控制台配置 | CloudBase 控制台单独上传/改环境变量 |
| **小程序** | `miniprogram/` | 微信开发者工具单独发布 |

**日常「更新网站」= 只改前端代码并 push，不用重新打包上传 zip，不用动云函数。**

---

## 二、一次性部署（首次，已完成可跳过）

### 2.1 GitHub 仓库

1. 创建仓库：`SINZHUAN/web-studio`（已创建）
2. 仓库地址：`https://github.com/SINZHUAN/web-studio.git`

### 2.2 GitHub Secrets（构建时用）

路径：**Settings → Secrets and variables → Actions → New repository secret**

| Secret 名称 | 值 |
|-------------|-----|
| `VITE_API_BASE_URL` | `https://jiandacom-prod-d2gnxqxs93455d5d7-1340279912.ap-shanghai.app.tcloudbase.com` |
| `VITE_CLOUDBASE_ENV_ID` | `jiandacom-prod-d2gnxqxs93455d5d7` |

> ⚠️ 不要把 `.env.production` 提交到 GitHub（已在 `.gitignore` 中排除）。

### 2.3 开启 GitHub Pages

路径：**Settings → Pages**

- **Source** 选择：**GitHub Actions**（不要选 Deploy from a branch）

### 2.4 本地首次推送

```bash
cd /Users/pengshubang/Desktop/web-studio

git init          # 仅首次
git branch -M main

git add .
git commit -m "Initial commit: web studio"

git remote add origin https://github.com/SINZHUAN/web-studio.git   # 仅首次
git push -u origin main
```

推送后 **Actions** 会自动运行 **Deploy to GitHub Pages**，等绿色 ✓ 即部署成功。

### 2.5 CloudBase 跨域（线上必做）

路径：**HTTP 网关 → 跨域设置 → 添加跨域域名**

| 域名 | 用途 |
|------|------|
| `localhost:3000` | 本地开发 |
| `sinzhuan.github.io` | GitHub Pages 线上 |

另需：**身份认证 → 登录方式 → 允许匿名登录**（浏览器直传云存储用）。

### 2.6 COS CORS（云存储默认桶）

路径：**云存储 → 默认桶 → 安全管理 → 跨域 CORS**

- Origin: `*`
- Methods: 全选
- Allow-Headers / Expose-Headers: `*`

---

## 三、日常更新网站（最常用）

改完 `src/` 等前端文件后，**三条命令**即可：

```bash
cd /Users/pengshubang/Desktop/web-studio

git add .
git commit -m "简要说明本次改了什么"
git push
```

然后：

1. 打开 https://github.com/SINZHUAN/web-studio/actions
2. 等待 **Deploy to GitHub Pages** 变绿（约 3～5 分钟）
3. 浏览器访问 https://sinzhuan.github.io/web-studio/（建议硬刷新 `Cmd+Shift+R`）

**不需要：**

- 重新 `npm run build` 再手动上传
- 重新配置 GitHub Secrets（除非换了 CloudBase 环境）
- 重新部署云函数

---

## 四、本地开发

```bash
cd /Users/pengshubang/Desktop/web-studio
npm install          # 仅首次或 package.json 变更后
npm run dev          # http://localhost:3000
```

环境变量读 `.env.development`（勿提交 Git）。

修改 `.env` 后需 **重启** `npm run dev`（Ctrl+C 再启动）。

---

## 五、手动本地构建（可选，一般不用）

仅当想本地预览「生产包」效果时：

```bash
cd /Users/pengshubang/Desktop/web-studio
VITE_BASE_PATH=/web-studio/ npm run build
npm run preview
```

线上部署由 GitHub Actions 自动执行，**不必**本地 build 再上传。

---

## 六、何时需要额外操作

| 场景 | 操作 |
|------|------|
| 只改网页 UI / 文案 / 前端逻辑 | `git push` 即可 |
| 改了 `cloud-functions/` 云函数代码 | CloudBase 控制台重新上传对应云函数 |
| 改了云函数环境变量 | 控制台改环境变量，无需重新 push 前端 |
| 换了 CloudBase HTTP 域名 | 更新 GitHub Secrets 的 `VITE_API_BASE_URL`，再 `git push` 触发重建 |
| 换了 GitHub 用户名或仓库名 | 更新 CloudBase 跨域域名；若仓库名变了，Actions 会自动改 `VITE_BASE_PATH` |
| 改了小程序 | 微信开发者工具单独上传，与网页部署无关 |

### 小程序双业务说明（简达 / 词镜）

| 专区 | 后端配置位置 | HTTP 域名 |
|------|-------------|-----------|
| **简达专区**（简历优化/定制） | `miniprogram/utils/request.js`、`app.js` | `jiandacom-prod-...app.tcloudbase.com` |
| **词镜专区**（插件激活） | `miniprogram/config/plugin-env.js` | `promptlens-be` / `promptlens-prod`（**勿改**） |

简达路由路径：`/commission_web`、`/payment_web`、`/ai_service_clo`、`/word_processor_clo`

微信公众平台 **request 合法域名** 须同时包含简达新域名；词镜原有域名保持不变。

---

## 七、云函数环境变量速查（控制台维护）

命名务必与代码一致，常见错误见下表。

| 云函数 | 正确变量名 | 常见误写 |
|--------|-----------|----------|
| `word_processor_web` | `TENCENT_REGION`、`TENCENT_BUCKET` | ~~TENCENT_SECRET_REGION~~ |
| `tools_web` / `commission_web` | `TENCENT_REGION`、`TENCENT_BUCKET` | ~~TENCENT_SECRET_REGION~~ / ~~TENCENT_SECRET_BUCKET~~ |
| `tools_web` 邮件 | `EMAIL_USER`、`EMAIL_PASS`（QQ 邮箱 SMTP 授权码） | 仅发纯文本可工作；含 Word 附件还需 `TENCENT_*` |
| `doc_processor_web` | `COS_REGION`、`COS_BUCKET` | 与 `TENCENT_*` 不同 |
| `payment_web` | `WECHAT_APPID`、`WECHAT_MCH_ID`、`WECHAT_API_KEY`、`WECHAT_NOTIFY_URL` | 不是 `WX_*` |

**HTTP API 域名**（前端、小程序）用：

```
https://jiandacom-prod-d2gnxqxs93455d5d7-1340279912.ap-shanghai.app.tcloudbase.com
```

不要用 `*.tcb.qcloud.la`（那是存储桶域名，会导致 405）。

---

## 八、故障排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| Actions 红色失败 | Secrets 未配或名称错误 | 检查 `VITE_API_BASE_URL`、`VITE_CLOUDBASE_ENV_ID` |
| 线上登录 405 + XML | API 域名填成存储桶域名 | 改用 `app.tcloudbase.com` 域名 |
| 线上上传失败 `credentials is null` | 跨域或匿名登录 | 加 `sinzhuan.github.io`；开启匿名登录 |
| 本地能登录线上不能 | 跨域只配了 localhost | 加 `sinzhuan.github.io` |
| 页面 404 | 路径少了仓库名 | 应访问 `/web-studio/` 后缀 |
| 润色失败 `missing param Region` | 云函数环境变量名错误 | `TENCENT_REGION=ap-shanghai` |
| 邮件发送 400 / `missing param Bucket` | `tools_web` 未配 `TENCENT_BUCKET` | 填 CI 桶 `cloud1-4g7z1dndd718b661-1340279912` |
| 打包导出图标 404 | 静态资源用了 `/images/...` 绝对路径 | 已改为 Vite `@images` 导入；需 `git push` 重建前端 |

---

## 九、关键链接

| 项目 | 链接 |
|------|------|
| GitHub 仓库 | https://github.com/SINZHUAN/web-studio |
| Actions 部署状态 | https://github.com/SINZHUAN/web-studio/actions |
| Pages 设置 | https://github.com/SINZHUAN/web-studio/settings/pages |
| Secrets 设置 | https://github.com/SINZHUAN/web-studio/settings/secrets/actions |
| 线上网站 | https://sinzhuan.github.io/web-studio/ |
| CloudBase 控制台 | https://tcb.cloud.tencent.com/dev?envId=jiandacom-prod-d2gnxqxs93455d5d7 |

---

## 十、更新流程速记

```
改代码 → git add . → git commit -m "..." → git push → Actions 变绿 → 刷新网页
```

就这些。
