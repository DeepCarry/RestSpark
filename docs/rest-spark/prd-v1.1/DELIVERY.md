# 元气 Rest Spark PRD v1.1 开发交付

基线为 `main` 的 `923eacd12965f2de892ec7ffbb4250b8e54797e1`。本地测试包沿用 `0.1.2` 版本号及应用标识。阶段计划及对旧实现的判断见 [PLAN.md](PLAN.md)。

## 实现清单

| 任务 | 用户入口与实现 | 主要代码 |
|---|---|---|
| RS-01 延后与跳过 | 两种休息都显示延后和跳过。默认短休息延后 2 分钟、长休息 5 分钟，默认每次最多延后一次。严格模式禁止跳过，并保留原有延后时间窗口和次数设置。 | `app/main.js`、`app/breaksPlanner.js`、`app/utils/breakActions.js`、两个休息窗口及渲染器 |
| RS-02 定时暂停 | 菜单栏选择 1、2、3、5 小时或直到次日早晨。可看剩余时间、更改期限和提前恢复。通用设置可修改明早恢复时间。 | `app/breaksPlanner.js`、`app/utils/restSparkPopover.js`、`app/main.js`、设置页 |
| RS-03 勿扰 | 主进程以 active、inactive、unknown、disabled 表达来源状态。有效勿扰阻断预告和自动休息，面板可手动立即休息。系统来源不可读时在设置及面板提示。 | `app/utils/dndManager.js`、`app/utils/focusAssertions.js`、`app/breaksPlanner.js` |
| RS-04 首启 | 第一步选休息节奏，第二步确认登录启动、勿扰和预告。可以跳过，后续可通过「休息计划」自定义。 | `app/welcome.*`、`app/welcome-renderer.js`、`app/utils/restSparkOnboarding.js` |
| RS-05 快捷面板 | macOS 左键打开，右键保留原生菜单。立即休息优先短休息，短休息关闭时显示长休息。启用两类时可通过原生菜单直接进入长休息。 | `app/tray-popover.*`、`app/tray-popover-renderer.js`、`app/css/prd-v1.1.css` |
| RS-06 预告 | 系统通知显示与实际调度一致的提前时间和提示文案，继续使用已有通知及静音偏好。暂停时撤回当前通知。可在面板手动开始休息。 | `app/process-renderer.js`、`app/main.js`、`app/breaksPlanner.js` |
| RS-07 预研 | 评估全屏、Keynote、会议、屏幕共享和外接屏幕。 | [PRESENTATION-RESEARCH.md](PRESENTATION-RESEARCH.md) |

正式 Logo、浅深色人物图片、原休息窗口布局、主题变量和独立长短休息时钟沿用主线。PRD 护眼、均衡、深度工作参数作为首启试用值，均衡为初始选择。跳过只标记首启完成，登录启动由用户主动选择。主线已有 `morningHour` 默认 6 点，本轮沿用。用户保存的时间和日出选项继续生效。

## 调度与迁移

- 窗口动作由主进程根据当前会话、来源窗口、统一的时长和严格规则判定。窗口销毁后，重复或迟到 IPC 失效。全部窗口打开失败时结束该会话并推进调度。晚就绪的副屏接收手动结束阶段。
- 跳过短休息只重新计算短休息时钟。跳过长休息重算两种时钟。短休息延后不推迟长休息截止，长休息先到时优先安排长休息。
- `manualPauseUntil` 保存绝对 epoch 毫秒，旧配置默认无截止。启动清除过期值，运行中按墙钟复核。手动暂停、Focus、空闲、应用规则、休眠、锁屏分别参与判定，解除最后一个阻断后才重新计时。旧 CLI 和已配置的暂停切换快捷键仍可使用会话内无限期暂停。
- 勿扰弃用 Control Center 的图标可见性键。当前适配器只读 macOS 的私有 Focus 断言文件，读取失败或结构未知时显示不可用并维持普通调度，以免长时间停摆。测试机上的真实读取返回 `EPERM`。Apple 的公开 Focus Status API 需要应用授权，提供用户共享的静音状态。它在本轮的签名、授权和跨版本适配仍需验证。 [Apple Focus Status 授权说明](https://developer.apple.com/documentation/intents/infocusstatuscenter/authorizationstatus) · [Focus Status 用途说明键](https://developer.apple.com/documentation/bundleresources/information-property-list/nsfocusstatususagedescription)
- 现有 profile 没有 `isFirstRun: true` 时直接进入菜单栏。保留原有调度、主题、语言和明早时间。首启完成原子写入选项及 `onboardingVersion`，手动修改节奏后按当前配置判定预设或自定义。

## 设计对照

| 交接稿 | 实际差异 |
|---|---|
| UI-01、UI-02 | 保留侧栏、三张预设卡、两步导航及偏好开关。使用正式 Logo，登录启动默认关闭，省略静态稿的装饰插画及重复说明。 |
| UI-03 至 UI-06 | 保留状态卡、主倒计时、休息类型和时长、并列按钮、配置摘要。目标 360×420 / 380 / 480 / 400 pt，小工作区按可用高度压缩并滚动。采用原生窗口阴影及圆角透明边界。勿扰截图来自模拟状态的实际应用。 |
| UI-07、UI-08 | 将两项操作并列加入定稿休息窗口。保持原有环形计时、休息内容和日夜人物图片。 |
| UI-09 | 由 macOS 系统通知绘制，文案和时间与调度相连。当前通知为简洁预告。实测收到了系统通知的 show / close 事件，未捕获系统横幅截图。 |
| UI-10 | 将明早时间及勿扰状态加入已有「通用设置」。保留现有页面导航及分开的短、长预告设置。 |

## 验证范围

最终 `npm test` 通过 447 项，`npm run lint` 和 `git diff --check` 通过。首次受限运行中，现有进程列表测试因 `spawn EPERM` 超时。具备本机进程读取权限的完整回归通过。

- 在 Apple Silicon / macOS 27.2.1 上运行 Electron 41.1.0。实测隔离配置中的短长操作、严格模式、加载失败恢复、恢复默认设置、跨进程重启、首启、深度工作参数落盘、菜单栏状态与设置入口。应用界面经过浅深色、中英文和 320 / 360 / 400 pt 检查。
- 休眠和锁屏事件在 macOS 运行中注入验证，使用虚拟时钟覆盖手动暂停到期和阻断重叠。真实睡眠唤醒、多台物理显示器、125% / 150% 系统缩放、VoiceOver 及 24 小时运行仍待测。
- 真正的系统勿扰切换未验收。当前证据覆盖未知来源降级、解析器及模拟 Focus 开关。跨 macOS 版本与 Windows/Linux 实机仍待测。
- 测试安装包为 Apple Silicon DMG，采用本地 ad-hoc 签名。公开分发需要另行公证及发布流程。

## 复现与已修复问题

| 复现 | 原因与原覆盖缺口 | 回归 |
|---|---|---|
| 延后之后马上再发延后或结束 IPC | 原主进程信任渲染请求，既有测试只覆盖按钮可见性。 | `restSparkBreakActions.js`、`quietRestRenderer.js`、macOS P0 和 strict 阶段 |
| 限时暂停中重启，或手动暂停到期时仍有 Focus 与空闲 | 相对定时器与独立恢复回调缺少持久化和统一判定。原计时测试只覆盖单个暂停。 | `independentBreakSchedule.js`、macOS restart 阶段 |
| 锁屏时延迟启动的手动休息弹出 | 手动动作绕过了所有阻断，原测试只覆盖已开启的休息。 | `independentBreakSchedule.js` |
| 所有窗口未就绪或休息时恢复默认 | 主进程未回收会话与完成计时，原启动测试没有中断窗口加载或在休息期间重置。 | macOS recovery 阶段 |
| Focus 权限不足或返回无法识别的结构 | 可见性键不具备可靠的活动状态语义，旧测试只覆盖开关设置。 | `restSparkFocus.js`、macOS EPERM 运行日志 |

## 本地复现

- `npm test`、`npm run lint`，并检查测试运行环境能执行现有的进程列表测试。
- `./node_modules/.bin/electron scripts/rest-spark-prd-qa.mjs <stage>`。阶段包括 `p0`、`restart`、`strict`、`recovery`、`p1`、`onboarding`、`preview`、`probe`。跨重启测试通过 `REST_PRD_PROFILE` 复用一个新建的隔离目录。探针先编译 Swift 文件，再设置 `REST_PRD_PROBE`。
- `npm run dist -- --mac dmg --arm64 --publish never`。将 DMG 只读挂载后使用 `scripts/rest-spark-packaged-smoke.mjs` 验证映像中的应用。

## 用户反馈后的界面调整

- 快捷面板主按钮的原 CSS 字重为 650，Chromium 实际使用 PingFangSC-Semibold。调整至 500，实测渲染为 PingFangSC-Medium。
- 外观卡片的固定高度和 `object-fit: cover` 放大裁切了竖幅人物图。改用响应式高度与 `contain`，展示原图全部范围。实机核对 860 pt 和 620 pt 窗口，涵盖浅、深与跟随系统卡片。
- 通用设置新增「新手引导 → 查看引导」。预览复用两步首启界面，完成后退出。实测切换预设和启动开关后，原配置文件内容保持一致。新用户首次引导仍会保存选项。
