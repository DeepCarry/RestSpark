# 元气 · Rest Spark 设置中心 V1 交付记录

日期：2026-11-09（北京时间）

分支：`feature/settings-design-system-v1`，基线 `3bb9ba1b0206438740472505ea69d65b15b318b9`（最新 origin/trunk，开始时工作树干净）。未合并、推送、发布或修改仓库可见性。

## 四页前后对照

下列均为本次实际 macOS Electron 窗口内容截图，使用独立临时配置。改造后主截图来自打包后的 `Rest Spark.app`，运行时版本 **0.1.1**。截图不包含系统标题栏。原始截图来自原始源码运行；脚本入口在开发 Electron 中会显示 Electron 自身版本 41.1.0，未将其当作产品版本。

| 页面 | 改造前 | 改造后 | 下半部 |
|---|---|---|---|
| 通用设置 | [原始](evidence/before-settings-zh-light.png) | [打包版](evidence/packaged-settings.png) | [语言与维护](evidence/packaged-settings-lower.png) |
| 休息计划 | [原始](evidence/before-schedule-zh-light.png) | [打包版](evidence/packaged-schedule.png) | [长休息与严格模式](evidence/packaged-schedule-lower.png) |
| 外观与声音 | [原始](evidence/before-theme-zh-light.png) | [打包版](evidence/packaged-theme.png) | [声音与菜单栏](evidence/packaged-theme-lower.png) |
| 关于元气 | [原始](evidence/before-about-zh-light.png) | [打包版](evidence/packaged-about.png) | [许可证入口与页脚](evidence/packaged-about-lower.png) |

## 与设计稿的对应与差异

已实际查看 ZIP 的总览和四张单页 PNG，并完整读取入口、规范、视觉实现说明及 CODEX-PROMPT。附件提供设计参考，操作权限以用户本次请求为准。

- 保留原薄荷绿 palette 与已定稿 Logo、人物素材。统一 208px 侧栏、24px 内容边距、18px 卡片圆角、40px 控件、52px 普通设置行；标题 24/600/32、分组 17/600/24、表单 14/500/22、说明 12/400/18，PingFang SC 优先。
- 通用设置按启动、显示、行为、语言维护分组。比视觉稿保留更多真实功能，包括空闲检测、多屏、勿扰和恢复默认，故有纵向滚动。
- 休息计划保留两类休息各自启用、通知、推迟和独立严格模式；两个时间选择器并列。没有把示意图中的单一严格开关/允许跳过选项强加到现有逻辑。
- 长休息间隔仍是已存储短休息次数换算后的实际分钟，不直接改写计时语义。示意图的 50 分钟与实际默认 30 分钟不同，以设置为准。短休息精确显示秒数，非标准值不会被四舍五入成分数分钟。
- 主题预览使用确认过的女生原图，替代参考图中的抽象山形占位。只有一个「元气薄荷」主题，无未来占位卡。声音使用四个可聚焦单选项和试听按钮，比图中下拉方案更方便逐项预听。
- 保留有效的半透明开关；macOS 只显示真实模板图标的三种状态表现，其他平台的颜色选项保留条件隐藏。
- 关于页使用真实版本、开发者链接、折叠完整许可及调试区域。真实 Release 接口当前返回 404，显示「暂无可用更新信息」。未加入自动下载安装或虚构可更新状态。
- 检查了四页打包版上/下半部、英文窄窗口深色及 125% 缩放截图。文字、标签、开关和控件可读，内容区独立滚动，侧栏固定；长英文导航在窄窗口会换成两行。

## 改动文件

| 文件 | 作用 |
|---|---|
| `app/preferences.html` | 四页语义化页头、卡片、行、完整 BSD 许可及上游音效署名 |
| `app/css/preferences.css` | 设置专用 Tokens 和可复用组件；替换旧 Grid/nth-child 定位 |
| `app/css/quiet-rest-preferences.css` | 品牌侧栏、主题预览、计划并排控件、产品卡片 |
| `app/preferences-renderer.js` | 保留真实绑定；精确时间、键盘试听、嵌套链接、更新状态与网络解耦 |
| `app/utils/settingsTheme.js` | 一次性 mint 配置迁移及原色值备份 |
| `app/main.js` | 仅增加主题迁移导入和初始化调用 |
| `app/locales/zh-CN.json`、`app/locales/en.json` | 新设置界面文案与导航；保留旧键兼容其他界面 |
| `test/quietRestPreferences.js`、`test/restSparkTheme.js` | DOM、历史配置、异步、精确时间、许可回归 |
| `scripts/rest-spark-settings-qa.mjs` | 隔离配置的真实 Electron IPC/视觉验收 |
| `scripts/rest-spark-settings-packaged.mjs` | 最终打包应用运行验收与四页截图 |
| 本目录 | 实施记录、日志、截图、矩阵与指纹 |

共享组件入口见 `preferences.css`：`.settings-page`、`.settings-page-header`、`.settings-card`、`.settings-row`、`.settings-row__label`、`.settings-row__control`、`.settings-switch`、`.settings-select`、`.settings-segmented`、`.settings-link`。新增页面应复用这些组件，避免再加载旧 `commons.css` 表单样式。

## 本次验证

- `npm test`：**23 个文件、362 项通过**，见 [最终测试](evidence/tests-final.log)。早期受限环境完整测试退出 1 且无结果，保留原日志；最终在允许系统进程查询后重跑通过。
- `XDG_CACHE_HOME=/private/tmp/restspark-standard npm run lint`：通过，见 [Lint](evidence/lint-final.log)。只改变缓存目录，未改变 StandardJS 规则。
- `git diff --check`：通过。
- 最后一次测试/打包并行时，测试清理 coverage 导致打包 ENOENT；已保留 [失败日志](evidence/pack-concurrent-failure.log)，测试结束后顺序重跑。
- `npm run pack`：macOS arm64 目录构建通过，见 [构建日志](evidence/pack-final.log)。本地 ad-hoc 签名，未公证，未生成或发布正式版本。
- 真实 macOS：**64 个布局场景，176 条检查通过**，见 [矩阵](evidence/layout-matrix.json)、[流程检查](evidence/acceptance.json)。覆盖中文/英文、浅色/深色、860×740、760×700、620×680、125% 缩放、控件持久化、重载恢复、独立严格模式、两类休息不可同时关闭、恢复默认取消/确认、调试入口、真实音效 IPC 和菜单栏样式设置。
- 最终打包应用：四页能运行，动态版本 0.1.1，许可证全文存在，见 [运行结果](evidence/packaged-smoke.json) 和 [真实更新源响应](evidence/release-state.json)。
- 包内 `app.asar` 保留根目录 `LICENSE` 与依赖许可证；界面许可证区保留 Jan Hovancik 版权全文、免责条款、Colin Shanley 及 README 中的音效署名。代码、包内源码指纹见 [manifest](evidence/source-manifest.json)。

## 已解决问题与回归依据

| 问题 | 根因/此前漏测 | 本次防回归 |
|---|---|---|
| 四页样式不一致、外观标题跑偏、关于页空白 | 两套 CSS 叠加且依赖 DOM 顺序；原测试只看行为 | 移除旧设置 CSS，64 场景实际布局检查和截图审查 |
| 旧主题仍参与窗口初始化 | 移除入口不能改变历史设置；原测试未检查主题迁移 | 一次原子补丁保存 `settingsThemeBackup`、统一 mainColor/miniBreakColor，7 类历史颜色和重复迁移测试 |
| Release 缺失时空值调用字符串方法 | 原 about 无 missing-release 状态测试 | 缺失/网络错误不显示 N/A，原更新源测试及新增 DOM 测试 |
| 网络慢时外观设置错误/不可保存 | 更新查询先于本地外观绑定；原测试无 pending 网络 | 独立审查复现，新增请求挂起测试，先绑定本地设置再异步查询 |
| 秒数/派生间隔显示有精度损失 | 共用提示用格式化器会四舍五入、输出 parseInt；原 mock 未覆盖真实格式化器 | 80.5 秒及45.75分钟回归，修复前失败，修复后通过 |
| 嵌套项目链接 URL 丢失、试听不便键盘操作 | 依赖 event.target 和可点击图片 | 用绑定 anchor URL；原生 button 试听和 DOM 事件回归 |

## 兼容策略与边界

- 旧颜色只备份到 `settingsThemeBackup`；迁移不修改时长、手工字段、透明度及其他设置。mint 的内部兼容色键仍是 `#478484`，薄荷视觉由原品牌 CSS 决定。系统深浅色由独立 `themeSource` 控制。
- 仍保留旧翻译键与不可见的上游 support DOM，避免无关贡献者代码回归；它没有导航入口。本轮没有新增账号、收费、广告、主题或云功能。
- 其他语言通过已有 English fallback 加载新键；本次重点视觉验收为简中/英文。RTL 样式使用逻辑方向，但未对所有 RTL 语言逐页实机验收。
- 登录启动项只核对加载，未修改系统登录项；多屏开关验证保存，未连接第二台显示器；音效已走实际播放 IPC，未以人工听感作验收。
- 当前 macOS 测试账号缺少 `com.apple.controlcenter` 的 FocusModes 状态键，原 DND 监测记录错误；相关开关保存与负向布尔映射通过，真实勿扰触发通路未验证。未改动该底层检测逻辑。
- 上游 README 提供 reverie 作者署名，但未单列该音频的授权条款；本轮完整保留已有来源，未新增素材或宣称已完成全部第三方授权审计。
- Logo、女生图片、休息窗口 HTML/CSS/renderer、核心计时逻辑无修改。未测试 Windows/Linux 构建或分发。

## 交付后修正：用户实例未重启（2026-11-09）

用户截图出现 `settingsV1.display` 等原始翻译键。实际进程检查确认：用户正在使用的源码 Electron 主进程 PID 75060 从 21:05 运行，早于本轮语言资源变更；22:30 新开的 renderer 读取了最新 HTML，但翻译 IPC 仍来自旧主进程内存中的 i18next 资源。磁盘 zh-CN/en 文案和独立打包运行均完整，问题来自交付遗漏了重启用户现有实例。

已退出这个明确识别的旧主进程，使用现有用户配置目录启动最终打包版本，并通过 macOS 激活应用。新实例 PID 37627，真实运行版本 0.1.1。逐页读取四页标题与翻译节点，未解析键均为 0；验证期间配置变更键为 0。未用测试默认配置覆盖用户设置。证据见 [实际用户实例检查](evidence/live-user-restart.json)、[当前通用设置截图](evidence/live-user-settings-zh.png)。

漏测原因：上一轮验证聚焦隔离测试实例和打包实例，没有检查用户仍在使用的旧实例。防回归：打包 smoke 增加每页全部 `data-i18next` 的解析断言；交付时应将用户实际运行进程、启动路径和版本与已验证产物核对，涉及主进程资源更新时完成必要重启。此次没有修改产品业务代码。
