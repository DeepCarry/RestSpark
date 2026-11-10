# 休息计划 V2 交付记录

2026-11-10（Asia/Singapore）。在 `feature/settings-design-system-v1` 上继续实现已确认的 [方案](../settings-v1/SCHEDULE-CONTROLS-V2-PROPOSAL.md)。

## 已实现

四个时间选择器改为数字输入、固定单位、增减按钮和少量常用预设。选择预设立即保存；手工编辑用 Enter 或「应用」提交，「取消」/Esc/点击外部恢复原值。不会在输入每个字符时写盘，清空不会被当作0保存。

| 项目 | 新用户默认 | 新输入限制 | 预设数 |
|---|---|---|---|
| 短休息工作间隔 | 20分钟 | 5–60整数分钟 | 7 |
| 短休息时长 | 30秒 | 30–300秒，10秒步长 | 8 |
| 长休息频率 | 每3周期，约60分钟工作时间 | 2–6整数周期，总间隔≤120分钟 | 最多4，动态过滤超限项 |
| 长休息时长 | 5分钟 | 3–20整数分钟 | 5 |

长休息UI周期数N仍存为原 `breakInterval=N-1`，没有修改核心调度。修改工作间隔造成超限时，先提示冲突，经明确点击「一并改为…」后通过一次设置补丁保存两项。旧20秒、25秒、80.5秒、60分钟及超120分钟组合保留、标注历史设置，不静默重写，也不阻止修改其他不相关字段。

预设面板与输入控件同宽，间隔8px，空间不足上翻，最高280px，随滚动和窗口变化重新定位。原生Popover置于顶层，避免被内容卡片裁切。输入、按钮、错误关联、键盘焦点和深浅色均保留。通用设置图标改为同规格的8齿线性齿轮，其余导航图标/Logo/人物素材未替换。

## 本次证据

- [完整测试](evidence/tests-final.log)：25文件、400项通过。
- [StandardJS](evidence/lint-final.log) 与 `git diff --check` 通过。
- [真实macOS验收](evidence/macos-acceptance.json)：265条检查、48个展开面板布局组合通过。包括中文/英文、浅色/深色、860×740与620×680、760×700下125%缩放、向上/向下展开、展开后滚动/改宽、预设选择、自定义输入、清空取消、Enter提交、非法值、联动确认、主进程拒绝非法请求和重载恢复。
- [构建](evidence/pack.log)：macOS arm64目录构建成功，ad-hoc签名，未公证/发布。测试完成后顺序打包，避免覆盖率产物变更导致打包竞争。
- [最终打包应用](evidence/packaged.log)：四页翻译、运行时0.1.1、新用户20分钟/30秒/3周期/5分钟默认值验证。
- [包内源码指纹](evidence/source-manifest.json)：11个关键文件与工作区逐字节一致。
- 用户实际实例检查见 [重启结果](evidence/live-user-restart.json)，截图见 [当前休息计划](evidence/live-user-schedule.png)、[当前预设展开](evidence/live-user-presets.png)。使用原用户配置，不用测试默认值覆盖。

## 已查看的实机截图

| 场景 | 图片 |
|---|---|
| 短休息时长的8个预设 | [中文浅色](evidence/panel-miniBreakFor-zh-CN-light-860-1.png) |
| 长休息时长上翻 | [中文浅色](evidence/panel-longBreakFor-zh-CN-light-860-1.png) |
| 英文深色125%缩放 | [展开面板](evidence/panel-miniBreakFor-en-dark-760-1.25.png) |
| 45分钟×4周期超限，明确联动确认 | [冲突状态](evidence/linked-frequency-conflict.png) |
| 历史25秒与60分钟展示 | [历史设置](evidence/initial-legacy-schedule.png) |

已实际查看本次生成截图，检查预设数量、标签/数值/单位对齐、边缘位置、无裁切、字体、错误与焦点样式；不是只检查关闭面板时的布局。

## 代码范围

- `app/schedule-editors.js`：共享数字编辑器、草稿/取消、预设面板与定位、异步错误隔离。
- `app/utils/scheduleControls.js`：共享转换和验证、历史值兼容、主进程原子保存。
- `app/preferences.html`、`app/preferences-renderer.js`、`app/css/quiet-rest-preferences.css`：替换时间控件并接回现有设置。
- `app/main.js`、`app/utils/context-bridge-exposers.js`：带结果确认的 `save-schedule` IPC，不改变原高级配置入口。
- `app/utils/defaultSettings.js`、zh-CN/en：新用户默认值及文案。
- `app/images/quiet-rest/nav-settings.svg`：协调一致的线性齿轮。
- `test/scheduleControls.js`、`test/scheduleEditor.js`、`test/quietRestPreferences.js`：边界、持久化、DOM和异步回归。
- `scripts/rest-spark-schedule-qa.mjs`：当前实际展开面板的专用验收入口；已有QA/smoke脚本同步新数字DOM与周期转换。

## 缺陷与漏测复盘

1. 原长列表继承了上游逐项枚举，上一轮没有实际展开系统菜单验收。现在限制预设数量并加入实际展开的面板几何检查。
2. 向上展开以scrollHeight计算高度，漏算2px边框，导致8px间距变为6px。新增失败回归并改为测量完整边界；实机验证通过。
3. 历史提示导致两列控件错位：旧flex行的伸展行为把无提示的一列推下。固定标签伸缩与顶部对齐，实机增加混合历史提示的对齐断言。
4. 独立审查发现延迟翻译会在取消后重新显示错误/联动操作。两个失败用例确认，编辑代次校验阻止过期回调更新UI。
5. 独立审查发现60分钟×3周期历史组合虽单字段合法、组合超限，却未标注旧设置。新增失败回归，按组合检测历史状态且保留值。

早期实机运行有一次窗口被销毁而中断，原日志保留；未推断关闭原因。补充窗口事件记录后未再复现，最后完整验收通过。旧失败日志不计作通过。

## 边界

本轮没有修改核心计时、休息提醒窗口、Logo、人物背景或发行渠道。保留现有“修改设置后按原调度流程生效”的行为，不重置正在进行的休息。新范围作用于设置中心主动提交的字段，高级配置入口仍保留兼容能力。未额外验证其他操作系统、另一台物理显示器或原有勿扰系统检测通路。

未合并trunk、推送或发布新版本。最终提交信息由Git记录与本次交付回复提供。
