# macOS 全屏、演示与会议检测预研

PRD v1.1 的 RS-07 保留在技术预研。当前应用的可用入口是定时暂停，以及系统状态可读时的 Focus 保护。

| 场景 | 可验证的信号 | 权限与误判 |
|---|---|---|
| 普通全屏 | 用前台进程、可见窗口层级与所在显示器的覆盖率推断。应用能准确知道自己的全屏状态，跨应用结果只是推断。 | 某些窗口元数据受系统版本和隐私授权影响。播放器、游戏、最大化窗口可能命中。窗口式演示会漏报。 |
| Keynote 演示 | Keynote 有全屏、窗口和独立演讲者显示器等模式。可在后续实验中用已授权的 Accessibility 属性或受 Keynote 版本支持的 Apple Events 单独验证。 | 跨进程 Accessibility 需要用户授权。Apple Events 依赖目标应用接口和自动化许可。检测 Keynote 正在运行会误判编辑文稿，要求前台也会漏掉独立显示器上的演示。 |
| 会议 | Core Audio HAL 可提供进程音频输入/输出活动。在支持对应 API 的系统上，能作为测试信号。 | 音频活动可能来自播放、录音或语音输入。静音会议、浏览器标签页和系统权限都会影响结果。麦克风录制会引入额外权限和隐私成本。 |
| 屏幕共享 | ScreenCaptureKit 能枚举可共享来源，管理调用应用自己的流和授权。 | 枚举来源无法证明其他进程正在共享。录制权限也无法回答这个问题。读取菜单栏共享指示器需要依赖非公开的界面结构，存在系统版本和语言风险。 |
| 外接显示器与投屏 | Core Graphics 的在线显示器、镜像关系和显示器变化能反映拓扑。 | 接屏和镜像也用于日常办公。独立显示器演示可能完全不走镜像。浏览器分享窗口可以不改变显示器拓扑。 |

### 本机验证

`presentation-probe.swift` 在隔离 Electron 窗口上读取显示器拓扑、前台进程匹配和窗口覆盖率，并读取屏幕录制及 Focus 授权状态。探针只记录目标测试窗口的几何摘要，不请求权限或读取屏幕像素。对照普通窗口和进入原生全屏的同一个窗口。会议、Keynote 及真实外接设备没有加入本次实机组合。

第一轮要求窗口边界与显示器逐边相差不超过 2 pt。在 macOS 27.2.1 上，自有窗口 API 确认已进入全屏，但该规则漏报。第二轮探针记录覆盖率与窗口层级，以评估窗口可见范围和系统装饰导致的差异。覆盖率阈值设为 95% 后，普通窗口为 10.34%，全屏主窗口为 96.64%，同一进程还出现一个覆盖率 3.26% 的窗口。这次实验能区分一个测试窗口的状态。探针看到一块在线显示器和零块镜像显示器，未验证外接或投屏。数值见交付证据中的 `presentation-probe.json`。

若后续继续验证，优先选择能提供确切状态的应用专用信号，并以可撤销的提示收集误判。全屏几何、设备变化和音频活动可以辅助诊断，单独用来自动停止休息会产生大量误报和漏报。

### 官方资料

- [NSWorkspace.frontmostApplication](https://developer.apple.com/documentation/appkit/nsworkspace/frontmostapplication)
- [CGGetActiveDisplayList](https://developer.apple.com/documentation/coregraphics/cggetactivedisplaylist(_:_:_:))
- [Apple DTS 关于窗口元数据与录屏权限的说明](https://developer.apple.com/forums/thread/839069)
- [Keynote 的窗口与全屏演示](https://support.apple.com/en-sg/guide/keynote/tan72233051/mac)
- [Keynote 在外接显示器上演示](https://support.apple.com/en-ae/guide/keynote/tana4da2681/mac)
- [Accessibility 信任检查](https://developer.apple.com/documentation/applicationservices/1460720-axisprocesstrusted)
- [Apple Events 自动化授权](https://developer.apple.com/documentation/bundleresources/entitlements/com.apple.security.automation.apple-events)
- [ScreenCaptureKit 采集示例](https://developer.apple.com/documentation/screencapturekit/capturing-screen-content-in-macos)
- [Core Audio 的进程音频活动属性](https://developer.apple.com/documentation/coreaudio/audiohardwareprocess)
