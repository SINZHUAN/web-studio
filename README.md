# 简历工作室 · 网页版内部工具

> 基于微信小程序 `SuperResumePro-2VE` 迁移复刻，将核心简历制作功能搬上浏览器，供工作室员工内部使用。

---

## 目录

1. [项目概述](#项目概述)
2. [技术栈](#技术栈)
3. [整体架构](#整体架构)
4. [前端功能详解](#前端功能详解)
   - [应用 Shell](#应用-shellhomevue)
   - [登录页](#登录页loginvue)
   - [简历优化模式](#简历优化模式)
   - [识别创建模式](#识别创建模式)
   - [工具箱与证件照制作](#工具箱与证件照制作)
   - [代做工单系统](#代做工单系统web-工具端)
   - [员工管理系统](#员工管理系统adminpagevue)
5. [微信小程序采集端](#微信小程序采集端)
6. [后端云服务详解](#后端云服务详解)
7. [项目文件结构](#项目文件结构)
8. [环境配置](#环境配置)
9. [腾讯云 CloudBase 配置](#腾讯云-cloudbase-配置)
10. [API 接口总表](#api-接口总表)
11. [快速启动](#快速启动)
12. [与小程序源码的对应关系](#与小程序源码的对应关系)

---

## 项目概述

| 项目 | 说明 |
|------|------|
| 名称 | 简历工作室（JIANDA）内部网页工具 |
| 定位 | 员工专属内部工具，需账号登录后使用 |
| 核心功能 | **简历优化**（AI分析 + 逐模块AI润色 + WPS在线编辑 + 文档回填导出 + 打包导出/邮件发送）<br>**识别创建**（模板驱动 + 内容识别提取 + AI润色 + 简历生成）<br>**工具箱**（证件照制作）<br>**工单系统**（全流程工单记录，支持员工查看备注、申请删除，管理员审批管理）<br>**代做工单系统**（客户通过小程序下单 → 员工接取制作 → 完成后状态同步回小程序）<br>**员工管理**（角色分层：总管理员/副管理员/员工；账号增删改、密码重置、冻结/解冻）<br>**安全监管**（行为拦截与数据库记录；自动冻结违规员工账号；安全日志与高危用户提示）|
| 配套小程序 | 微信小程序（AppID：`wx05b48e6f0254308d`）— 客户端信息采集，目前上线**简历优化**工单提交功能 |
| 参考版本 | 微信小程序 `SuperResumePro-2VE`（同目录）|
| 访问地址（开发）| `http://localhost:3000` |
| 测试账号 | `admin` / `jianda2026`（管理员）|

---

## 技术栈

### 前端

| 技术 | 版本 | 用途 |
|------|------|------|
| Vue 3 | ^3.4 | 核心框架，Composition API |
| Vite | ^5.0 | 构建工具 / 开发服务器 |
| Vue Router 4 | ^4.3 | 路由管理 + 登录守卫 |
| Pinia | ^2.1 | 全局状态管理 |
| Element Plus | ^2.6 | UI 组件库 |
| Axios | ^1.6 | HTTP 请求（带 JWT 拦截器）|
| @cloudbase/js-sdk | ^2.26 | 浏览器直传文件到云存储（绕过 6MB 限制）|

### 后端（腾讯云 CloudBase）

| 技术 | 用途 |
|------|------|
| 云函数（Cloud Functions）| 无服务器函数，处理认证 / AI / 文档操作 |
| HTTP 访问服务 | 将云函数暴露为 HTTP 接口，供前端 Axios 调用 |
| 云存储（COS）| 存储上传的原始 Word 文档及润色后文档、预览图、识别模式专属模板 |
| 云数据库 | 存储员工账号信息（集合：`studio_users`）|
| 腾讯 CI（数据万象）| Word 文档转图片预览 |
| DeepSeek API | AI 大语言模型，负责简历分析 / 识别提取 / 润色 / 总结 |

---

## 整体架构

```
微信小程序（miniprogram/）                    浏览器（Vue 3 SPA）
    │                                              │
    │ 【简历优化工单】optimize.js                   ├─ 员工操作：上传 Word / 触发分析润色
    │   wx.cloud.uploadFile → jk3 CloudBase         │             触发简历定制制作 / 证件照制作
    │   wx.request → client_create_order            │             接取/制作代做工单 / 员工管理
    │                                              │
    │ 【简历定制工单】customize.js（三步流程）        ├─ 文件上传：@cloudbase/js-sdk 直传 → 腾讯云 COS
    │   步骤1：选择模板 + 求职者身份                  │            简历优化：web_uploads/
    │   步骤2：填写参数 + 上传旧简历                  │            识别创建：recognition_uploads/
    │   步骤3：AI 识别提取 + 补填缺失内容             │            证件照：web_uploads/id_photos/
    │   ├─ wordPost → /word_processor_web            │
    │   │   extractParagraphs（提取旧简历段落）       │
    │   ├─ aiPost → /ai_service_clo                 └─ API 调用：Axios + JWT → CloudBase HTTP
    │   │   recognition_extract_all（模板驱动提取）                   │
    │   └─ post → client_create_recognition_order                   ├─ /auth_clo         → auth_clo
    │             （提交完整简历定制工单）                             │   员工登录/JWT/账号CRUD/冻结
    │                                                               │   数据库：users
    └──────────────────┐                                            │
                       ↓                                            ├─ /ai_service_clo   → ai_service_web
               /commission_web → 云函数 commission_web              │   AI分析/模块识别/润色/总结
                  客户端（无 JWT）：                                  │   recognition_extract_all（定制模式提取）
                    client_login（wx.login code 换 openid）          │   调用 DeepSeek API
                    client_create_order（提交简历优化工单）           │
                    client_create_recognition_order                 ├─ /word_processor_web → word_processor_web
                      （提交简历定制工单，含extractedData）            │   段落提取/文档回填/模板填充
                    client_bridge_resume_file                       │   extractParagraphs（定制模式公开接口）
                      （定制模式旧简历从jk3中转到web-02）              │   文档转图片（腾讯 CI）
                    client_get_orders（查询订单进度）                │   下载 URL 预签名
                    client_get_order_detail（订单详情）              │
                  员工端（需 JWT）：                                  ├─ /doc_processor_web → doc_processor_web
                    staff_list_orders（按状态列出工单）               │   WPS WebOffice 回调协议
                    staff_claim_order（接取工单，含配额检查）          │   三段式保存/在线编辑后生图
                    staff_complete_order（标记已完成）               │
                    staff_get_file_url（生成客户文件临时下载链接）     └─ /tools_web        → tools_web
                    staff_bridge_file（跨环境文件中转）                   证件照/邮件打包
                  管理员端（需管理员 JWT）：                               工单 CRUD/安全监管日志
                    admin_assign_order（指定分配给指定员工）
                    admin_get/update_settings（接单配额配置）
                    admin_get_daily_stats（今日接单统计）

                  数据库：commission_orders（含 businessType 区分优化/定制）
                          commission_settings
                  文件存储（客户原始文件）：jk3 CloudBase
                  文件存储（制作环境文件）：web-02 CloudBase（中转后）
                  跨环境中转：commission_web 服务端通过微信 API
                    下载 jk3 文件再上传 web-02，绕过浏览器 CORS
```

---

## 前端功能详解

### 应用 Shell（`Home.vue`）

应用主容器，提供固定侧边栏和顶部导航栏：

- **左侧固定侧边栏**：JIANDA 品牌标识 + 导航菜单（**任务工单**（第一位，含红点待接徽标）/ 功能专区 / 扩展专区 / 我的工单 / 工具设置 / **管理**（仅管理员可见，位于侧边栏底部））
- **顶部栏**：当前功能名称 + 子模式切换（**简历优化** / **识别创建**）+ 用户名 + 退出登录
- **内容区**：
  - `activeNav === 'home'`（默认初始页）：渲染首页，含账号信息 + **仪表盘**（待接工单 / 今日制作 / 今日导出 / 进行中工单，每 30 秒轮询，今日数据每日 0 点清零）
  - `featureMode === 'optimize'`：渲染简历优化三阶段组件（`UploadStage` → `ResultStage` → `DoneStage`）
  - `featureMode === 'create'`：按 `rStore.phase` 渲染识别创建三阶段组件（`RecognitionInputStage` → `RecognitionConfirmStage` → `RecognitionPreviewStage`）
  - `activeNav === 'tools'`：渲染工具箱九宫格（`ToolsHub`）或具体工具（`IDPhotoMaker`）
  - `activeNav === 'workorder'`：渲染员工工单页面（`WorkorderPage`）
  - `activeNav === 'admin'`：渲染员工管理页面（`AdminPage`，仅管理员可访问）
- **任务工单自动轮询**：每 30 秒静默拉取 `pending` 工单数，数量增加时侧边栏「任务工单」显示红点徽标，并弹出 `ElMessage` 通知；当前处于任务工单页时，列表同步静默刷新
- **切换保护**：正在分析/润色/识别/生成期间切换模式或导航，弹窗二次确认（终止/保留）；选择保留时将当前进度暂存 localStorage，下次进入简历优化时提示恢复
- **启动鉴权**：`App.vue` 挂载时向服务端验证 localStorage 中的 token 有效性，过期则自动登出跳转登录页；`Home.vue` 每 60 秒调用一次 `checkToken`，账号被冻结时立即弹出提示并踢出
- **安全监管**（`useAntiCapture.js` 全局挂载于 `Home.vue`）：
  - **拦截并记录**：`Ctrl/Cmd+S`（保存页面）、`Ctrl/Cmd+P`（打印/PDF）、`Ctrl/Cmd+U`（查看源码）、`F12/Ctrl+Shift+I/J/C`（DevTools），均调用 `preventDefault` 阻断并写入安全日志
  - **仅记录**：`PrintScreen`（Windows截图）、复制（`copy` 事件）、拖拽页面内容
  - **UI 层面限制**：全局禁用右键菜单（`contextmenu`）、全局禁止文字选择（CSS `user-select: none`，输入框除外）
  - **冷却机制**：同类事件 2000ms 内去重，避免重复上报
  - **自动冻结联动**：后端检测到触发冻结的事件（截图/保存/打印/查看源码/DevTools）在 1 小时内累计 ≥ 3 次，自动冻结账号并返回 `autoFrozen: true`，前端随即踢出登录

---

### 登录页（`Login.vue`）

- 右上角大标题"JIANDA"，蓝色渐变背景
- 邮箱 + 密码登录表单（Element Plus 表单校验）
- 登录成功：写入 `auth store`（JWT token + userId + 用户名），跳转首页
- **单设备登录互踢**：每次登录在服务端生成新 `sessionId` 并写入用户记录，旧设备的 Token 在下次 `verify` 时检测到 sessionId 不匹配，返回 401 → 前端弹出提示并跳回登录页
- **Token 有效期 3 天**：JWT `expiresIn: '3d'`，过期后 401 自动清除本地状态并跳登录
- 路由守卫：未登录访问任意路由自动跳转至登录页

---

### 简历优化模式

全流程由 `resumeEnhance` Pinia store 的 `stage` 字段驱动：

```
upload ──→ result ──→ done
   ↑     (分析中弹窗)   (润色中弹窗)
   └────────────────────────────────（重新开始）
```

#### 阶段一：上传与参数配置（`UploadStage.vue`）

1. 润色模式切换（岗位润色 / 自身润色）
2. 上传简历文档（`.docx`，点击或拖拽，进度条显示）
3. 求职者身份选择（全职 / 实习 / 在校，卡片式三选一）
4. 岗位润色专属字段：目标岗位、润色强度、岗位 JD
5. 发起分析按钮 → 触发 `useResumeAnalyze.runAnalysis()`

**分析加载弹窗**：全屏遮罩 + SVG 圆弧进度环（中心显示百分比）

#### 阶段二：分析流程（`useResumeAnalyze.js`）

| 步骤 | 进度 | 操作 |
|------|------|------|
| 提取段落 | 15% | `extractParagraphs` → 云函数解析 DOCX XML |
| AI 分析 | 35% | `enhanceAnalyze` → DeepSeek 返回评分 + 五维雷达图数据 |
| 模块识别 | 60% | `enhanceExtractSections` → 两步提取法识别各经历模块 |
| 生成预览图 | 80% | `docPreview` → 腾讯 CI 转图片 |
| 完成 | 100% | `store.stage = 'result'` |

#### 阶段三：分析报告（`ResultStage.vue`）

- 左侧：简历预览图 + 缩放滑块（30%-150%）
- 右侧：AI 评分 + 五维雷达图（Canvas）+ 识别模块列表
- 润色格式选择弹窗：自然段 / 小标题 / 自由设置（按模块独立配置）
- **回传分析报告**（仅代做工单模式下显示）：点击后将 `analysisResult`（评分 + 各维度文字）回传至 `commission_orders.clientAnalysisData`，小程序客户可在订单详情查看；按钮有 loading + 完成态反馈

#### 润色流程（`useResumePolish.js`）

| 步骤 | 进度 | 操作 |
|------|------|------|
| 构建润色列表 | 0% | `buildPolishList()` → 按格式为各模块分配 `contentFormat` + 字数范围 |
| 逐模块润色 | 0→70% | 循环调用 `enhancePolishSection` |
| 文档回填 | 80% | `replaceByParagraph` → 替换段落生成新 DOCX + 预览图 |
| 润色解析 | 90% | `enhanceOptimizationSummary` → 润色策略总结 |
| 完成 | 100% | `store.stage = 'done'` |

#### 阶段四：润色前后对比（`DoneStage.vue`）

- 左侧：润色前 / 润色后预览图并排 + 缩放滑块（30%-150%）；**多页简历（两页及以上）完整显示所有页预览图**（优先使用 `previewImageUrls[]`）
- **收起/展开对比**：预览图左上角切换按钮；收起时润色前列变为极窄条，润色后预览图扩展至主区域，右侧信息面板相应展宽；点击右侧信息区自动收起润色前列；按钮区域尺寸不随面板展开变化
- 右上角「复制预览」下拉菜单：**前后对比图** / **仅润色前** / **仅润色后**（Canvas 合成含水印「天鹿文化工作室·姓名」，写入剪贴板；不支持则自动下载）
- 右侧「润色对比」Tab：折叠列表 + 字数五档调节（精简/较短/正常/较长/超长）+ 单模块重新润色（最多 7 次）+ 浮动「重新生成简历」栏
- 右侧「润色解析」Tab：结构化润色策略总结
- **对比图回传**（仅代做工单模式）：点击弹窗确认是否连同润色解析报告一起回传；选择连同润色解析时先生成 `summaryData` 再一并上传；将水印预览图 URL + 分析摘要 + 润色解析报告写入 `commission_orders`（`clientPreviewUrls/clientOriginalUrls/clientAnalysis/clientAnalysisReport/previewSentAt`）；回传完成后小程序推送微信订阅消息通知客户
- **保存进度**（仅代做工单模式）：将当前制作快照（fileKey / polishList / analysisResult 等关键 store 状态）写入 `commission_orders.savedProgress`；再次点击「继续制作」时若有快照则直接恢复到 `DoneStage`
- 底部操作：**在线编辑**（WPS WebOffice 弹窗）/ **打包导出**（弹窗选择导出内容，见下）/ 重新开始

**打包导出弹窗**：
- 可选内容：简历成品 Word / 简历成品 PDF（预览图合成）/ 简历成品图片 / 润色解析文本 / 证件照
- 支持**全选**；未完成的项目（未生成解析、未制作证件照）显示灰态及「开始制作」入口
- **本地打包下载**：JSZip 打包为 `.zip` 压缩包，本地生成
- **发送到邮箱**：将选中文件发送至指定邮箱（云端打包，SMTP 发送）
- 任意一种导出方式成功后，均自动更新工单状态为「已导出」并写入成品文件路径

#### 在线编辑（`WpsEditorModal.vue` + `wpsSdk.js`）

> 集成 WPS WebOffice SDK，允许员工在浏览器内直接对润色后文档进行布局、字体、元素大小等精细调整，保存后预览图自动刷新。

- 点击「在线编辑」按钮打开全屏弹窗（`calc(100vw - 24px) × calc(100vh - 24px)`）
- SDK 从本地 `/libs/web-office-sdk.umd.js` 加载（WPS WebOffice SDK v2.0.7）
- 使用 `WebOfficeSDK.init()` 初始化，传入 `appId`、`fileId`（COS 文件名中的13位时间戳）、`token`
- **持久化实例**：首次打开后 iframe 通过 CSS `visibility` 切换显隐，不重复初始化，第二次打开近乎即时
- **性能优化**：
  - `preloadWpsSdk()`：`<link rel="preload">` 预加载 SDK 脚本（`DoneStage` 挂载时触发）
  - `preWarmWpsConfig(fileKey)`：监听 `polishedFileKey` 变化，提前缓存后端配置
  - Service Worker（`/public/sw.js`）：Cache-First 策略缓存 WPS CDN 资源
- 编辑完成点击「完成」，父组件重新拉取预览图刷新对比区域
- 后端回调由 `doc_processor_web` 云函数处理（文件信息、下载 URL、三段式保存等 WPS 标准协议）

#### Pinia Store（`resumeEnhance.js`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `stage` | string | `upload` / `result` / `done` |
| `uploadedFileId` | string | 云存储 fileID |
| `polishMode` | string | `position` / `self` |
| `targetPosition` / `jobDescription` | string | 岗位润色参数 |
| `polishingIntensity` | string | `senior` / `standard` / `basic` |
| `userIdentity` | string | 求职者身份 |
| `extractedSections` | object | AI 识别的各模块内容 |
| `analysisResult` | object | AI 分析报告（评分 + 五维数据）|
| `originalPreviewUrls` / `polishedPreviewUrls` | string[] | 润色前后简历预览图 URL |
| `outputFormat` | string | `paragraph` / `subtitle` / `custom` |
| `customModuleItems` | array | 自由设置时各模块独立格式 |
| `polishList` | array | 润色列表（含字数调节状态，五档偏移量）|
| `summaryData` | object | AI 润色解析总结 |
| `polishedFileKey` / `polishedDownloadUrl` | string | 润色后文档路径 + 下载 URL |

---

### 识别创建模式

> 面向「有旧简历或文本材料」的场景：员工上传旧简历 Word 或粘贴文本 → 系统按所选模板提取对应模块信息 → AI润色重点模块 → 自动生成全新规范简历并导出。

全流程由 `recognition` Pinia store 的 `phase` 字段驱动：

```
template/recognizing ──→ confirm/polishing ──→ preview
  (RecognitionInputStage)  (RecognitionConfirmStage) (RecognitionPreviewStage)
```

---

#### 核心原理：模板驱动提问清单

识别创建模式的**最核心设计**：AI 不是提取简历中所有能识别到的内容，而是严格按照所选模板的**模块标识库**和**记录库**，只提取当前模板需要的模块和对应的条目数量。

```
用户选择模板（如 word_r_1）+ 身份（如 internship）
        ↓
TEMPLATE_REQUIRED_MODULES['word_r_1_internship']
   = [1, 2, 5, 4, 7, 6, 9, 10]  ← 有序模块编号

        ↓ 映射为 moduleKey
   = [basic, career, education, internship, project, skill, skill_certificate, self_evaluation]

        ↓ 结合 TEMPLATE_ACTUAL_RECORDS_COUNT
TEMPLATE_ACTUAL_RECORDS_COUNT['word_r_1_internship']
   = { basic:1, career:1, education:2, internship:3, project:2, skill:8, skill_certificate:3, self_evaluation:1 }

        ↓ buildModuleSpecList() 生成
moduleSpecs = [
  { moduleKey:'basic', label:'基本信息', maxCount:1 },
  { moduleKey:'internship', label:'实习经历', maxCount:3 },
  ... 共8个
]

        ↓ 传给 recognition_extract_all 云函数
AI 提示词：「仅提取以上8个模块，其他忽略，每类最多N条」

        ↓ 提取结果
extractedData = { basic:{...}, career:{...}, internship:[...], ... }

        ↓ 按 POLISH_ELIGIBLE_MODULES 过滤润色模块
只对 internship, project, self_evaluation 执行 AI 润色
（basic/career/education/skill/skill_certificate 直接填充）

        ↓ buildTemplateData() 按记录数截断
internship 最多取 3 条，skill 最多取 8 条 ...

        ↓ generateResume() 填充 Word 模板占位符
生成最终简历文档
```

**设计优势**：
- AI 仅处理模板实际需要的模块，提取精度高，不浪费 token
- 严格按模板槽位数截断，确保不出现「数据比占位符多」的越界问题
- 模块配置集中在 `recognitionTemplateConfig.js`，新增模板只需更新配置，无需改业务逻辑

---

#### 模板配置文件（`src/config/recognitionTemplateConfig.js`）

| 导出项 | 说明 |
|--------|------|
| `TEMPLATE_REQUIRED_MODULES` | `templateId_userType` → 有序模块编号数组（对应原小程序标识库）|
| `TEMPLATE_ACTUAL_RECORDS_COUNT` | `templateId_userType` → 每模块最大条数（对应原小程序记录库）|
| `MODULE_NUMBER_TO_TYPE` | 模块编号 → 模块 key（与原小程序完全一致）|
| `MODULE_LABELS` | 模块 key → 中文标签 |
| `POLISH_ELIGIBLE_MODULES` | 可进行 AI 润色的模块集合（Set）：work / internship / project / school_experience / self_evaluation |
| `getRequiredModules(templateId, userType)` | 返回有序 moduleKey 数组 |
| `getActualRecordCounts(templateId, userType)` | 返回 `{ moduleKey: maxCount }` |
| `getPolishModules(templateId, userType)` | 返回当前模板需要润色的模块 key 数组 |
| `buildModuleSpecList(templateId, userType)` | 返回 `[{ moduleKey, label, maxCount }]`，直接传给云函数 |

> ⚠️ 当前 R1 三个身份配置已完整，R2～R5 标注 `// ⚠️ TODO`，需根据实际 Word 模板占位符数量填写后方可上线对应模板。

---

#### 阶段一：信息录入（`RecognitionInputStage.vue`）

1. **求职者身份选择**：全职 / 实习 / 在校（切换后重新拉取模板预览图）
2. **选择简历模板**：横向滚动卡片（R1~R5），预览图从云存储动态加载；选中后立即触发：
   - 更新 `store.selectedTemplateId`
   - 调用 `getRequiredModules` + `getActualRecordCounts` 写入 `store.templateModules` + `store.templateRecordCounts`
   - 在模板格下方动态展示「AI 将识别以下模块」标签列表（区分直接填充 / AI润色）
3. **简历内容输入**（Tab 切换）：
   - 上传 Word：`.docx` 拖拽或点击上传 → `uploadRecognitionFile()` 直传 COS `recognition_uploads/` → `extractWordParagraphs()` 提取段落文本
   - 粘贴文本：多行 textarea 直接粘贴
4. **润色参数**：模式（岗位/自身）、目标岗位、润色强度、岗位 JD
5. **开始识别按钮**：校验模板 + 内容 + 强度后，触发 `runExtraction()`
6. **识别加载弹窗**：全屏蓝色遮罩 + SVG 旋转圆环 + 状态文字

---

#### 识别提取流程（`useRecognitionExtract.js`）

```
store.extractedRawText 或 store.textContent（已有内容）
        ↓
buildModuleSpecList(templateId, userType)  ← 生成模块规格
        ↓
recognitionExtractAll({ textContent, userType, moduleSpecs })
        ↓
云函数 recognition_extract_all（模板驱动提示词）
        ↓
store.extractedData = res.extractedData
store.phase = 'confirm'
```

**前置校验**：`selectedTemplateId` 未选择 → 报错；`moduleSpecs` 为空（模板未配置）→ 报错提示联系管理员。

---

#### 云函数：`recognition_extract_all`（`ai_service_web`）

接收 `{ textContent, userType, moduleSpecs, templateId }` 四个参数，动态构建 AI 提示词：

- 仅列出 `moduleSpecs` 中的 N 个模块及其字段说明（**模板清单驱动采集**，旧简历仅作素材池）
- 提示词包含「本模板采集清单摘要」，列明每个模块的 key、中文标签、maxCount
- 禁止输出清单外 key；禁止将无关段落塞入其他模块
- 采用「两步提取法」：先识别所有段落归属，再逐模块深度提取内容
- 经历类 `content` 字段逐字保留原文（后续交润色处理）
- 时间格式统一转换为 `YYYY.MM`；直接输出 JSON，不添加 markdown 代码块

**服务端后处理（双重过滤）**：
- `whitelistExtractedToSpecs(extractedData, moduleSpecs)`：移除 AI 返回中不在 moduleSpecs 内的 key
- `clampExtractedArraysToSpecs(extractedData, moduleSpecs)`：截断数组模块长度不超过 maxCount

使用 `callDeepSeekForExtraction()`（`temperature=0.0`，`frequency_penalty=0`，`presence_penalty=0`，最高精确度提取模式）。

---

#### 阶段二：识别结果确认（`RecognitionConfirmStage.vue`）

- 按 `store.templateModules`（有序模块列表）展示识别结果
- 分为两组：
  - **直接填充**（蓝色徽标）：basic / career / education / skill / certificate / skill_certificate
  - **AI润色**（橙色徽标）：work / internship / project / school_experience / self_evaluation
- 每个模块卡片显示摘要预览（姓名+电话、公司名+条数、内容前80字等）
- 底部操作：「返回修改」→ `store.phase = 'template'`；「确认，开始润色并生成简历」→ `handleConfirm()`

---

#### 润色与生成流程（`useRecognitionPolish.js`）

```
getPolishModules(templateId, userType)  ← 只润色模板实际包含的润色模块
getActualRecordCounts(templateId, userType)  ← 取截断上限
        ↓
构建 polishList（只处理 recordCounts[key] > 0 的模块，且有内容的条目）
        ↓
逐项调用 enhancePolishSection（传入 wordCountRange）
        ↓
buildTemplateData(extractedData, polishList, recordCounts)
  → 各模块按 maxCount 截断，润色内容覆盖 content 字段，未润色模块直接映射
        ↓
generateResume({ templateId, userType, userData })
  → 云函数下载 Word 模板 → 替换占位符 → 生成新文档
        ↓
docToImage() → previewImages[]
getTempDownloadUrl() → wordDownloadUrl
        ↓
store.phase = 'preview'
```

**润色加载弹窗**（`RecognitionConfirmStage.vue`）：逐模块进度列表 + 生成阶段不确定进度条

---

#### 云函数：`generateResume`（`word_processor_web`）

接收 `{ templateId, userType, userData }`：

1. `isRecognitionTemplate(templateId)` 判断是否为 `word_r_*` 系列
2. 若是，调用 `buildRecognitionTemplateCloudId(templateId, userType)` 构建 web-2 云存储路径：
   `template_all/template_{userType}_word/r_{n}.docx`
3. 从 `web-2` 环境云存储下载模板 DOCX
4. 以 `docxtemplater` 替换占位符（`userData` 中各模块字段对应模板变量）
5. 生成新文档上传 COS → 调用 CI 生成预览图 → 返回 `wordFileKey + previewImages`

**云函数：`getRecognitionTemplateUrls`**（`word_processor_web`）

接收 `{ userType }`，为 `r_1` ~ `r_5` 五套模板构建预览图路径：
`template_all/template_{userType}_images/r_{n}.jpg`，批量调用 `cloud.getTempFileURL` 返回临时 URL。

> **存储环境**：识别模式模板文件存放在 **web-2** 云开发环境（`cloud://web-02-7gsm40y513e0dd07.7765-web-02-7gsm40y513e0dd07-1340085102`），与用户上传文件（web_uploads）独立管理。

---

#### 阶段三：预览与导出（`RecognitionPreviewStage.vue`）

- 左侧：多页预览图列表 + 页码
- 右侧：完成状态头 + 信息摘要卡片（模板 / 身份 / 润色模式 / 润色强度）+ 操作按钮
  - 「导出 Word 简历」：`<a href>` 直跳下载 + 弹窗询问是否用 WPS 打开（`wps://d?url=...`）
  - 「重新开始」：`rStore.reset()` 回到初始状态

---

#### Pinia Store（`recognition.js`）

**独立模式字段**

| 字段 | 类型 | 说明 |
|------|------|------|
| `phase` | string | 独立模式：`template` / `recognizing` / `confirm` / `polishing` / `preview`；代做工单模式：`done` |
| `userType` | string | `work` / `internship` / `student` |
| `selectedTemplateId` | string | `word_r_1` ~ `word_r_5` |
| `templateModules` | string[] | 当前模板有序模块 key 列表（从配置计算）|
| `templateRecordCounts` | object | `{ moduleKey: maxCount }`（从配置计算）|
| `inputTab` | string | `word` / `text` |
| `uploadedFileId` / `uploadedFileName` | string | 上传文件信息 |
| `extractedRawText` / `textContent` | string | AI 识别原始文本 |
| `polishMode` / `targetPosition` / `jobDescription` | string | 润色参数 |
| `polishingIntensity` | string | `senior` / `standard` / `basic` |
| `recognizingStatus` | string | 识别阶段状态文字 |
| `extractedData` | object | AI 提取的结构化模块数据（来自小程序或网页识别）|
| `polishList` | array | 润色进度列表 |
| `polishedCount` / `totalPolishCount` | number | 润色进度计数 |
| `isGenerating` / `generatingStatus` | boolean/string | 生成阶段状态 |
| `previewImages` | string[] | 生成简历预览图 URL |
| `wordFileKey` / `wordDownloadUrl` | string | 生成文档路径 + 下载 URL |

**代做工单模式专有字段（接取简历定制工单后由 `CommissionPage.vue` 写入）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `commissionOrderId` | string | 当前代做工单 `_id`，用于后续保存进度、完成更新 |
| `commissionOrderData` | object | 完整工单数据（含 extractedData / oldResumeFileKey 等）|
| `clientResumeFileKey` | string | 已中转到 web-02 的旧简历 COS fileKey |
| `polishedFileKey` | string | 润色后生成文档的 COS fileKey（在线编辑/回传成品使用）|

---

### 简历定制模式（小程序采集端）

> 微信小程序 `pages/order-submit/customize` 页面。客户在小程序选择模板、上传旧简历，由 AI 按模板驱动进行结构化提取，客户在小程序端完成数据补全，然后提交为代做工单；员工在网页端接取后直接进入 `RecognitionDoneStage`，跳过网页侧识别步骤，实现小程序侧采集 + 网页侧制作的分工闭环。

---

#### 三步子页面状态机（`step` 字段）

```
step='template'  ──→  step='params'  ──→  step='recognizing'  ──→  step='review'  ──→  step='submitting'  ──→  step='done'
  选模板+身份          填参数+上传旧简历      AI识别中（loading）       识别结果+补全            提交工单中               提交成功
```

| step 值 | 显示内容 | 核心操作 |
|---------|---------|---------|
| `template` | 模板卡片（横向列表）+ 求职者身份 | `_loadTemplatePreviews()` 加载预览图；`goNextStep()` 校验模板+身份 |
| `params` | 润色参数（岗位/强度/JD）+ 上传旧简历按钮 | `wx.cloud.uploadFile` 直传 jk3 CloudBase；`goNextStep()` 触发识别 |
| `recognizing` | 全屏 loading 动画 | `_doRecognize()` 串行调用两个云函数 |
| `review` | 识别结果可折叠卡片列表 + 缺失字段补全 | 展开/折叠、填写缺失字段、时间选择器 |
| `submitting` | loading | `confirmSupplement()` → `client_create_recognition_order` |
| `done` | 成功提示 | — |

---

#### AI 识别流程（`_doRecognize`）

```
1. word_processor_web.extractParagraphs(fileId)
      ↓ 旧简历文本段落提取
2. _buildModuleSpecs()  ← 根据 selectedTemplateId + userType 从内置配置生成 moduleSpecs
      ↓
3. ai_service_web.recognition_extract_all({ textContent, userType, moduleSpecs, templateId })
      ↓ DeepSeek 模板驱动提取（temperature=0.0，精确模式）
      ↓ 云函数服务端：whitelistExtractedToSpecs + clampExtractedArraysToSpecs（双重过滤）
4. _normalizeExtractedForTemplate(extractedData)  ← 客户端数组长度截断（客户端双保险）
      ↓
5. _detectGaps(extractedData)  ← 检测缺失字段/模块
6. _buildModuleOverview(extractedData)  ← 各模块完整度状态
7. _buildCollapsedModules(reviewSections, gapModules, moduleOverview)  ← 构建 UI 数据结构
      ↓
step = 'review'
```

**模板驱动原理**（与网页端完全一致）：

- 小程序内置 `_TEMPLATE_REQUIRED_MODULES` / `_TEMPLATE_ACTUAL_RECORDS_COUNT` / `_MODULE_NUMBER_TO_KEY` 三张配置表，内容与 `src/config/recognitionTemplateConfig.js` **严格同步**
- `_buildModuleSpecs()` 根据 `selectedTemplateId_userType` 查表，生成当前模板所需的模块清单及每模块最大条数
- AI 只采集清单内模块，`r1_internship` 不会出现 `work` 或 `certificate` 等模块的数据

---

#### gap 检测机制（`_detectGaps`）

```
for each moduleKey in moduleSpecs (排除 basic):
  if 整个模块缺失 → push { gapType:'missing', moduleKey }
  else:
    检测各记录的 KEY_FIELDS 字段是否为空 → fieldGapItems
    检测记录数 < maxCount → missingItems（需新建的记录）
    合并为 mergedItems → push { gapType:'mixed', ... }

基本信息单独处理 (basicMissing):
  检查 BASIC_CORE_FIELD_KEYS = ['name','phone','email','gender']
  四个字段缺任一 → push 对应 gap 项
```

每个 gap 项携带 `_mod`（模块 key）、`_field`（字段名）、`_recIdx`（记录索引，-1 表示新建）、`_newIdx`（新建序号）元数据，供后续 `confirmSupplement` 精确回填。

---

#### 识别结果页 UI（`collapsedModules` 数据结构）

`_buildCollapsedModules` 将 `reviewSections`（已识别内容）+ `gapModules`（缺失项）+ `moduleOverview`（完整度）合并为 `collapsedModules` 数组，每项结构如下：

```javascript
{
  moduleKey: 'internship',
  label: '实习经历',
  statusText: '已识别 2 条，待补全 1 条',   // 或 '识别完全'
  status: 'partial',                         // 'ok' | 'partial' | 'missing'
  hasFields: true,                           // 是否有已识别内容展示
  hasGaps: true,                             // 是否有待补全项
  isExp: true,                               // 是否为经历类模块
  gapRecords: [...],                         // 经历类：按记录分组的卡片数据
  gapItemsFlat: [...],                       // 通用类：扁平字段列表
  recognizedFields: [...],                   // 已识别只读字段列表
  modIdx: 0                                  // 在 gapModules 中的索引（回填用）
}
```

**排序规则**：`missing`（整体缺失）> `partial`（部分缺失）> `ok`（识别完全）

**经历类模块卡片结构**（`gapRecords`，仿超级模式总结清单弹窗布局）：

```javascript
{
  recBadge: '实习经历 1',
  firstRow: [{ label:'公司名称', key:'company', value:'', ... }, ...],   // 关键字段两列
  timeRow: { start: { label:'开始时间', isTime:true, ... }, end: {...} }, // 时间选择器行
  contentItem: { label:'工作内容', key:'content', ... },                 // 内容大文本块
  otherItems: [...]                                                        // 其他字段
}
```

时间字段（`startDate`/`endDate`）标记 `isTime: true`，WXML 渲染为 `<picker mode="date" fields="month">`，自动将 `YYYY-MM` 转换为 `YYYY.MM` 格式。

---

#### 补全数据回填原理（`_updateSupplementField`）

用户在补全表单填写/选择后，通过 `_mod`/`_field`/`_recIdx`/`_newIdx` 元数据精确定位到 `gapModules` 中对应项并更新 `value`，同时同步更新 `collapsedModules` 对应卡片的显示值，实现双向联动。

提交时 `confirmSupplement` 遍历 `gapModules`，将每个 gap 项的 `value` 按元数据写回 `extractedData`：
- `_recIdx >= 0`：更新已有记录的对应字段
- `_recIdx < 0` / `_newIdx >= 0`：在数组末尾新建记录

---

#### 提交工单（`_submitOrder`）

```
1. wx.cloud.uploadFile → 获取旧简历 fileId（jk3 环境）
2. commission_web.client_create_recognition_order({
     extractedData,      // 补全后的完整结构化数据
     oldResumeFileId,    // 旧简历 jk3 fileId（员工端接取时触发中转）
     selectedTemplateId,
     userType, polishMode, targetPosition, polishingIntensity, jobDescription,
     email
   })
3. step = 'done'
```

`client_create_recognition_order` 在 `commission_web` 中写入 `commission_orders` 集合，`businessType = 'resume_customize'`。

---

#### 关键配置与开关

| 常量/配置 | 位置 | 说明 |
|-----------|------|------|
| `SKIP_PAYMENT` | `customize.js` 顶部 | `true` = 跳过支付（当前状态），改为 `false` 正式启用 |
| `_TEMPLATE_REQUIRED_MODULES` | `customize.js` | 模板模块标识库，与网页端 `recognitionTemplateConfig.js` 严格同步 |
| `_TEMPLATE_ACTUAL_RECORDS_COUNT` | `customize.js` | 模板记录库（每模块最大条数），与网页端严格同步 |
| `_MODULE_NUMBER_TO_KEY` | `customize.js` | 模块编号 → key 映射表，与网页端严格同步 |
| `BASIC_CORE_FIELD_KEYS` | `customize.js` | `['name','phone','email','gender']`，基本信息核心四字段 |
| `TIME_FIELDS` | `customize.js` `_buildCollapsedModules` 内 | `Set(['startDate','endDate'])`，触发 date picker |

> ⚠️ `_TEMPLATE_REQUIRED_MODULES` / `_TEMPLATE_ACTUAL_RECORDS_COUNT` / `_MODULE_NUMBER_TO_KEY` 三张配置表必须与 `src/config/recognitionTemplateConfig.js` 保持完全一致，任何模板更新须同步修改两处。

---

#### 员工端接取后流程（`CommissionPage.vue` → `RecognitionDoneStage.vue`）

```
CommissionPage.vue 接取定制工单
        ↓ staff_claim_order + client_bridge_resume_file（jk3 → web-02 文件中转）
rStore.commissionOrderId = order._id
rStore.commissionOrderData = order
rStore.extractedData = order.extractedData     // 小程序已采集完毕
rStore.selectedTemplateId = order.selectedTemplateId
rStore.userType = order.userType
rStore.phase = 'done'
featureMode = 'create'
        ↓
Home.vue 渲染 RecognitionDoneStage.vue
        ├─ 打包导出（与 DoneStage 对齐）→ apiCompleteCommissionOrder() → 工单状态→已完成
        ├─ 在线编辑（WPS WebOffice）→ preloadWpsSdk + preWarmWpsConfig
        ├─ 回传成品 → 小程序客户收到通知
        ├─ 保存进度 → staff_save_progress（快照写入 commission_orders.savedProgress）
        └─ 重新开始 → rStore.reset()
```

**离开保护**：`Home.vue` 在 `featureMode === 'create'` 且 `rStore.phase === 'done'` 时，拦截路由跳转，弹出「保存进度 / 直接离开」确认弹窗（与简历优化模式暂存弹窗逻辑对齐）。

---

### 工具箱与证件照制作

> 侧边栏「工具 /B」Tab 下的工具集，目前已上线**证件照制作**功能。

#### 工具箱入口（`ToolsHub.vue`）

- 九宫格卡片布局展示所有可用工具
- 点击卡片进入对应工具；顶部面包屑「工具箱 / 工具名」支持返回
- 后续新增工具只需在配置中追加，无需改动主框架

#### 证件照制作（`IDPhotoMaker.vue`）

1. **上传照片**：支持 JPG/PNG，点击或拖拽，实时预览原图
2. **规格选择**：内置常用证件照尺寸（一寸、两寸、护照等）
3. **背景色选择**：红色 / 蓝色 / 白色 / 深蓝色等多种标准色
4. **AI 处理**：调用 `tools_web` 云函数 → Doubao AI API 完成背景替换与尺寸裁切
5. **结果预览与下载**：处理完成后展示证件照，提供下载按钮

**Pinia Store**：`idPhoto.js`，管理上传图片、规格、背景色、处理结果状态

---

### 工单系统（`WorkorderPage.vue`）

> 侧边栏「工单 /C」Tab，所有员工均可访问，记录每次简历处理的完整流程轨迹。

#### 工单生命周期

| 阶段 | 触发时机 | 工单状态 |
|------|----------|----------|
| 创建 | 员工点击「开始润色」 | 🔵 已上传 |
| 润色完成 | 文档回填写入云存储 | 🟡 已润色 |
| 成品导出 | 打包导出 / 邮件发送成功 | 🟢 已导出 |

> 状态更新均为静默后台执行（`try/catch` 包裹），不影响主业务流程。

#### 员工工单页功能

| 功能 | 说明 |
|------|------|
| 状态 Tab 筛选 | 全部 / 已上传 / 已润色 / 已导出，每个 Tab 显示该状态计数 |
| 工单列表 | 工单编号、求职者姓名、润色模式、目标岗位、状态徽章、上传时间 |
| 展开详情 | 完整字段展示；「已导出」状态显示「下载文档」「下载图片」文字按钮 |
| 员工备注 | 可在展开区域编辑并保存（500字限制），仅自己可改 |
| 申请删除 | 标记 `deleteRequested: true`，等待管理员审批；申请后显示「审批中」状态 |

#### 管理员工单管理（`AdminPage.vue` 内第二 Tab）

| 功能 | 说明 |
|------|------|
| 全员工单查看 | 可按员工 + 状态联合筛选，显示「待审批删除申请」高亮提示 |
| 直接修改状态 | 下拉框直接切换三种状态，无需确认弹窗 |
| 管理员备注 | 展开行后可填写/修改管理员备注（500字限制）|
| 批准 / 驳回删除申请 | 批准→永久删除；驳回→清除申请标记 |
| 强制删除 | 管理员可直接删除任意工单（二次确认弹窗）|

#### 工单数据结构（`workorders` 集合，权限 ADMINONLY）

| 字段 | 类型 | 说明 |
|------|------|------|
| `workorderId` | string | 可读编号 `WO-YYYYMMDD-NNN`（当日序号）|
| `userId` / `userName` | string | 所属员工 ID / 姓名（冗余存储）|
| `resumeName` | string | 求职者姓名（创建时用文件名初始化，润色完成后 AI 解析覆盖）|
| `uploadedFileKey` | string | 原始简历 COS 路径 |
| `polishMode` | string | `position`（岗位润色）/ `self`（自身润色）|
| `targetPosition` / `polishIntensity` | string | 目标岗位 / 润色强度 |
| `status` | string | `uploaded` / `polished` / `exported` |
| `polishedFileKey` | string | 成品 Word COS 路径（仅 exported 时填入）|
| `polishedPreviewUrls` | string[] | 成品预览图 URL 列表（仅 exported 时填入）|
| `employeeNote` | string | 员工备注（员工可修改，最多 500 字）|
| `adminNote` | string | 管理员备注（仅管理员可修改）|
| `deleteRequested` | boolean | 员工是否已申请删除 |
| `createdAt` / `updatedAt` | string | ISO 时间戳 |

> **工单 ID 持久化**：`workorderStore.currentId` 写入 `localStorage`（键 `studio_workorder_current_id`），草稿恢复后仍可继续更新同一工单的状态和求职者信息，不会因离开页面而断链。

---

### 代做工单系统（Web 工具端）

> 侧边栏「代做工单 /Com」Tab，所有登录员工均可访问。与微信小程序采集端配合，实现「客户下单 → 员工接取制作 → 状态同步回客户」的完整闭环。支持两种业务类型，通过 `businessType` 字段区分。

#### 业务流程

**简历优化工单（`businessType = 'resume_optimize'`）**

```
客户（小程序 optimize.js）填写信息 + 上传简历
        ↓ commission_web.client_create_order
待接取池（status = 'pending'）
        ↓ 员工点击"接取"（staff_claim_order + staff_bridge_file）
系统自动跳转功能区 featureMode='optimize' → UploadStage
        ├─ 自动填充：润色模式 / 目标岗位 / 强度 / 求职者身份 / 文件名
        └─ 自动中转：commission_web 从 jk3 CloudBase 下载原始文件，上传至 web-02
                    ↓ 员工执行：分析 → 润色 → 打包导出
        DoneStage.vue 打包导出成功后：
            ① 工单系统（workorders）状态 → "已导出"
            ② 代做工单（commission_orders）状态 → "已完成"
                    ↓
        客户小程序"我的订单"页自动更新为"已完成"
```

**简历定制工单（`businessType = 'resume_customize'`）**

```
客户（小程序 customize.js）三步流程：
  步骤1：选模板 + 身份
  步骤2：填参数 + 上传旧简历（wx.cloud.uploadFile → jk3 CloudBase）
  步骤3：AI识别提取（word_processor_web.extractParagraphs + ai_service_web.recognition_extract_all）
         → 识别结果展示（可折叠卡片）+ 缺失字段补全（gap detection）
        ↓ confirmSupplement → commission_web.client_create_recognition_order
待接取池（status = 'pending'）
        ↓ 员工点击"接取"（staff_claim_order + client_bridge_resume_file）
系统自动跳转功能区 featureMode='create' → RecognitionDoneStage（直接进入 done 阶段）
        ├─ rStore.phase = 'done'（跳过识别/润色步骤，extractedData 已由小程序侧采集完毕）
        ├─ rStore 自动填充：extractedData / commissionOrderId / 各润色参数
        └─ 员工可执行：在线编辑（WPS）/ 打包导出 / 回传成品 / 保存进度
        RecognitionDoneStage.vue 打包导出成功后：
            ① commission_orders 状态 → "已完成"（apiCompleteCommissionOrder）
                    ↓
        客户小程序"我的订单"页自动更新为"已完成"
```

#### 代做工单页功能（`CommissionPage.vue`）

| Tab | 内容 | 操作 |
|-----|------|------|
| 待接取 | 所有状态为 `pending` 的工单（红点徽标计数）| 点击「接取」→ 立即跳转功能区制作；管理员可「指定分配」给指定员工 |
| 制作中 | 状态为 `claimed` 的工单（接单员工只看自己，管理员看全部）| 点击「继续制作」→ 若工单有 `savedProgress` 快照则直接恢复至 `DoneStage`，否则从 `UploadStage` 开始 |
| 已完成 | 状态为 `completed` 的工单 | 查看详情 |

- **工单详情弹窗**：完整展示工单所有字段（邮箱 / 身份 / 润色参数 / 原始文件名）+ 「下载文件」按钮（调用 `staff_get_file_url` 生成7天有效临时下载链接）
- **跨环境文件中转**（`staff_bridge_file`）：接取工单时，后端云函数从小程序的 `jk3` 微信 CloudBase 环境下载客户原始文件，再上传到制作环境 `web-02` CloudBase，返回 `fileId`/`fileKey` 写入 `resumeStore`，使"发起分析"按钮立即可用
- **身份值适配**：小程序用 `'full'` 表示全职，`CommissionPage.vue` 接取时自动转换为网页工具约定的 `'work'`，确保 AI 云函数正确识别身份
- **刷新按钮**：支持手动刷新当前 Tab 数据

#### Pinia Store（`commission.js`）

| 字段 | 类型 | 说明 |
|------|------|------|
| `activeOrderId` | string \| null | 当前正在制作的代做工单数据库 `_id`，持久化至 `localStorage`（键 `studio_commission_active_order`） |
| `activeOrderData` | object \| null | 工单完整数据（邮箱预填、工单编号展示等）|
| `pendingCount` | number | 待接取工单数（侧边栏红点徽标）|

#### 代做工单数据结构（`commission_orders` 集合）

**通用字段（两种业务类型共有）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `orderId` | string | 可读编号 `CO-YYYYMMDD-NNN`（按日序号） |
| `businessType` | string | `resume_optimize`（简历优化）/ `resume_customize`（简历定制）|
| `openid` | string | 客户微信 openid |
| `email` | string | 客户收件邮箱 |
| `userIdentity` | string | `full` / `internship` / `student`（小程序约定值）|
| `status` | string | `pending` → `claimed` → `completed` |
| `claimedBy` / `claimedByName` / `claimedAt` | string | 接单员工 ID / 姓名 / 接单时间 |
| `completedAt` / `resultFileKey` / `resultPreviewUrls` | string / string[] | 完成时间 / 成品文件路径 / 成品预览图 |
| `linkedWorkorderId` | string | 关联的工单系统记录 ID |
| `savedProgress` / `savedAt` | object / string | 员工「保存进度」快照（store 关键字段）/ 快照时间 |
| `clientPreviewUrls` / `clientOriginalUrls` | string[] | 员工回传的润色后/润色前预览图 COS URL（带水印）|
| `clientAnalysis` | object | 回传的分析摘要（scoreValue / scoreLevel）|
| `clientAnalysisReport` | object | 回传的润色解析报告（summaryData：整体策略/优化重点/面试建议等）|
| `previewSentAt` | string | 对比图回传时间 ISO 时间戳 |
| `clientAnalysisData` | object | 回传的简历分析报告（analysisResult + score + level）|
| `analysisSentAt` | string | 分析报告回传时间 ISO 时间戳 |
| `createdAt` / `updatedAt` | string | ISO 时间戳 |

**简历优化专有字段（`businessType = 'resume_optimize'`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `polishMode` | string | `position` / `self` |
| `targetPosition` / `polishingIntensity` / `jobDescription` | string | 润色参数 |
| `resumeFileKey` / `resumeFileName` | string | 客户上传的原始简历 CloudBase fileID / 文件名 |

**简历定制专有字段（`businessType = 'resume_customize'`）**

| 字段 | 类型 | 说明 |
|------|------|------|
| `selectedTemplateId` | string | 用户所选简历模板标识（如 `r1`）|
| `extractedData` | object | 小程序端完成 AI 识别+补全后的结构化数据（按模块键存储）|
| `oldResumeFileKey` | string | 旧简历原文件 COS fileKey（已从 jk3 中转至 web-02）|
| `gapModules` | array | 识别阶段检测到的缺失模块/字段列表（含 `_mod/_field/_recIdx/_newIdx` 元数据）|
| `polishMode` | string | 来自参数填写页，`position` / `self` |
| `targetPosition` / `jobDescription` / `polishingIntensity` | string | 来自参数填写页的润色参数 |

> 管理员可通过 `admin_assign_order` 手动分配工单；通过 `admin_get/update_settings` 配置「自由抢单」或「按配额分配」模式（`commission_settings` 集合 `global` 文档）。

---

### 员工管理系统（`AdminPage.vue`）

> 侧边栏「管理 /M」Tab，**仅管理员账号登录后可见**，普通员工无此入口。
> 页面内含三个 Tab：**员工管理** / **工单管理** / **安全日志**。

#### 角色层级

| 角色 | 标识 | 权限说明 |
|------|------|----------|
| 总管理员 | `superadmin` | 唯一，最高权限；可管理所有账号（副管理员 + 员工），可修改角色（不含自身）|
| 副管理员 | `admin` | 只能管理员工（editor）账号；不可管理其他管理员；不可修改角色 |
| 员工 | `editor` | 普通员工，无管理权限 |

> `seed` 初始化时创建的第一个账号角色为 `superadmin`。

#### 员工管理功能列表

| 功能 | 说明 |
|------|------|
| 员工列表 | 展示账号（彩色头像 + 姓名 + 账号 + 角色标签 + 状态 + 注册时间 + 最后登录）+ 刷新按钮 |
| 统计栏 | 全部 / 活跃 / 停用 / 总管理员 / 副管理员 人数实时统计 |
| 添加员工 | 弹窗填写姓名、账号、初始密码、角色；角色选项受当前登录者权限约束 |
| 启用/停用 | 一键切换账号 `isActive` 状态，立即生效 |
| 修改角色 | 仅总管理员可操作；表格内下拉切换 editor / admin（不可改自己、不可改 superadmin）|
| 重置密码 | 管理员直接设定新密码（两次确认），无需旧密码 |
| 冻结/解冻 | 账号被冻结后无法登录；解冻时同步写入 `unfrozenAt`（重置自动冻结计数器）|
| 删除账号 | Popconfirm 二次确认后彻底删除；角色权限约束同上 |

#### 安全日志 Tab

| 功能 | 说明 |
|------|------|
| 日志列表 | 展示安全事件（事件类型 / 员工名 / 时间 / 详情 / 页面 URL），支持按员工 + 类型筛选 |
| 高危提示 | 一键查看 1 小时内触发冻结类事件 ≥ 3 次的员工列表，标注是否已触发自动冻结 |

#### 技术要点

- 所有操作通过 `auth_clo` 云函数执行，服务端校验 JWT + 角色层级
- 密码均以 `bcryptjs`（BCRYPT_ROUNDS=10）哈希存储，明文不落库
- 自己的账号行：操作按钮禁用，防止误操作；`superadmin` 账号行对所有副管理员只读

---

---

## 微信小程序采集端

> 位于 `miniprogram/` 目录，使用微信开发者工具打开调试/上传。AppID：`wx05b48e6f0254308d`。
> 
> 定位：面向**客户**（求职者）的信息采集入口，目前上线**简历优化**工单提交功能；识别创建模式暂未开发。

### 整体页面结构

| 页面路径 | 功能 |
|---------|------|
| `pages/index/index` | 首页：功能入口（提交简历优化订单 / 我的订单）；有待确认预览或未读分析报告时显示对应 badge；启动时自动检查并弹窗通知 |
| `pages/order-submit/optimize` | **单页表单**式工单提交（邮箱+身份+润色参数+文件上传，底部提交），提交成功跳至成功通知页（可开启制作完成微信订阅提醒）|
| `pages/order-status/index` | 我的订单列表（支持下拉刷新，`onShow` 自动刷新）；有回传的订单卡片显示「制作完成待确认」badge |
| `pages/order-detail/index` | 订单详情（状态 / 润色参数 / **制作进度时间线**，各步骤显示真实时间戳）|

### 提交工单流程（`order-submit/optimize.js`）

**页面结构**：单页表单（取消原 4 步向导），所有参数在一页内填写完成，底部「立即提交」按钮。提交成功后跳至成功通知页（含「开启制作完成提醒」按钮，调用 `wx.requestSubscribeMessage` 开启微信订阅通知）。

```
单页表单 — 所有字段
  求职者身份（下拉选择：全职/实习/在校）
  润色模式（下拉选择：岗位润色/自身润色）
  目标岗位（岗位润色必填；文字颜色蓝色，无下划线）
  岗位 JD（可折叠展开的大输入框，选填）
  润色强度（下拉选择：基础/标准/深度）
  收件邮箱（输入时展示常用后缀建议）
  简历文档（wx.chooseMessageFile 选取 .docx/.doc）
    → getApp().ensureCloudInited() 懒加载 wx.cloud SDK
    → wx.cloud.uploadFile 直传 jk3 CloudBase
    → 存储路径：client_uploads/{openid}/{timestamp}_{fileName}
  提交 → commission_web → client_create_order → 成功跳至通知页
```

**草稿持久化**：每次输入/选择均同步写入 `wx.setStorageSync('optimize_draft', {...})`，`onLoad` 时自动恢复，成功提交后清除。防止因运行时意外重启导致填写内容丢失。

### 订单状态

| 状态值 | 小程序显示 | 说明 |
|--------|-----------|------|
| `pending` | 待接取 | 工单已提交，等待员工接取 |
| `claimed` | 制作中 | 已被员工接取，正在制作 |
| `completed` | 已完成 | 成品已导出，发送到邮箱 |

### 订单详情制作进度时间线（`order-detail/index.js` `buildSteps`）

各步骤按实际时间戳动态渲染：

| 步骤 | 出现条件 | 操作按钮 |
|------|---------|---------|
| 工单已提交 | 始终显示 | — |
| 员工已接单，制作中… | 始终显示，`claimedAt` 存在时切换完成态 | — |
| **简历分析完成** | `analysisSentAt` 存在（员工回传分析报告后）| 绿色「查看报告」→ 弹出分析报告弹窗（AI 评分圆圈 + 各维度文字分析）|
| **制作完成，请查看** | `previewSentAt` + `clientPreviewUrls` 存在（员工回传对比图后）| 蓝色「查看成品」→ 三栏 swiper 弹窗（优化前/优化后/优化解析），图片含水印；COS URL 通过 `wx.downloadFile` 转本地路径 |
| 制作完成，成品已发送至邮箱 | `completedAt` 存在 | — |

### 首页通知（`index/index.js` `_checkPendingPreviews`）

每次 `onShow` 静默拉取订单列表，分两路检测，各用独立 localStorage key 防重复弹：

| 通知类型 | 触发条件 | Badge 颜色 | localStorage Key |
|---------|---------|-----------|----------------|
| 制作完成待确认 | `hasPreview === true` | 绿色 | `notified_previews` |
| 分析报告已回传 | `hasAnalysisReport === true` | 蓝色 | `notified_analysis` |

> 成品通知优先：同次检测若有成品通知则只弹成品弹窗，分析报告弹窗留至下次 `onShow`。

### 技术要点

| 模块 | 说明 |
|------|------|
| **云开发 SDK 懒加载** | `wx.cloud.init` 不在 `App.onLaunch` 中执行，改为 `ensureCloudInited()` 按需调用，避免启动时触发网络鉴权超时 |
| **openid 缓存** | `wx.login` → `client_login` 换取 openid 后写入 `globalData` 和 `localStorage`（键 `commission_openid`）；下次启动直接读取缓存，无需重复网络请求 |
| **HTTP 请求工具**（`utils/request.js`）| `post(action, data, timeout?)` 封装，默认超时 60s；`ensureOpenid()` 优先用缓存，仅在缺失时发起 `wx.login` |
| **文件存储环境** | 上传到微信 CloudBase 环境 `jk3-2gy9419jcb1c7fb7`（小程序关联环境），fileID 格式 `cloud://jk3-...`；员工制作时由 `staff_bridge_file` 中转到制作环境 `web-02` |
| **基础库版本** | `project.config.json` 中 `libVersion` 设为 `3.7.8` 稳定版（避免灰度版 3.15.1 的框架内部 timeout bug）|
| **返回首页** | 提交成功后"返回首页"先检查页面栈，栈深 > 1 时 `navigateBack`，否则 `wx.reLaunch` 兜底 |

### 相关配置文件

| 文件 | 说明 |
|------|------|
| `miniprogram/app.js` | 全局配置：`CLOUD_URL`（commission_web HTTP地址）、`CLOUD_ENV`（jk3环境ID）、`ensureCloudInited()`、`onError` 全局兜底 |
| `miniprogram/app.json` | 页面路由注册；`lazyCodeLoading: requiredComponents`（懒加载模式）|
| `miniprogram/app.wxss` | 全局样式（不含通配符 `*`，WXSS 编译器限制）|
| `miniprogram/utils/request.js` | HTTP 工具封装；openid 缓存管理 |
| `miniprogram/utils/util.js` | 标签映射常量（`IDENTITY_LABELS` / `STATUS_LABELS` / `INTENSITY_LABELS` / `MODE_LABELS`）+ 时间格式化工具 |
| `miniprogram/project.config.json` | AppID、libVersion（3.7.8）、编译设置 |

---

---

## 项目涉及云后台云服务内容介绍总览（禁止修改）

> ⚠️ 本节记录项目所有云后台环境、存储桶、数据万象服务的精确配置关系，是维护和二次开发的关键参考。**严禁随意修改本节内容**，如有变更须同步更新。

---

### 云开发环境总览

本项目同时使用 **两套独立的 CloudBase 环境**，类型和托管方不同，不可混用：

| 标识 | 环境 ID | 类型 | 说明 |
|------|---------|------|------|
| **web-02** | `web-02-7gsm40y513e0dd07` | 腾讯云托管 CloudBase | 网页工具后端主环境；所有云函数部署在此 |
| **jk3** | `jk3-2gy9419jcb1c7fb7` | 微信托管 CloudBase | 采集小程序关联环境；小程序客户上传文件存于此 |

> 两套环境相互独立、不可直接互访。跨环境文件访问须通过 `commission_web` 的 `staff_bridge_file` action 进行服务端中转（下载 jk3 文件 → 上传至 web-02）。

---

### 存储桶总览

本项目涉及 **3 个存储桶**，功能职责明确区分，**切勿混用**：

#### 存储桶 ①：web-02 CloudBase 默认存储（CloudBase JS SDK 直传）

| 项目 | 值 |
|------|-----|
| **Bucket 名** | `7765-web-02-7gsm40y513e0dd07-1340085102` |
| **域名** | `7765-web-02-7gsm40y513e0dd07-1340085102.cos.ap-shanghai.myqcloud.com` |
| **地域** | ap-shanghai |
| **类型** | 腾讯云 CloudBase 默认存储（由 CloudBase 平台托管）|
| **访问方式** | 浏览器：`@cloudbase/js-sdk` 匿名登录后直传；云函数内：`cloud.uploadFile()` / `cloud.getTempFileURL()` |
| **Cloud fileID 前缀** | `cloud://web-02-7gsm40y513e0dd07.7765-web-02-7gsm40y513e0dd07-1340085102/` |

**存储路径分配**：

| 路径 | 写入方 | 内容 |
|------|--------|------|
| `web_uploads/{timestamp}_{filename}` | 浏览器 `@cloudbase/js-sdk` | 员工上传的原始简历 DOCX（简历优化功能）|
| `recognition_uploads/{timestamp}_{filename}` | 浏览器 `@cloudbase/js-sdk` | 识别创建功能上传的参考简历 DOCX |
| `web_uploads/id_photos/originals/{prefix}_src.{ext}` | 浏览器 `@cloudbase/js-sdk` | 证件照制作上传的原始照片 |
| `template_all/template_{userType}_word/r_{n}.docx` | 人工上传（维护时手动）| 识别创建模式 Word 模板文件（R1~R5，三种身份）|
| `template_all/template_{userType}_images/r_{n}.jpg` | 人工上传（维护时手动）| 识别创建模式模板预览图 |
| `commission_bridged/{timestamp}_{filename}` | `commission_web` 云函数服务端 | 从 jk3 中转过来的客户原始简历（供网页工具处理）|

> **注意**：该桶**未开通数据万象（CI）**，仅用于文件上传与临时 URL 下载，不可对此桶的文件调用 CI 文档转图片等服务。

---

#### 存储桶 ②：数据万象（CI）专用 COS 存储桶（COS SDK 直接操作）

| 项目 | 值 |
|------|-----|
| **Bucket 名** | `cloud1-4g7z1dndd718b661-1340279912` |
| **域名** | `cloud1-4g7z1dndd718b661-1340279912.cos.ap-shanghai.myqcloud.com` |
| **地域** | ap-shanghai |
| **类型** | 独立 COS 存储桶（开通了腾讯云**数据万象 CI**文档/图片处理服务）|
| **访问方式** | 云函数内通过 COS SDK（`cos-nodejs-sdk-v5`）使用 API 密钥直接操作 |
| **API 密钥配置** | 云函数环境变量 `TENCENT_SECRET_ID` / `TENCENT_SECRET_KEY` / `TENCENT_REGION` / `TENCENT_BUCKET` |

**使用此桶的云函数**：

| 云函数 | 环境变量名 | 默认值 | 用途 |
|--------|----------|--------|------|
| `word_processor_web` | `TENCENT_BUCKET` | （必须设置）| 写入生成/润色后的 DOCX；调用 CI 转图片 |
| `doc_processor_web` | `COS_BUCKET` | `cloud1-4g7z1dndd718b661-1340279912` | 读写 WPS 在线编辑的文件；调用 CI 重新生图 |

**存储路径分配**：

| 路径 | 写入方 | 内容 |
|------|--------|------|
| `documents/{templateId}_{timestamp}.docx` | `word_processor_web` | 润色后/识别创建生成的成品 DOCX 文件 |
| `documents/enhanced_{timestamp}.docx` | `word_processor_web` | WPS 编辑后保存的文档（三段式回调写入）|
| `pdf_documents/{templateId}_{timestamp}.pdf` | `word_processor_web` | 中间 PDF 文件（打包导出 PDF 时生成）|

**数据万象（CI）服务调用**：

| 操作 | 触发条件 | 说明 |
|------|---------|------|
| DOCX → 多页 PNG | `word_processor_web` 调用 `docToImage` | 对 `documents/` 路径文件调用 CI 文档预览，每页生成一张 PNG，返回图片 URL 数组 |
| 重新生图 | `doc_processor_web` 调用 `get_edited_preview` | WPS 编辑保存后，重新对 `documents/enhanced_*.docx` 调用 CI 生成最新预览图 |

> **为什么要独立一个 CI 桶？** CloudBase 默认存储桶（存储桶 ①）未开通数据万象，无法调用文档转图片等 CI 服务；而 CI 桶（存储桶 ②）需要通过 COS SDK + API 密钥访问，不适合直接用于用户文件上传（无匿名登录能力）。两桶分工明确，**不可调换**。

---

#### 存储桶 ③：jk3 微信 CloudBase 存储（wx.cloud SDK 直传）

| 项目 | 值 |
|------|-----|
| **环境 ID** | `jk3-2gy9419jcb1c7fb7` |
| **类型** | 微信托管 CloudBase 存储（由微信平台管理，非腾讯云控制台）|
| **访问方式** | 小程序端：`wx.cloud.uploadFile()`（SDK 直传，绕过 HTTP body 大小限制）|
| **Cloud fileID 前缀** | `cloud://jk3-2gy9419jcb1c7fb7-xxxxxxxx/` |
| **跨环境访问** | 不可从腾讯云侧直接访问；须通过微信 API（`tcb/batchdownloadfile`）生成临时下载链接 |

**存储路径分配**：

| 路径 | 写入方 | 内容 |
|------|--------|------|
| `client_uploads/{openid}/{timestamp}_{filename}` | 小程序 `wx.cloud.uploadFile` | 客户通过小程序上传的原始简历 DOCX |

**跨环境访问流程**（`staff_bridge_file`）：

```
小程序客户上传 → jk3 CloudBase 存储（client_uploads/）
                            ↓
员工接取代做工单 → 触发 commission_web.staff_bridge_file
                            ↓
  ① commission_web 调用微信 access_token API 获取临时下载链接（7天有效）
  ② commission_web 服务端 axios 下载文件（绕过浏览器 CORS 限制）
  ③ commission_web cloud.uploadFile 上传到 web-02 CloudBase（commission_bridged/）
  ④ 返回新 fileId/fileKey → 写入 resumeStore.uploadedFileId/Key
                            ↓
word_processor_web 正常使用 web-02 CloudBase 存储中的文件进行后续处理
```

---

### 文件完整生命周期

```
【简历优化】
  浏览器上传 .docx
      ↓ @cloudbase/js-sdk 直传
  web-02 CloudBase 存储 / web_uploads/xxx.docx   ← fileID: cloud://web-02-...
      ↓ cloud.getTempFileURL() 获取临时 URL
  word_processor_web 读取并处理
      ↓ cos.putObject() 写入
  cloud1-4g7z1... COS 桶 / documents/xxx.docx     ← 数据万象 CI 桶
      ↓ CI 文档转图片服务
  预览图 PNG URL（多页）
      ↓ 员工编辑（WPS）/ 打包导出
  cloud1-4g7z1... COS 桶 / documents/enhanced_xxx.docx

【识别创建】
  浏览器上传参考简历 .docx
      ↓ @cloudbase/js-sdk 直传
  web-02 CloudBase 存储 / recognition_uploads/xxx.docx
      ↓ 提取文本 → AI 提取 → AI 润色
  word_processor_web 下载 Word 模板
      ↓ cloud.getTempFileURL() 读取模板
  web-02 CloudBase 存储 / template_all/template_work_word/r_1.docx
      ↓ docxtemplater 占位符填充 → cos.putObject()
  cloud1-4g7z1... COS 桶 / documents/xxx.docx
      ↓ CI 生图
  预览图 PNG URL

【代做工单（小程序→网页）】
  小程序客户上传 .docx
      ↓ wx.cloud.uploadFile 直传
  jk3 微信 CloudBase 存储 / client_uploads/{openid}/xxx.docx  ← cloud://jk3-...
      ↓ staff_bridge_file（服务端中转）
  web-02 CloudBase 存储 / commission_bridged/xxx.docx   ← cloud://web-02-...
      ↓ 进入简历优化正常流程（同上）
```

---

### 数据万象（CI）使用说明

- **开通位置**：腾讯云控制台 → 对象存储 → 存储桶 `cloud1-4g7z1dndd718b661-1340279912` → 数据万象
- **使用功能**：文档预览（DOCX → PNG，支持多页）
- **调用方式**：`word_processor_web` 通过 `@tencentcloud/cos-ci` SDK 调用，需配合 `TENCENT_SECRET_ID/KEY` 密钥
- **返回格式**：每页对应一个图片 URL，前端以数组形式存储（`originalPreviewUrls[]` / `polishedPreviewUrls[]`）
- **注意事项**：CI 调用必须在已开通数据万象的 Bucket（存储桶 ②）上执行；对 web-02 CloudBase 默认存储桶调用 CI 会失败

---

### 关键配置速查表

| 配置项 | 值 | 使用位置 |
|--------|-----|---------|
| 腾讯云 CloudBase 主环境 ID | `web-02-7gsm40y513e0dd07` | `VITE_CLOUDBASE_ENV_ID`、各云函数 `cloud.init` |
| 微信小程序 CloudBase 环境 ID | `jk3-2gy9419jcb1c7fb7` | `miniprogram/app.js` `CLOUD_ENV` |
| web-02 CloudBase 存储桶名 | `7765-web-02-7gsm40y513e0dd07-1340085102` | Cloud fileID 前缀（内部自动使用）|
| 数据万象 COS 桶名（`TENCENT_BUCKET`）| `cloud1-4g7z1dndd718b661-1340279912` | `word_processor_web`、`doc_processor_web` 环境变量 |
| COS 地域（`TENCENT_REGION`）| `ap-shanghai` | `word_processor_web`、`doc_processor_web`、`tools_web`、`commission_web` 环境变量 |
| 小程序 AppID | `wx05b48e6f0254308d` | `commission_web` 环境变量 `WX_APPID`、`miniprogram/project.config.json` |
| CloudBase HTTP 服务域名 | `web-02-7gsm40y513e0dd07-1340085102.ap-shanghai.app.tcloudbase.com` | `VITE_API_BASE_URL`、小程序 `CLOUD_URL` |

---

## 后端云服务详解

### 云函数：`auth_clo`

**职责**：员工身份认证与账号 CRUD 管理，支持角色层级（superadmin / admin / editor）与账号冻结机制

| action | 权限 | 说明 |
|--------|------|------|
| `seed` | 公开（一次性）| 首次部署初始化第一个 `superadmin` 账号；DB 中已有管理员后自动禁用 |
| `login` | 公开 | 账号+密码登录，校验冻结状态，生成新 `sessionId`，返回 JWT（3天有效期）|
| `verify` | 已登录 | 验证 JWT 签名 + `sessionId` 一致性 + 冻结状态，返回 userId/name/role |
| `changePassword` | 已登录 | 员工自助修改密码（需提供旧密码）|
| `listUsers` | 管理员 | 查询员工列表（superadmin 看全部；admin 只看 editor）|
| `createUser` | 管理员 | 创建账号；角色受权限约束（admin 只能创建 editor）|
| `toggleUser` | 管理员 | 启用或停用指定账号；受角色层级约束 |
| `deleteUser` | 管理员 | 删除账号；受角色层级约束 |
| `adminResetPassword` | 管理员 | 直接重置任意员工密码；受角色层级约束 |
| `changeUserRole` | 总管理员 | 切换角色 editor ↔ admin；不能改自己；不可设为 superadmin |
| `unfreezeUser` | 管理员 | 解冻账号，写入 `unfrozenAt` 时间戳（重置自动冻结计数器）|

**角色权限约束（`assertCanManage`）**：
- `admin` 只能管理 `editor` 账号
- 任何角色均不能管理 `superadmin` 账号
- `changeUserRole` 仅 `superadmin` 可调用

**账号冻结机制**：
- `login` / `verify` 均检查 `user.frozen`，冻结账号返回 401 + "账号已被安全系统冻结"提示
- 冻结字段：`frozen`（bool）、`frozenAt`（ISO）、`frozenReason`（string）
- 解冻字段：`frozen: false` + `unfrozenAt`（ISO），用于 `tools_web` 重置自动冻结计数

**单设备登录机制**：同一账号新设备登录时 DB `sessionId` 被覆盖，旧设备下次 `verify` 时返回 401，前端弹提示后跳登录页

**依赖**：`jsonwebtoken`、`bcryptjs`、`crypto`（Node 内置）、`wx-server-sdk`  
**数据库**：`users`（字段：`email`、`password`（hash）、`name`、`role`、`isActive`、`sessionId`、`frozen`、`frozenAt`、`frozenReason`、`unfrozenAt`、`createdAt`、`lastLoginAt`）  
**权限**：集合设置为 `ADMINONLY`

---

### 云函数：`ai_service_web`

**职责**：所有 AI 大模型调用（DeepSeek API）

**简历优化模式**：

| action | 说明 |
|--------|------|
| `enhance_analyze` | 传入段落数组 + 岗位信息，返回综合评分 + 五维雷达图分数 + 文字分析 |
| `enhance_extract_sections` | 「两步提取法」识别各经历模块，每条经历独立返回，防止合并 |
| `enhance_polish_section` | 单模块 AI 润色（传入字数范围、润色强度、输出格式）|
| `enhance_generate_summary` | 生成结构化润色解析总结 |

**识别创建模式**：

| action | 说明 |
|--------|------|
| `recognition_extract_all` | **模板驱动提取**：接收 `moduleSpecs`（模板标识库 + 记录库计算结果），AI 仅提取指定模块和条数，保留 content 原文不修改 |

> **字数调节五档**（简历优化）：精简（-60）/ 较短（-30）/ 正常（0）/ 较长（+50）/ 超长（+100），偏移量加减于基准字数范围。

---

### 云函数：`word_processor_web`

**职责**：Word 文档处理全流程

**简历优化模式**：

| action | 说明 |
|--------|------|
| `extractParagraphs` | PizZip 解析 DOCX XML，提取段落文本及格式标记 |
| `replaceByParagraph` | 润色文本逐段替换回 DOCX XML，生成新文档 + 预览图 |
| `docToImage` | 腾讯 CI 将 DOCX 转为 PNG 预览图（支持多页）|
| `getDownloadUrl` | 为 COS 文件生成带时效的预签名下载 URL |

**识别创建模式**：

| action | 说明 |
|--------|------|
| `generateResume` | 从 web-2 云存储下载对应 Word 模板 → `docxtemplater` 替换占位符 → 上传新文档 → CI 生成预览图 |
| `getRecognitionTemplateUrls` | 为 R1~R5 五套模板（指定身份）批量生成预览图临时 URL |

> `isRecognitionTemplate(templateId)` 判断 `word_r_*` 前缀；`buildRecognitionTemplateCloudId(templateId, userType)` 构建 web-2 存储路径，与简历优化模式的 cloud2 路径完全隔离。

**依赖**：`pizzip`、`docxtemplater`、`xml2js`、`cos-nodejs-sdk-v5`、`@tencentcloud/cos-ci`、`jsonwebtoken`

---

### 云函数：`doc_processor_web`

**职责**：WPS WebOffice 在线编辑的完整后端支撑

**WPS 标准回调协议**（WPS 服务器主动调用）：

| 路径 | 说明 |
|------|------|
| `GET /v3/3rd/files/:file_id` | 返回文件名、大小、版本等元信息 |
| `GET /v3/3rd/files/:file_id/download` | 返回 COS 预签名下载 URL |
| `GET /v3/3rd/files/:file_id/permission` | 返回用户读写权限（read/write）|
| `GET /v3/3rd/users` | 返回当前用户信息 |
| `POST /upload/prepare` | 保存前准备，声明支持 sha1 校验 |
| `POST /upload/address` | 返回 COS 预签名上传 PUT URL |
| `POST /upload/complete` | 保存完成确认 |

**前端 API**（前端通过 `/doc_processor_web` 调用）：

| action | 说明 |
|--------|------|
| `get_wps_open_config` | 返回 `appId`、`fileId`（COS 文件名中的13位时间戳）、`token` |
| `get_edited_preview` | 编辑保存后重新调用腾讯 CI 生成预览图 |

**依赖**：`cos-nodejs-sdk-v5`、`axios`、`wx-server-sdk`

---

### 云函数：`tools_web`

**职责**：工具箱各功能 + 打包导出 + 邮件发送 + 工单系统 CRUD + **安全监管日志**

**证件照**：

| action | 说明 |
|--------|------|
| `getPhotoSizes` | 返回支持的证件照尺寸和背景色配置 |
| `generateIDPhoto` | 传统抠图：背景替换 + 尺寸裁切 |
| `generateAIIDPhoto` | AI 生成：Doubao API 换装/换背景 |

**打包与邮件**：

| action | 说明 |
|--------|------|
| `sendBundleEmail` | 将选中文件（Word/PDF/图片/解析/证件照）打包为 ZIP，通过 SMTP 发送到指定邮箱 |

**工单系统**（需 JWT 鉴权）：

| action | 权限 | 说明 |
|--------|------|------|
| `createWorkorder` | 已登录 | 开始润色时创建工单（状态：`uploaded`）|
| `updateWorkorderStatus` | 已登录（仅自己）| 润色完成→`polished`；打包/邮件成功→`exported`（同步 resumeName、fileKey、previewUrls）|
| `updateEmployeeNote` | 已登录（仅自己）| 员工更新工单备注（500字）|
| `requestDeleteWorkorder` | 已登录（仅自己）| 标记 `deleteRequested: true`，等待管理员审批 |
| `listMyWorkorders` | 已登录 | 查询自己的工单列表（支持状态筛选、分页）|
| `adminListAllWorkorders` | 管理员 | 查询所有工单（可按 userId / status 筛选，最多 200 条）|
| `adminUpdateWorkorder` | 管理员 | 修改工单状态、管理员备注、撤销删除申请 |
| `adminDeleteWorkorder` | 管理员 | 永久删除工单记录 |

**安全监管**（`logSecurityEvent` 无需鉴权；其余管理员接口需鉴权）：

| action | 权限 | 说明 |
|--------|------|------|
| `logSecurityEvent` | 公开（无鉴权）| 写入安全事件记录（eventType / userId / userName / detail / pageUrl / createdAt）；若员工 1 小时内触发冻结类事件 ≥ 3 次，自动冻结账号并返回 `autoFrozen: true` |
| `adminListSecurityLogs` | 管理员 | 查询安全日志列表（可按 userId / eventType 筛选）|
| `adminGetHighRiskUsers` | 管理员 | 统计 1 小时内冻结类事件频次，返回高危员工排行 |

**冻结类事件**（`FREEZE_EVENT_TYPES`，触发自动冻结计数）：`printscreen`、`save_page`、`print_page`、`view_source`、`devtools`  
**仅记录不计冻结**：`copy`、`drag`  
**管理员豁免**：`admin` / `superadmin` 角色触发事件只记录，不触发自动冻结  
**解冻重置**：解冻后 `unfrozenAt` 时间戳作为计数起点，历史记录不再计入后续冻结判断

**依赖**：`axios`、`wx-server-sdk`、`cos-nodejs-sdk-v5`、`jsonwebtoken`、`nodemailer`、`jszip`、`pdf-lib`

---

### 云函数：`commission_web`

**职责**：代做工单全生命周期管理，同时服务小程序客户端（无 JWT）和网页员工端（需 JWT）

**部署环境**：`web-02-7gsm40y513e0dd07`，HTTP 触发路径 `/commission_web`

**客户端 Actions**（凭 `openid`，无 JWT 鉴权）：

| action | 说明 |
|--------|------|
| `client_login` | `wx.login` 获取的 `code` → 调用微信 `jscode2session` API 换取 `openid`，缓存至小程序 globalData |
| `client_create_order` | 创建简历优化工单，生成可读编号 `CO-YYYYMMDD-NNN`，初始状态 `pending` |
| `client_get_orders` | 查询当前客户（按 openid）所有工单列表，按创建时间倒序 |
| `client_get_order_detail` | 查询单个工单的进度字段（保护隐私，邮箱脱敏处理） |

**员工端 Actions**（需 JWT）：

| action | 说明 |
|--------|------|
| `staff_list_orders` | 按状态筛选工单（`pending`/`claimed`/`completed`），支持分页 |
| `staff_claim_order` | 接取工单（写入 `claimedBy/At`）；支持配额模式下的每日接单数限制 |
| `staff_complete_order` | 标记工单已完成（员工只能完成自己接取的单；**管理员可完成任意工单**）|
| `staff_save_progress` | **保存制作进度**：将 store 快照写入 `commission_orders.savedProgress`，工单仍保持 `claimed` 状态 |
| `staff_send_preview` | **回传对比图**：将水印预览图 URL + 分析摘要 + 润色解析报告写入 `commission_orders`，并异步推送微信订阅消息通知客户 |
| `staff_send_analysis` | **回传分析报告**：将 AI 分析结果（`clientAnalysisData`）写入 `commission_orders`，小程序客户可在「简历分析阶段」步骤查看 |
| `staff_get_file_url` | 通过微信 `tcb/batchdownloadfile` API 生成 `jk3` 环境文件的 7 天临时下载链接（供浏览器直接下载）|
| `staff_bridge_file` | **跨环境文件中转**：获取 access_token → 生成 jk3 临时 URL → `axios` 服务端下载（绕过浏览器 CORS）→ `cloud.uploadFile` 上传到 web-02 → 返回新 `fileId`/`fileKey` |

**微信订阅消息**：`staff_send_preview` 成功后异步调用 `sendSubscribeMessage`，向客户 `openid` 推送模板消息（`tmplId: JjmTIHO6iRrDLfRkZNutEfmxo-eLabK5tFmJYVLX8IY`）。`access_token` 通过 `getWxAccessToken()` 获取，优先读取 `system_cache` 集合数据库缓存（所有实例共享），内存作二级缓存（同实例复用），避免多实例并发刷新导致互踢。

**管理员 Actions**（需管理员 JWT）：

| action | 说明 |
|--------|------|
| `admin_assign_order` | 手动将待接取工单分配给指定员工（直接设置 `claimedBy` 状态变为 `claimed`）|
| `admin_get_settings` | 读取工单分配设置（`commission_settings.global`）|
| `admin_update_settings` | 更新分配模式：`free`（自由抢单）/ `custom`（按员工配额分配）|
| `admin_get_daily_stats` | 统计今日各员工接单数量 |

**环境变量**：`JWT_SECRET`、`WX_APPID`（`wx05b48e6f0254308d`）、`WX_APPSECRET`、`TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`、`TENCENT_REGION`、`TENCENT_BUCKET`

**依赖**：`jsonwebtoken`、`cos-nodejs-sdk-v5`、`axios`、`crypto`、`wx-server-sdk`

---

### 云存储（COS）

| 路径前缀 | 内容 |
|---------|------|
| `web_uploads/` | 简历优化：用户上传的原始 DOCX（@cloudbase/js-sdk 浏览器直传）|
| `web_uploads/id_photos/` | 证件照制作：用户上传的原始照片 |
| `recognition_uploads/` | 识别创建：用户上传的参考简历 DOCX（@cloudbase/js-sdk 浏览器直传）|
| `documents/` | 润色后 / 生成后的 DOCX 文档（含 WPS 在线编辑保存的版本）|
| `previews/` / CI 输出 | 简历预览图 PNG |
| `template_all/` | 识别模式 Word 模板和预览图（web-2 环境）<br>路径：`template_all/template_{userType}_word/r_{n}.docx`<br>预览图：`template_all/template_{userType}_images/r_{n}.jpg` |

---

### 云数据库

**web-02 环境**（内部工具 + 代做工单）：

| 集合 | 权限 | 说明 |
|------|------|------|
| `users` | `ADMINONLY` | 员工账号；字段：`email`、`password`（bcrypt hash）、`name`、`role`（superadmin/admin/editor）、`isActive`、`sessionId`、`frozen`、`frozenAt`、`frozenReason`、`unfrozenAt`、`createdAt`、`lastLoginAt` |
| `workorders` | `ADMINONLY` | 员工内部工单记录；字段见工单数据结构表；编号格式 `WO-YYYYMMDD-NNN` |
| `security_logs` | `ADMINONLY` | 安全事件日志；字段：`userId`、`userName`、`eventType`（printscreen/save_page/print_page/view_source/devtools/copy/drag/contextmenu）、`detail`、`pageUrl`、`createdAt` |
| `commission_orders` | `ADMINONLY` | 代做工单；字段见代做工单数据结构表；编号格式 `CO-YYYYMMDD-NNN` |
| `commission_settings` | `ADMINONLY` | 工单分配配置（单文档 `global`）；字段：`distributionMode`（`free`/`custom`）、`staffQuotas`（`{userId: dailyLimit}`）、`updatedAt` |
| `system_cache` | `ADMINONLY` | 系统级缓存，目前存储微信 `access_token`（文档 key=`wx_access_token`；字段：`token`、`expiry`（Unix 毫秒）、`updatedAt`）；供 `commission_web` 多实例共享，避免并发刷新互踢 |

> 所有集合均设置为 `ADMINONLY`，客户端无法直接读写，所有访问均通过云函数 Admin SDK 执行。

**jk3 环境**（微信小程序 CloudBase）：

| 存储路径 | 内容 |
|---------|------|
| `client_uploads/{openid}/{timestamp}_{filename}` | 小程序客户上传的原始简历文件（DOCX）|

> `jk3` 是小程序关联的微信托管 CloudBase 环境，与 `web-02`（腾讯云托管）相互独立。员工制作时通过 `staff_bridge_file` 服务端中转，跨环境获取客户文件。

---

## 项目文件结构

```
web-studio/
├── index.html
├── vite.config.js
├── package.json
├── .env.development
├── .env.production
├── README.md
├── RECOGNITION_MODE_PLAN.md        ← 识别模式开发计划参考文档（原小程序版）
├── COLLECTION_MINIPROGRAM_PLAN.md  ← 信息采集小程序开发计划文档
├── COMMISSION_DEPLOY_GUIDE.md      ← 代做工单系统 + 小程序部署配置测试指南
│
├── public/
│   ├── robots.txt                  ← 搜索引擎爬虫屏蔽（Disallow: /）
│   ├── sw.js                       ← Service Worker：Cache-First 缓存 WPS CDN 资源
│   └── libs/
│       └── web-office-sdk.umd.js   ← WPS WebOffice SDK v2.0.7（本地托管，非 CDN）
│
├── src/
│   ├── main.js                     ← 注册 Service Worker
│   ├── App.vue                     ← 根组件；挂载时验证 token 有效性，过期自动跳登录
│   │
│   ├── router/
│   │   └── index.js                ← 路由配置 + 全局登录守卫（/login / /）
│   │
│   ├── config/
│   │   └── recognitionTemplateConfig.js  ← 识别模式模板标识库 + 记录库
│   │                                        TEMPLATE_REQUIRED_MODULES
│   │                                        TEMPLATE_ACTUAL_RECORDS_COUNT
│   │                                        辅助函数（getRequiredModules 等）
│   │
│   ├── stores/
│   │   ├── auth.js                 ← 认证状态（token / userId / userName / role / isAdmin / isSuperAdmin）
│   │   ├── resumeEnhance.js        ← 简历优化全流程状态（stage 状态机）；含 draftInfo/saveDraft/restoreDraft/clearDraft
│   │   ├── recognition.js          ← 识别创建全流程状态（phase 状态机）
│   │   │                              含 templateModules / templateRecordCounts
│   │   ├── idPhoto.js              ← 证件照制作状态
│   │   ├── workorder.js            ← 内部工单状态；currentId 持久化 localStorage
│   │   └── commission.js           ← 代做工单状态；activeOrderId/activeOrderData 持久化 localStorage
│   │                                  键：studio_commission_active_order
│   │
│   ├── api/
│   │   ├── request.js              ← Axios 封装（自动附加 JWT；401 弹提示→清状态→跳登录）
│   │   ├── auth.js                 ← 认证 + 账号管理接口（含管理员专属 CRUD）
│   │   ├── ai.js                   ← AI 接口（简历优化四个 action）
│   │   ├── word.js                 ← 文档接口（简历优化）
│   │   ├── recognition.js          ← 识别创建专用接口
│   │   │                              recognitionExtractAll / generateResume
│   │   │                              getRecognitionTemplateUrls
│   │   │                              uploadRecognitionFile（COS 直传）
│   │   │                              re-export: extractWordParagraphs / docToImage / getTempDownloadUrl
│   │   ├── docProcessor.js         ← WPS 在线编辑接口 + 文件代理下载
│   │   │                              getWpsOpenConfig / getEditedPreview
│   │   │                              getFileBase64 / getUrlBase64（COS/URL → base64，解决 CORS）
│   │   ├── tools.js                ← 工具箱接口（证件照 + 邮件 + 工单 CRUD）
│   │   └── commission.js           ← 代做工单接口（→ commission_web）
│   │                                  apiListCommissionOrders / apiClaimOrder
│   │                                  apiCompleteCommissionOrder
│   │                                  apiGetCommissionFileUrl（生成临时下载链接）
│   │                                  apiBridgeCommissionFile（跨环境文件中转）
│   │                                  apiAdminAssignOrder / apiAdminGet/UpdateCommissionSettings
│   │                                  apiAdminGetDailyStats
│   │
│   ├── composables/
│   │   ├── useResumeAnalyze.js     ← 简历优化：分析流程（提取→分析→识别→预览）
│   │   ├── useResumePolish.js      ← 简历优化：润色流程 + levelToWordCountRange()
│   │   ├── useRecognitionExtract.js← 识别创建：内容提取流水线
│   │   │                              uploadAndExtractWord / runExtraction
│   │   │                              自动调用 buildModuleSpecList 传给云函数
│   │   ├── useRecognitionPolish.js ← 识别创建：润色+生成流水线
│   │   │                              按模板过滤润色模块 / buildTemplateData（按记录数截断）
│   │   │                              / runPolishAndGenerate
│   │   └── useAntiCapture.js       ← 安全监管：行为拦截与日志上报
│   │                                  键盘拦截（save/print/devtools/view-source）
│   │                                  右键/选文禁用 / 拖拽禁用
│   │                                  PrintScreen 检测 / 复制记录
│   │                                  自动冻结检测 → 立即踢出
│   │
│   ├── views/
│   │   ├── Login.vue               ← 登录页（开发环境一键填充管理员账号）
│   │   └── Home.vue                ← 主应用 Shell（多模式切换 + 各阶段组件渲染）
│   │                                  featureMode='optimize'：简历优化流程
│   │                                  featureMode='create'：简历定制流程（接取定制工单后）
│   │                                    rStore.phase='done' 时渲染 RecognitionDoneStage
│   │                                  离开简历定制模式时有暂存弹窗保护（同优化模式）
│   │
│   ├── components/
│   │   ├── common/
│   │   │   └── BottomSheet.vue     ← 通用上滑弹窗
│   │   ├── resume-enhance/         ← 简历优化模式组件
│   │   │   ├── UploadStage.vue     ← 上传参数配置；接取代做工单后自动预填参数
│   │   │   ├── ResultStage.vue     ← 分析报告展示；含「回传分析报告」按钮（代做工单模式）
│   │   │   ├── DoneStage.vue       ← 打包导出/保存进度/对比图回传；多页预览图完整显示；收起/展开对比
│   │   │   └── WpsEditorModal.vue  ← WPS WebOffice 在线编辑弹窗（持久化 iframe）
│   │   ├── recognition/            ← 简历定制模式组件（员工网页端接取简历定制工单后使用）
│   │   │   ├── RecognitionInputStage.vue    ← 模板选择 + 旧简历上传 + 开始识别
│   │   │   ├── RecognitionConfirmStage.vue  ← 识别结果确认 + 开始润色生成
│   │   │   ├── RecognitionPreviewStage.vue  ← 生成简历预览 + 导出 Word
│   │   │   └── RecognitionDoneStage.vue     ← 简历定制完成阶段（润色对比页）
│   │   │                                       与 DoneStage 功能对齐：在线编辑/重新开始
│   │   │                                       打包导出后自动更新工单状态→已完成
│   │   │                                       WPS 在线编辑（preloadWpsSdk/preWarmWpsConfig）
│   │   │                                       回传成品/保存进度（参照优化模式）
│   │   ├── tools/                  ← 工具箱组件
│   │   │   ├── ToolsHub.vue        ← 九宫格工具入口
│   │   │   └── IDPhotoMaker.vue    ← 证件照制作（上传→规格→背景→AI处理→下载）
│   │   ├── admin/                  ← 员工管理组件（仅管理员可见）
│   │   │   └── AdminPage.vue       ← Tab1 员工管理 + Tab2 工单管理（含业务类型列）+ Tab3 安全日志
│   │   ├── workorder/              ← 内部工单系统组件
│   │   │   └── WorkorderPage.vue   ← 工单列表（含业务类型列）；状态筛选/展开详情/员工备注/申请删除
│   │   └── commission/             ← 代做工单系统组件
│   │       └── CommissionPage.vue  ← 待接取/制作中/已完成三Tab；含业务类型列（定制/优化徽标）
│   │                                  接取跳转功能区（优化→UploadStage；定制→RecognitionDoneStage）
│   │                                  工单详情弹窗（下载客户原始文件）
│   │
│   └── utils/
│       ├── canvas.js               ← 雷达图 Canvas 绘制
│       ├── cloudbase.js            ← @cloudbase/js-sdk 初始化（单例）
│       ├── logger.js               ← 日志封装
│       ├── wpsSdk.js               ← WPS SDK 加载 + 配置缓存预热工具
│       │                              preloadWpsSdk / loadWpsSdk
│       │                              preWarmWpsConfig / getCachedWpsConfig / clearWpsConfigCache
│       └── wx-compat.js            ← wx.* API 兼容层（已基本废弃）
│
├── cloud-functions/
│   ├── auth_clo/
│   │   ├── index.js
│   │   ├── index_merged.js         ← 完整认证 + 账号 CRUD 逻辑
│   │   └── package.json            ← jsonwebtoken, bcryptjs, wx-server-sdk
│   ├── ai_service_web/
│   │   ├── index_merged.js         ← 含 recognition_extract_all（模板驱动提示词）
│   │   │                              MINIPROGRAM_PUBLIC_ACTIONS 白名单（无需 JWT）：
│   │   │                                recognition_extract_all（简历定制小程序端直接调用）
│   │   └── package.json
│   ├── word_processor_web/
│   │   ├── index_merged.js         ← 含 generateResume / getRecognitionTemplateUrls
│   │   │                              isRecognitionTemplate / buildRecognitionTemplateCloudId
│   │   │                              MINIPROGRAM_PUBLIC_ACTIONS 白名单（无需 JWT）：
│   │   │                                extractParagraphs（简历定制旧简历段落提取）
│   │   │                                getRecognitionTemplateUrls（模板预览图）
│   │   └── package_web.json        ← pizzip, docxtemplater, cos-nodejs-sdk-v5, @tencentcloud/cos-ci
│   ├── doc_processor_web/
│   │   ├── index.js
│   │   ├── index_merged.js         ← WPS 回调协议（files/download/permission/users）
│   │   │                              三段式保存（prepare/address/complete）
│   │   │                              前端 API（get_wps_open_config / get_edited_preview）
│   │   │                              文件代理（get_file_base64 / get_url_base64）
│   │   └── package.json            ← cos-nodejs-sdk-v5, axios, wx-server-sdk
│   ├── tools_web/
│   │   ├── index_merged.js         ← 证件照 + 邮件打包 + 工单 CRUD（8 个 action）
│   │   └── package.json            ← cos-nodejs-sdk-v5, jsonwebtoken, axios, wx-server-sdk,
│   │                                  nodemailer, jszip, pdf-lib
│   └── commission_web/
│       ├── index.js                ← 代做工单云函数（全量逻辑）
│       │                              客户端：client_login / client_create_order（简历优化）
│       │                                      client_create_recognition_order（简历定制）
│       │                                        接收 extractedData + 旧简历 fileKey 等定制参数
│       │                                        businessType = 'resume_customize' 写入工单
│       │                                      client_bridge_resume_file（简历定制文件中转）
│       │                                        小程序上传文件从 jk3 中转到 web-02
│       │                                      client_get_orders / client_get_order_detail
│       │                              员工端：staff_list_orders / staff_claim_order
│       │                                      staff_complete_order / staff_get_file_url
│       │                                      staff_save_progress（保存制作进度快照）
│       │                                      staff_send_preview（回传对比图+解析；触发订阅消息）
│       │                                      staff_send_analysis（回传简历分析报告）
│       │                                      staff_bridge_file（跨环境文件中转）
│       │                              管理员：admin_assign_order
│       │                                      admin_get/update_settings
│       │                                      admin_get_daily_stats
│       │                              辅助：getWxAccessToken()（DB 缓存 access_token）
│       │                                    sendSubscribeMessage()（微信订阅消息推送）
│       └── package.json            ← jsonwebtoken, cos-nodejs-sdk-v5, axios, wx-server-sdk
│
├── miniprogram/                    ← 微信小程序采集端（微信开发者工具打开）
│   ├── app.js                      ← 全局配置；ensureCloudInited() 懒加载；onError 全局兜底
│   ├── app.json                    ← 页面路由注册（4个页面）；lazyCodeLoading
│   ├── app.wxss                    ← 全局样式
│   ├── project.config.json         ← AppID / libVersion（3.7.8 稳定版）/ 编译设置
│   ├── sitemap.json
│   ├── pages/
│   │   ├── index/                  ← 首页（功能入口 + 通知系统）
│   │   │   ├── index.js            ← 懒加载 openid；_checkPendingPreviews（双路通知检测）
│   │   │   ├── index.wxml          ← 绿色「制作完成待确认」+ 蓝色「分析报告已回传」badge
│   │   │   └── index.wxss
│   │   ├── order-submit/
│   │   │   ├── optimize.js         ← 简历优化：单页表单；草稿持久化；wx.cloud.uploadFile 直传
│   │   │   ├── optimize.wxml
│   │   │   ├── optimize.wxss
│   │   │   ├── customize.js        ← 简历定制：三步子页面流程
│   │   │   │                          step='template'：选择模板 + 求职者身份（_loadTemplatePreviews）
│   │   │   │                          step='params'：填写润色参数 + 上传旧简历文件
│   │   │   │                          step='recognizing'：调用 word_processor_web.extractParagraphs
│   │   │   │                                              + ai_service_clo.recognition_extract_all
│   │   │   │                          step='review'：展示 AI 识别结果，检测 gapModules 空缺
│   │   │   │                          step='supplement'：补填缺失字段/模块表单（通用 _mod/_field 元数据）
│   │   │   │                          step='submitting/done'：提交工单并显示成功
│   │   │   │                          集成 recognitionTemplateConfig 标识库+记录库（与网页端完全一致）
│   │   │   │                          SKIP_PAYMENT 开关（当前 true，正式上线改 false）
│   │   │   ├── customize.wxml      ← 三步步骤指示器 + 各步骤独立区块；补填表单双层 wx:for
│   │   │   └── customize.wxss      ← step-bar/step-circle/step-line；card/picker/upload；supplement 样式
│   │   ├── order-status/
│   │   │   ├── index.js            ← 订单列表；onShow 自动刷新；下拉刷新
│   │   │   ├── index.wxml          ← biz-tag 统一业务类型徽标（定制/优化）
│   │   │   └── index.wxss          ← .biz-tag / .biz-tag--optimize / .biz-tag--recognition
│   │   └── order-detail/
│   │       ├── index.js            ← 订单详情；buildSteps（动态时间线）；分析报告/成品预览弹窗
│   │       ├── index.wxml          ← 时间线步骤（showAnalysisBtn/showPreviewBtn）；两套独立弹窗
│   │       └── index.wxss
│   └── utils/
│       ├── request.js              ← HTTP 封装；ensureOpenid() openid 缓存管理
│       │                              post（→commission_web）/ paymentPost（→payment_web）
│       │                              aiPost（→ai_service_clo，无 JWT，90s 超时）
│       │                              wordPost（→word_processor_web，无 JWT，120s 超时）
│       └── util.js                 ← 标签常量映射 + 时间/邮箱格式化工具
│
└── OPERATIONS.md                   ← 生产环境操作手册（部署/更新/访问控制/员工管理/费用/应急）
```

---

## 环境配置

| 变量 | 示例值 | 说明 |
|------|--------|------|
| `VITE_API_BASE_URL` | `https://web-02-7gsm40y513e0dd07-1340085102.ap-shanghai.app.tcloudbase.com` | CloudBase HTTP 访问服务域名 |
| `VITE_CLOUDBASE_ENV_ID` | `web-02-7gsm40y513e0dd07` | CloudBase 环境 ID（@cloudbase/js-sdk 直传文件用）|
| `VITE_JWT_SECRET` | `studio_jwt_secret_2026_please_change` | JWT 验证密钥，**必须与云函数 `JWT_SECRET` 完全一致** |

> ⚠️ 正式上线前必须将 `VITE_JWT_SECRET` 和云函数 `JWT_SECRET` 环境变量改为 32 位以上强随机字符串。

**云函数环境变量**：

| 云函数 | 环境变量 | 说明 |
|--------|---------|------|
| `auth_web` | `JWT_SECRET` | JWT 签名密钥 |
| `ai_service_web` | `DEEPSEEK_API_KEY` | DeepSeek API 密钥 |
| `word_processor_web` | `TENCENT_SECRET_ID`、`TENCENT_SECRET_KEY`、`TENCENT_REGION`、`TENCENT_BUCKET` | COS / CI 操作凭证 |

---

## 腾讯云 CloudBase 配置

| 项目 | 值 |
|------|----|
| 环境名称 | `web-02` |
| 环境 ID | `web-02-7gsm40y513e0dd07` |
| HTTP 访问域名 | `web-02-7gsm40y513e0dd07-1340085102.ap-shanghai.app.tcloudbase.com` |
| 云数据库集合 | `users`、`workorders`、`security_logs`、`commission_orders`、`commission_settings`（均 ADMINONLY）|
| 云存储 Bucket | `7765-web-02-7gsm40y513e0dd07-1340085102.cos.ap-shanghai.myqcloud.com` |

**HTTP 访问服务路由**：

| 触发路径 | 关联云函数 | 作用 |
|---------|----------|------|
| `/auth_clo` | `auth_clo` | 员工认证 + 账号 CRUD |
| `/ai_service_clo` | `ai_service_web` | AI 分析与润色 |
| `/word_processor_clo` | `word_processor_web` | 文档处理 |
| `/doc_processor_web` | `doc_processor_web` | WPS 在线编辑回调 |
| `/tools_web` | `tools_web` | 工具箱（证件照 + 邮件打包 + 工单 CRUD）|
| `/commission_web` | `commission_web` | 代做工单（小程序客户端 + 网页员工端）|

---

## API 接口总表

### 认证接口（`api/auth.js` → `auth_clo`）

| 前端函数 | action | 说明 |
|---------|--------|------|
| `login(email, password)` | `login` | 登录，返回 JWT token |
| `verifyToken()` | `verify` | 验证 token 有效性 |
| `createUser(data)` | `createUser` | 创建员工账号（管理员）|
| `listUsers()` | `listUsers` | 获取员工列表（superadmin 看全部，admin 只看 editor）|
| `toggleUser({ userId, isActive })` | `toggleUser` | 启用/停用账号（管理员）|
| `deleteUser({ userId })` | `deleteUser` | 删除账号（角色层级约束）|
| `adminResetPassword({ userId, newPassword })` | `adminResetPassword` | 重置密码（管理员）|
| `changeUserRole({ userId, role })` | `changeUserRole` | 修改角色（仅总管理员）|
| `changePassword({ oldPassword, newPassword })` | `changePassword` | 自助改密（本人）|
| `unfreezeUser({ userId })` | `unfreezeUser` | 解冻账号，重置冻结计数器（管理员）|

### WPS 在线编辑接口（`api/docProcessor.js` → `doc_processor_web`）

| 前端函数 | action | 说明 |
|---------|--------|------|
| `getWpsOpenConfig({ fileKey })` | `get_wps_open_config` | 获取 appId / fileId / token |
| `getEditedPreview({ fileKey })` | `get_edited_preview` | 编辑后重新生成预览图 |

### AI 接口（`api/ai.js` → `ai_service_web`）

**简历优化**：

| 前端函数 | action | 说明 |
|---------|--------|------|
| `enhanceAnalyze(data)` | `enhance_analyze` | 简历综合分析（评分+五维+文字）|
| `enhanceExtractSections(data)` | `enhance_extract_sections` | 各模块识别提取 |
| `enhancePolishSection(data)` | `enhance_polish_section` | 单模块 AI 润色 |
| `enhanceOptimizationSummary(data)` | `enhance_generate_summary` | 润色解析总结 |

**识别创建**（`api/recognition.js`）：

| 前端函数 | action | 说明 |
|---------|--------|------|
| `recognitionExtractAll({ textContent, userType, moduleSpecs })` | `recognition_extract_all` | 模板驱动内容提取，仅提取指定模块 |

### 文档接口（`api/word.js` → `word_processor_web` / COS）

| 前端函数 | 目标 | 说明 |
|---------|------|------|
| `uploadWordFile(file, onProgress)` | COS 直传 | 简历优化原始文档上传 |
| `extractParagraphs(data)` | `extractParagraphs` | 提取 DOCX 段落文本 |
| `replaceByParagraph(data)` | `replaceByParagraph` | 润色内容回填文档 |
| `docPreview(data)` | `docToImage` | 文档转图片预览 |
| `getDownloadUrl(data)` | `getDownloadUrl` | 获取带签名下载 URL |
| `downloadWordFile(url, filename)` | 浏览器导航 | `<a href>` 直接跳转下载，绕开 CORS |

### 识别创建接口（`api/recognition.js` → `word_processor_web` / COS）

| 前端函数 | 目标 | 说明 |
|---------|------|------|
| `uploadRecognitionFile(file, onProgress)` | COS 直传 | 参考简历上传到 `recognition_uploads/` |
| `extractWordParagraphs(data)` | `extractParagraphs` | 提取参考简历段落文本（复用简历优化 action）|
| `generateResume({ templateId, userType, userData })` | `generateResume` | 填充 Word 模板生成新简历 |
| `getRecognitionTemplateUrls({ userType })` | `getRecognitionTemplateUrls` | 获取 R1~R5 模板预览图临时 URL |
| `docToImage(data)` | `docToImage` | 文档转图片（复用）|
| `getTempDownloadUrl(data)` | `getDownloadUrl` | 获取下载 URL（复用）|

### 安全监管接口（`api/tools.js` → `tools_web`）

| 前端函数 | action | 说明 |
|---------|--------|------|
| `apiLogSecurityEvent({ eventType, userId, userName, detail, pageUrl })` | `logSecurityEvent` | 上报安全事件（无需鉴权）；返回 `{ autoFrozen }` |
| `apiAdminListSecurityLogs({ userId?, eventType? })` | `adminListSecurityLogs` | 查询安全日志（管理员）|
| `apiAdminGetHighRiskUsers()` | `adminGetHighRiskUsers` | 查询高危用户列表（管理员）|

### 代做工单接口（`api/commission.js` → `commission_web`）

**员工端**：

| 前端函数 | action | 说明 |
|---------|--------|------|
| `apiListCommissionOrders({ status?, page?, pageSize? })` | `staff_list_orders` | 按状态列出代做工单 |
| `apiClaimOrder({ _id })` | `staff_claim_order` | 接取工单（含配额检查）|
| `apiCompleteCommissionOrder({ _id, resultFileKey, resultPreviewUrls, linkedWorkorderId })` | `staff_complete_order` | 标记已完成（员工限自己；管理员可完成任意）|
| `apiSaveCommissionProgress({ _id, savedProgress })` | `staff_save_progress` | 保存制作进度快照（DoneStage store 状态），工单维持 claimed |
| `apiSendCommissionPreview({ _id, clientPreviewUrls, clientOriginalUrls, clientAnalysis, clientAnalysisReport? })` | `staff_send_preview` | 回传水印预览图 + 分析摘要（+可选润色解析报告），触发微信订阅消息 |
| `apiSendCommissionAnalysis({ _id, clientAnalysisData })` | `staff_send_analysis` | 回传简历 AI 分析报告（ResultStage 阶段），小程序在「简历分析阶段」步骤查看 |
| `apiGetCommissionFileUrl({ fileID })` | `staff_get_file_url` | 获取客户文件 7 天临时下载链接 |
| `apiBridgeCommissionFile({ fileID, fileName })` | `staff_bridge_file` | 服务端跨环境文件中转（jk3 → web-02）|

**管理员端**：

| 前端函数 | action | 说明 |
|---------|--------|------|
| `apiAdminAssignOrder({ _id, targetUserId, targetUserName })` | `admin_assign_order` | 手动分配工单给指定员工 |
| `apiAdminGetCommissionSettings()` | `admin_get_settings` | 读取分配配置 |
| `apiAdminUpdateCommissionSettings({ distributionMode, staffQuotas })` | `admin_update_settings` | 更新分配配置 |
| `apiAdminGetDailyStats()` | `admin_get_daily_stats` | 今日各员工接单统计 |

---

## 快速启动

```bash
# 1. 安装依赖
cd /Users/pengshubang/Desktop/web-studio
npm install

# 2. 启动开发服务器
npm run dev
# 访问 http://localhost:3000
# 管理员账号：admin  密码：jianda2026（登录页有「一键填充」快捷按钮）

# 3. 构建生产包
npm run build
# 输出至 dist/ 目录
```

### 微信小程序调试

1. 打开**微信开发者工具**，选择「小程序」→「导入项目」
2. 目录选择 `miniprogram/`，AppID 填 `wx05b48e6f0254308d`
3. 工具栏 → 详情 → 本地设置：确认「调试基础库」为 **3.7.8**（稳定版，非灰度）
4. 在开发者工具中关联 `jk3-2gy9419jcb1c7fb7` 微信 CloudBase 环境（用于文件上传）
5. 点击「编译」即可调试；上传发布在工具栏「上传」按钮

> 小程序合法域名（微信公众平台后台 → 开发管理 → 开发设置）：
> - `request` 合法域名：`https://web-02-7gsm40y513e0dd07-1340085102.ap-shanghai.app.tcloudbase.com`

---

## 与小程序源码的对应关系

小程序源码位于同目录 `SuperResumePro-2VE/`：

| 网页版文件 | 对应小程序文件 |
|-----------|--------------|
| `UploadStage.vue` | `pages/resume_enhance_pag/resume_enhance_pag.js`（`stage:'upload'`）|
| `ResultStage.vue` | 同上（`stage:'result'` + `onStartPolish`）|
| `DoneStage.vue` | 同上（`stage:'done'` + 字数调节 + 弹窗）|
| `useResumeAnalyze.js` | 同上（`_doAnalyze` / `_doExtract` / `_doPreview`）|
| `useResumePolish.js` | 同上（`_runPolish` / `_repolishModule` / `_buildCustomModuleItems`）|
| `stores/resumeEnhance.js` | 同上的 `data: {}` 对象 |
| `utils/canvas.js` | 同上的雷达图 Canvas 绘制函数 |
| `recognitionTemplateConfig.js` | `config_sys/template_config.js`（`TEMPLATE_REQUIRED_MODULES` / `TEMPLATE_ACTUAL_RECORDS_COUNT` / `MODULE_NUMBER_TO_TYPE`）|
| `RecognitionInputStage.vue` | `pages/recognition_mode/` 对应页（小程序端规划中）|
| `useRecognitionExtract.js` | 小程序对话模式中的提问清单构建逻辑（`ai_service_clo/recognition_extract_all`）|
| `useRecognitionPolish.js` | 小程序对话模式中的润色+生成逻辑 |
| `cloud-functions/auth_clo/` | `cloudfunctions_clo/auth_clo/index.js` |
| `cloud-functions/doc_processor_web/` | 新增（WPS WebOffice 回调，无小程序对应）|
| `cloud-functions/ai_service_web/` | `cloudfunctions_clo/ai_service_clo/index.js` |
| `cloud-functions/word_processor_web/` | `cloudfunctions_clo/word_processor_clo/index.js` |
