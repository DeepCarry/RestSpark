# 元气 / Rest Spark 品牌集成交付

2026-11-09，Asia/Shanghai。开发基线 `6d9bcb5`（上一阶段薄荷绿 UI），开发分支 `feature/rest-spark-brand`。

## 私有独立仓库

已按后续明确要求创建 [DeepCarry/RestSpark](https://github.com/DeepCarry/RestSpark)，实际核对 `isPrivate=true`、`isFork=false`。保留完整 Git 历史、原 BSD-2-Clause LICENSE 与 Jan Hovancik 版权；README 新增二次开发说明及致谢，并把旧安装文档标为上游说明。

新 `origin` 指向私有仓库。原公开 Fork 未更名、未删除；本地保留其只读 fetch 地址为 `legacy-fork`，禁用该 remote 的 push URL，避免后续误推公开仓库。新仓库默认 `trunk` 仍是原始 `e11920f`，上一阶段 `feature/quiet-rest-ui` 分支也已复制，品牌工作只提交到新开发分支。没有合并主分支，没有 GitHub Release、DMG 发布或官网部署。默认分支 README 仍是基线内容；本次品牌 README 位于开发分支，待确认后再集成。

## 实际修改

- 正式产品名：中文「元气」，英文 `Rest Spark`（保留空格）。macOS 应用包/可执行文件为 `Rest Spark.app` / `Rest Spark`，显示名为「元气」。npm 包名 `rest-spark`，版本仍为 1.20.0。
- 应用 ID 改为 `io.github.deepcarry.restspark`，与上游 `net.hovancik.stretchly` 分离；不复用原作者签名身份。保留原 `LSUIElement`/后台应用行为。
- 使用用户包内 [唯一 SVG 母版](brand/svg/restspark-app-icon-master.svg)、提供的 PNG、ICNS 和菜单栏模板。10 个运行资源的 SHA-256 均与提供文件相同：[素材完整性](evidence/asset-integrity.json)。没有重绘 Logo、削细笔画或更改人物形象。
- 更新偏好设置侧栏、关于、欢迎页、提醒页品牌标志、系统通知名称及全部现有语言文件内的产品名称；保留薄荷绿 UI 与原人物。原有赞助/贡献者服务继续明确标为支持 Stretchly 上游，避免将原作者的服务误称为新产品服务。关于页保留原作者和原界面设计者署名，并限定其为 Stretchly 的署名。
- macOS 菜单栏固定使用已确认的单色 `Template` 图像，并显式 `setTemplateImage(true)`；默认、分钟数、进度与暂停状态仍有区分，状态在图形旁显示（分钟数 / 百分比 / `Ⅱ`）。这是有意替代旧进度小环的呈现方式，Logo 本身不变。macOS 上隐藏已不适用的彩色/单色选项，已有配置值不重置，其他平台源码保留。
- 不改休息调度器、快捷键、HTML 净化、CSP 或 preload 接口。保留现有提醒/严格模式/设置行为和兼容的内部 `window.stretchly` API 名称。
- Windows/Linux 的旧资源与 Store 配置未冒充为已完成的新品牌发行；`beforePack` 阻止未经审阅的非 macOS 打包。后续需审阅图标、安装目录、包名和旧 Windows Store publisher 后再开放该平台打包。

详细文件列表见 [FILES.md](FILES.md)。原交接包完整归档于 `brand/`；包内旧 Fork 引用保留原文，当前目标以本报告的新私有仓库为准。

## 配置与旧用户兼容

正常启动使用 `~/Library/Application Support/Rest Spark`。首次启动、获得独立新配置锁后：

1. 仅在新目录没有 `config.json` 时，复制旧 `~/Library/Application Support/Stretchly/config.json`、`images/` 与已有贡献者 `stamp`。
2. 旧目录只读，不删除、不移动、不回写。复制保留未知/手动字段、旧迁移元数据、语言、时长、颜色、严格模式等设置；不复制 Chromium 缓存、锁或机器状态。
3. 配置文件在素材复制成功后才原子写入，已有目标配置优先。新配置目录若已存在用户设置，第二次启动不会被旧配置覆盖；显式 `--user-data-dir`、程序化测试目录及便携目录不自动导入个人旧目录。
4. 配置损坏、图片目录冲突等错误会说明源/目标路径和原因，并在调度器尚未创建时也能干净退出，不静默重置到默认配置。半成品配置不发布，修复冲突后可重试。
5. 在 electron-store 加默认值前读取明确保存的 `openAtLogin`。即使旧迁移标记缺失，新 bundle 当前未注册登录项，也不会用原生 false 覆盖用户保存的 true；反向场景同样保留用户 false。

原应用和登录项未被卸载或删除。真正切换使用前，需要确认只运行期望的提醒应用；本次没有操作用户的真实旧配置或真实登录项。新的开机启动注册/系统授权行为未现场验收。

## 更新机制

现有机制是“查询 GitHub 版本 → 提示打开下载页”，没有自动下载/安装引擎。本次将查询、通知点击、菜单下载入口、项目元数据统一指向 `DeepCarry/RestSpark`，并设置构建 `publish: null`，不自动发布。

保留 `checkNewVersion`、`notifyNewVersion`、`disableAppUpdateFeatures` 的设置语义。无版本、403、404、服务器错误、离线或非法 JSON 都不会触发错误的更新提示，也不会回退到上游发行版；未把 GitHub 令牌嵌入客户端。

本仓库现为私有，尚未配置独立可用的更新分发通道。本次匿名真实 API 请求得到 **403（出口 API 限流）**，因此不能宣称真实更新通路可用：[实测结果](evidence/anonymous-update-check.json)。未来公开仓库或采用其他认证/公开签名更新源，需在正式分发前另行确定；本次没有开放仓库、上传发行文件或引入更新服务。

## 构建、测试与实际截图

环境：macOS 27.2 arm64、Node 24.22.2、Electron 41.1.0。系统检测到 3 个显示器，本次提醒操作固定单屏（`allScreens=false`），没有把多屏同时提醒算作实测。

| 检查 | 实际结果 | 证据 |
| --- | --- | --- |
| `npm test` | 22 个测试文件，349/349 通过，含覆盖率 | [tests.log](evidence/tests.log) |
| 品牌专项 | 18 项通过；配置导入/路径/更新/托盘状态 | [brand-targeted.log](evidence/brand-targeted.log) |
| lint / diff | `npm run lint`、`git diff --check` 通过 | [lint.log](evidence/lint.log) |
| macOS 打包 | 成功生成 `dist/mac-arm64/Rest Spark.app` | [pack.log](evidence/pack.log) |
| 本地签名完整性 | ad-hoc 应用 `codesign --verify --deep --strict` 通过；不等于公证 | [codesign-verify.log](evidence/codesign-verify.log) |
| 实际 Bundle | ID、可执行文件、显示名、ICNS 哈希正确 | [bundle-identity.json](evidence/bundle-identity.json) |
| 打包内容 | 原 LICENSE 字节一致，开发母版/截图/QA 脚本未带入 app.asar | [packaged-contents.json](evidence/packaged-contents.json) |
| 真实源码 Electron 操作 | 44 项通过：生产 main/preload/renderer、导入图片/未知字段、设置落盘、严格/推迟/跳过/完成等 | [macos-qa.json](evidence/macos-qa.json)、[日志](evidence/macos-run.log) |
| 第二次正常启动 | 保留新配置哨兵和新时长，旧配置字节不变 | [restart-qa.json](evidence/restart-qa.json) |
| 真实启动失败分支 | 损坏 JSON / 图片目录冲突均提示并干净退出，原文件不变、无半成品配置 | [JSON 场景](evidence/startup-corrupt-json.json)、[冲突场景](evidence/startup-assets-conflict.json) |
| 实际 `.app` 启动 | 版本 1.20.0、品牌「元气」、4 个时间控件正确，随后正常退出 | [packaged-smoke.json](evidence/packaged-smoke.json) |
| 原生菜单栏 | 实际 nativeImage 非空且为 Template；屏幕可见效果未验证，见下文 | [native-tray.json](evidence/native-tray.json) |

截图已打开检查名称、Logo 比例、中文/英文长度、浅/深色、设置值和按钮可用性：

- [实际打包设置页](evidence/packaged-schedule.png)、[实际打包关于页（1.20.0 + 原署名）](evidence/packaged-about.png)。
- [中文设置](evidence/brand-schedule-zh-light.png)、[英文深色设置](evidence/after-schedule-en-dark.png)、[窄设置](evidence/after-schedule-narrow-dark.png)。
- [短休息](evidence/after-microbreak-zh-light.png)、[长休息](evidence/after-long-break-zh-light.png)、[深色窄提醒](evidence/after-microbreak-en-narrow-dark.png)。
- [从实际 ICNS 解出的应用图标](evidence/built-app-icon.png)、[提供的 16–22px 与菜单栏预览](brand/preview/icon-sizes-and-menubar.png)。

源码 QA 包装器的 About 版本可能显示 Electron 的 41.1.0；产品版本验收使用上面的实际 `.app` 截图与 1.20.0 断言，没有通过改截图伪造版本。

## 已发现问题、修复与保留的失败证据

- 审查发现启动迁移失败会发生在 settings/planner 初始化前，原异常/退出链路不能可靠结束。增加明确的导入错误处理和未初始化退出保护；实际 Electron 启动失败测试先失败、后能退出：[原失败日志](evidence/startup-red.log)。
- 审查发现旧配置的显式登录启动偏好可能被新 bundle 原生状态覆盖。现在优先保留原始 JSON 布尔值；true/native false、false/native true 回归通过：[失败用例](evidence/autostart-red.log)。
- 首次截图在语言切换后出现 Electron `UnknownVizError`，属于捕获路径故障，未以假图替代。源码 QA 进程采用禁 GPU、显式显示/刷新窗口后捕获，产品设置不变；实际打包应用使用正常启动并已成功截图：[首次失败](evidence/macos-first-capture-failure.log)。
- 打包 smoke 最初固定 1.5 秒启动第二实例，签名应用首次启动较慢时可能出现单实例锁竞态。验收脚本改为等待第一实例实际建立 CDP 且加载生产 process 页面后再发命令，并清理测试进程；产品生命周期未改：[脚本失败记录](evidence/packaged-first-race.log)。
- 当前系统对 native Tray 返回 `height=0` 的边界（默认/时间/进度/暂停均如此），没有伪造原生菜单栏截图或计为通过：[原生边界记录](evidence/native-tray.json)、[首次边界失败](evidence/macos-native-tray-bounds-failure.log)。尚未确认其系统层原因。

## 尚未验证 / 交付边界

- 原生菜单栏在真实屏幕中的可见位置、系统自动着色和点击交互尚未视觉验收；16–22px 素材与 Template API 已检查，不能等同于原生表面已验收。
- 原项目保持为菜单栏后台应用（`LSUIElement=1`），没有为了截图强行改变 Dock 行为；Dock 实际显示效果未验收。
- 未安装/卸载或覆盖用户已有应用；Apple Developer 签名、公证、Gatekeeper 首次安装、登录项授权和正式升级未验证。
- 未现场执行多屏同时提醒、各显示器缩放、真实勿扰/空闲状态、系统通知声音输出，Windows/Linux 未打包；原模块与既有回归保留。
- 没有可发布的私有更新分发方案；真实查询本次受限流阻断，发布流程仍未启用。
- 原锁定依赖存在此前已记录的审计项，本次没有升级依赖或掩盖构建工具警告。
- 新品牌图形独立授权条款在对外分发前仍需维护者明确；目前仅私有开发。源代码 BSD-2-Clause 与原作者声明未改。

## 运行与复验

```sh
cd /Users/carry/Documents/DeepCarry/Git/genki/stretchly
# Node 24
npm ci
npm start
npm test
npm run lint
CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
# 独立测试数据，执行真实生产入口：
./node_modules/.bin/electron scripts/rest-spark-qa.mjs
./node_modules/.bin/electron scripts/rest-spark-restart-qa.mjs
./node_modules/.bin/electron scripts/rest-spark-startup-failure.mjs
./node_modules/.bin/electron scripts/rest-spark-startup-failure.mjs --assets-conflict
node scripts/rest-spark-packaged-smoke.mjs
```

测试脚本写入临时 appData/profile，保留原设置；packaged smoke 使用随机 loopback CDP 端口并在完成后退出测试实例。真实应用运行会按上面规则创建独立配置目录并做首次复制；本次没有启动真实个人目录下的产品实例。
