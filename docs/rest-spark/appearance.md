# 元气 · Rest Spark 双外观

在「外观与声音 → 应用外观」选择浅色「元气薄荷」、深色「元气夜绿」或「跟随系统」。新配置沿用既有的 `system` 默认值，已有的 `light`、`dark`、`system` 原样读取。无效的历史值按跟随系统显示，无效的设置消息不会覆盖当前选择。旧 `mainColor` 和 `miniBreakColor` 仍由原有迁移备份，休息窗口的配色由当前外观决定。

主进程将 `themeSource` 同步到 Electron `nativeTheme`。四个设置页和两种休息窗口通过 `prefers-color-scheme` 共用 `app/css/quiet-rest.css` 的变量。休息画面预先加载两张批准原图，由媒体查询切换显示。窗口、计时器及按钮状态因此可以持续使用同一个实例。实机测试曾发现 `<picture>` 切换时画面残留并在返浅时超时，现有验收会检查两次切换后的已加载素材、原窗口和持续递减的倒计时。

设置页保留已有的卡片结构、数字输入、声音预听、菜单栏和许可证入口。应用外观的三张原生单选卡可用键盘切换，系统卡并列显示完整的日夜图片。设置页和休息弹窗共用 2026-11-13 确认的 1122 × 1402 日夜插图。休息弹窗将两张图等比贴右，在最左侧 8% 渐隐，让书、台灯和书架仍可辨认。

长、短休息弹窗按当前外观的原图比例和窗口高度预留右侧空间，倒计时、提示和按钮在左侧剩余区域居中。窗口宽度不超过 680 CSS 像素或宽高比不超过 3:2 时，隐藏插图，内容在全窗居中。

2026-11-13 宽屏回归在 1632 × 918 复现了旧布局的问题。插图从 x=1102 开始，控件中心却在 x=418，原因是控件宽度达到上限后仍锚在左侧。旧检查覆盖原图比例、贴右和不重叠，漏掉了控件中心。新检查使用两种休息窗口、两种外观和 10 种 Electron 模拟尺寸，断言控件中心与可用空间的中心一致，并检查断点两侧的布局。

宽屏布局分支当时通过 452 项项目测试、269 项 macOS Electron 布局与交互检查，以及本地 arm64 打包和启动检查。

换图后复验通过 452 项项目测试、232 项 Electron 布局检查、65 项真实 macOS 外观检查和 2 项重启检查，以及本地 macOS arm64 打包和启动检查。设置中验证了三个预览卡、鼠标和键盘选择、可见焦点和深色选择持久化。已查看浅色宽屏、深色长休息、中文设置页和窄窗口英文设置页截图。外接显示器使用模拟视口验证。

## 复验

```sh
npm run lint
npm test
npm run pack -- --mac --arm64 --publish never
REST_LAYOUT_EVIDENCE=/tmp/restspark-layout ./node_modules/.bin/electron scripts/quiet-rest-qa.mjs --layout-only
REST_APPEARANCE_EVIDENCE=/tmp/restspark-appearance ./node_modules/.bin/electron scripts/rest-spark-appearance-qa.mjs --system-appearance
REST_APPEARANCE_EVIDENCE=/tmp/restspark-appearance ./node_modules/.bin/electron scripts/rest-spark-appearance-qa.mjs --restart
node scripts/rest-spark-packaged-smoke.mjs "dist/mac-arm64/Rest Spark.app/Contents/MacOS/Rest Spark" /tmp/restspark-packaged
```

外观验证使用临时用户配置。指定 `--system-appearance` 会调用 macOS 的 System Events，要求桌面使用固定的系统外观并允许 Apple Events。脚本结束时恢复进入测试时的外观。三种大屏尺寸通过运行中的 Electron 渲染窗口模拟，实际桌面画面另外截图。

## 2026-11-11 验收

- macOS 27.2.1、Electron 41.1.0、Node 26.10.0。单元与渲染测试 27 个文件、433 项通过，StandardJS 与 `git diff --check` 通过。
- 真实 macOS 外观测试 59 项通过，另有 2 项独立进程重启断言。系统外观从浅到深再回浅，设置仍选中「跟随系统」，短休息和长休息在原窗口持续计时。浅色和深色也分别在相反的系统外观下验证。
- 设置回归 174 项通过，包含声音预听入口、菜单栏样式、设置恢复及中英文布局。休息计划回归 533 项通过，真实提醒顺序为短、长、短。
- 本地 macOS arm64 打包和启动检查通过。打包应用版本显示 0.1.1，使用 ad-hoc 签名。Intel Mac、公证、实际多屏、音频听感和真实勿扰联动未验证。本机缺少旧有勿扰检测读取的 Control Center 配置键，复现了设置 V1 已记录的警告。
