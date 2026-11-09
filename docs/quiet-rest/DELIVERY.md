# Stretchly · Quiet Rest 第一阶段交付

日期：2026-11-09（Asia/Shanghai）。Fork：DeepCarry/stretchly；基线：`e11920f`，开发分支：`feature/quiet-rest-ui`。不合并 trunk，不发布安装包，不替换已安装应用。

## 实现

- 短休息、长休息：薄荷渐变、动态 SVG 圆环、`mm:ss` 倒计时、实时文案、原有推迟/跳过/手动结束。严格模式继续采用原 `canPostpone`/`canSkip` 和主进程条件；没有添加会重启倒计时的“开始休息”按钮。
- 休息计划：侧栏、分组玻璃卡片、原生下拉时间选择、开关与严格模式。全部 37 个原设置控件的 ID、设置键、负值开关语义及原取值范围均核对保留。下拉支持原滑条每一个步进值，也显示高级配置中已有的非标准时长；长休息间隔继续按短休息次数计算，没有变为独立调度器。
- 保留设置、主题、关于、支持原有入口及 contributor/sync 入口；未新增账户、订阅或统计功能。主题色与透明度沿用现有配置，新增中英文/繁体中文文案，其他语言通过原有英文 fallback 显示新增标题。
- 人物仅从 [唯一母版](assets/approved-ui-master.png) 裁切，原脸型、颈肩、发型、姿势、无耳机状态不变，按比例显示；小窗口隐藏装饰以保证控件可用。计时、文字、按钮全部是真实 DOM。
- 未改调度器、通知/声音实现、preload、CSP、HTML 净化规则、App 名称、bundle ID 或默认配置。主进程仅调整设置窗口初始尺寸。
- 打包排除本次开发文档、母版、截图和 QA 脚本，运行时只带必需的裁切插图及 SVG。

## 验证结果

环境：macOS 27.2 arm64；Node 24.22.2（遵循项目 `.nvmrc` 的 24 主版本）；Electron 41.1.0；单显示器、Retina 2×。

| 验证 | 结果 | 证据 |
| --- | --- | --- |
| 完整 `npm test` | 19 个文件、331 个测试通过，含覆盖率 | [tests.log](evidence/tests.log) |
| 本次专项 | 16 个通过 | [targeted-tests.log](evidence/targeted-tests.log) |
| `npm run lint`、`git diff --check` | 通过 | [lint.log](evidence/lint.log) |
| `npm run pack` | 成功生成 macOS arm64 `.app`，ad-hoc 签名 | [pack.log](evidence/pack.log) |
| 打包内容 | 本次 QA 文档/截图/测试未进入 app.asar | [package-exclusions.log](evidence/package-exclusions.log)（无匹配） |
| 真实 Electron 操作 | 37 项通过，运行生产 main/preload/renderer，临时独立配置 | [macos-qa.json](evidence/macos-qa.json)、[运行日志](evidence/macos-run.log) |
| 实际打包 `.app` 启动 | 版本 1.20.0、休息计划标题及 4 个时间控件正确 | [packaged-smoke.json](evidence/packaged-smoke.json)、[截图](evidence/packaged-schedule.png) |
| 设置兼容核对 | 37 个原控件、设置键、所有原滑条步进值保留 | [settings-compatibility.json](evidence/settings-compatibility.json) |
| 视觉检查 | 已实际打开下表截图检查，中文/英文浅深色、窄窗口、长文案均可操作 | 下表 |

实际操作覆盖两类休息的推迟、跳过、严格限制、自动完成和手动完成；倒计时推进、设置真实落盘/重载、所有原导航入口、缩小窗口后导航不重置尺寸、键盘可聚焦按钮、长文案滚动到操作区。

截图来自 macOS 真实 Electron 窗口的渲染内容与打包应用 CDP 捕获，不是 HTML 模拟图；不含系统标题栏/桌面。未对其他 DPI 做人工验证。

## 前后截图

| 页面/状态 | 原版 | 本次 |
| --- | --- | --- |
| 短休息 | [原版](evidence/before-microbreak.png) | [中文浅色](evidence/after-microbreak-zh-light.png)、[英文浅色](evidence/after-microbreak-en-light.png) |
| 长休息 | [原版](evidence/before-long-break.png) | [中文浅色](evidence/after-long-break-zh-light.png)、[中文深色](evidence/after-long-break-zh-dark.png) |
| 休息计划 | [原版](evidence/before-schedule.png) | [中文浅色](evidence/after-schedule-zh-light.png)、[长休息/严格模式](evidence/after-schedule-zh-lower.png) |
| 英文/深色 | — | [英文计划](evidence/after-schedule-en-dark.png)、[中文计划](evidence/after-schedule-zh-dark.png) |
| 窄窗口 | — | [设置](evidence/after-schedule-narrow-dark.png)、[短休息](evidence/after-microbreak-en-narrow-dark.png)、[长休息](evidence/after-long-break-en-narrow-dark.png) |
| 手动完成 | — | [短休息](evidence/after-microbreak-manual-finish.png)、[长休息](evidence/after-long-break-manual-finish.png) |
| 长文案 | — | [小窗滚动到操作区](evidence/after-microbreak-long-content.png) |

母版的两窗叠放属于展示构图，本次保持原来的独立窗口逻辑。原生标题栏与窗口行为保留，没有绘制假的关闭按钮。人物没有独立透明源文件，采用裁切与边缘渐隐；不声称恢复了原图未提供的独立人物图层。

## 修复与回归

1. 短休息文案为空：主进程发数组，净化器仅接受字符串；原 renderer 直接传数组。旧工具函数测试没有执行主进程数据到 DOM 的完整路径。本次提取数组首项后仍经原净化器；真实 CLI 定制文案与 renderer 测试均验证。保留 [失败记录](evidence/renderer-red.log)、[通过记录](evidence/renderer-green.log)。
2. 慢 IPC 漏绑事件：旧 `eventsAttached` 在 500ms 后置真，新选项格式化延迟使后续声音预览/设置控件漏绑。原测试未模拟慢格式化。本次删除时间门槛，直接幂等绑定；600ms IPC 延迟回归通过。[审查缺陷失败记录](evidence/review-regressions-red.log)。
3. 用户缩放后导航恢复初始尺寸：稳定侧栏布局仍重复使用首次 bounds 调整窗口。本次仅初次应用尺寸，后续滚动布局；专项与真实 macOS 缩小后导航均验证。
4. 英文单位截断：母版中文控件宽度不足以容纳完整英文单位。实际截图发现后将非中文选择器增宽，刷新截图确认完整显示；没有缩短单位含义。

## 运行与复验

```sh
cd /Users/carry/Documents/DeepCarry/Git/genki/stretchly
# 使用 Node 24
npm ci
npm start
npm test
npm run lint
CSC_IDENTITY_AUTO_DISCOVERY=false npm run pack
# 独立临时配置、真实主进程与 preload 的验收：
./node_modules/.bin/electron scripts/quiet-rest-qa.mjs
# 核验刚打包的应用，临时配置、随机 loopback CDP 端口，随后退出：
node scripts/quiet-rest-packaged-smoke.mjs
```

正常启动后从菜单栏打开设置即可进入休息计划；命令 `mini`/`long`/`preferences` 由正在运行的实例接收。`.app` 位于 `dist/mac-arm64/Stretchly.app`，不纳入 Git。

本机 npm 11 曾跳过 Electron 安装脚本；用现有 Node 20 完成锁定 Electron 安装后，正式验证用 Node 24。最早测试在 Electron 尚未安装完成时失败，随后沙箱内进程列表测试又遇到 EPERM；保留初始失败日志，完整测试在允许读取进程列表的环境中重跑通过。打包启动检查首次仅启动第一实例，没有触发现有二次实例命令；调整验收脚本后通过，产品命令逻辑未修改。

## 验证边界和后续事项

- 单显示器和当前 Retina 环境已测；多显示器、系统勿扰开关、真实空闲计时、系统通知横幅/实际音频输出、全屏空间切换及更多 DPI/其他操作系统未逐项现场验收。相应原模块和既有回归测试保留并通过，但不能等同于这些外部通路都已实测。
- 打包为本地 ad-hoc 签名，未 Apple Developer 签名或公证，也未生成/发布 DMG；如需分发需另行确认。
- `npm ci` 报告锁定依赖原有 39 个审计项（1 low / 12 moderate / 24 high / 2 critical），本阶段未升级依赖；[安装日志](evidence/npm-ci.log)。
- 新增标题目前完整覆盖英文与简/繁中文，其他语言沿用英文 fallback；其他设置页的深度视觉统一留在 P1。
- 没有未修复的已确认 P0 功能缺陷；上述外部环境检查及最终主观视觉认可仍由验收边界明确保留。

## 修改文件

见 [FILES.md](FILES.md)。源文件与验证脚本指纹见 [source-fingerprints.json](evidence/source-fingerprints.json)，所有截图/测试对应本次实现。
