# Rest Spark / 元气 — 已确认品牌素材包

**日期**：2026-11-09（北京时间）  
**正式产品中文名**：元气  
**正式英文产品名**：Rest Spark（保留中间空格）  
**定位**：macOS 久坐休息提醒与健康休息管理工具  
**仓库**：https://github.com/DeepCarry/stretchly

## 唯一已确认的品牌样式

- 深薄荷绿色圆角方形背景，白色「元」字人形；双臂向上弯曲，身体左侧自然舒展，右侧柔和弯钩。
- 圆点与双臂间距：以用户最终批准的版本为准，最初间距缩短约 1/4。
- 保留最终批准版本较饱满的笔画线宽、圆点大小及视觉比例。禁止将线条削薄到用户此前否决的“瘦弱”版本。
- 软件 UI 的既定浅薄荷绿视觉保持不变。菜单栏需使用系统可自动着色的 monochrome template 图标。
- **矢量资源来源**：本包的 SVG 是从用户确认的 AI 生成定稿图中**轮廓矢量化重绘**，不是该 AI 图片的原始可编辑工程文件。可能有亚像素边缘差异；请在 macOS 真机中做一次视觉验收。

## 文件用途

- `source/approved-final-brand-board.png`：用户明确确认的定稿图（用于对照）。
- `source/approved-icon-crop.png`：定稿图中大号主图标的原始像素裁切（用于对照）。
- `svg/restspark-app-icon-master.svg`：**唯一彩色主图标 SVG 母版**，所有 PNG/ICNS 图标从此导出。
- `svg/restspark-app-icon-light.svg`、`...-solid.svg`：浅色及单色背景版本。
- `svg/restspark-mark-*.svg`：不带底色的图形标志，适合官网及 GitHub。
- `png/restspark-icon-[size].png`：16–1024px 尺寸的应用图标。
- `macos/restspark-icon.icns`：macOS ICNS（若构建工具链支持，提供现成文件）。
- `macos/AppIcon.appiconset/`：Xcode 资源目录。
- `macos/MenuBar/restsparkTemplate*.png`：macOS 菜单栏单色透明图形；需在 Electron 中设置为 `template` 图像使用。
- `preview/icon-sizes-and-menubar.png`：尺寸与菜单栏检查图。

## Codex 集成规则

1. **先检查源码与分支**，创建独立 feature 分支。保留用户现有工作和 Stretchly 项目的 LICENSE/第三方署名。
2. **修改展示名称和资源**：Electron Builder `package.json` 的 `build.productName`、应用显示文案、`build/icon.icns`、`app/images/app-icons` 及菜单栏相关图片；按代码使用链路排查，不能只改一处。
3. **包 ID 与更新器**：当前 fork 的 `build.appId` 为 `net.hovancik.stretchly`，更名应用涉及 bundle ID、数据目录、自动更新和签名；必须检查迁移方案后再改，避免影响旧设置和上游兼容。
4. **发布平台**：先完成 macOS，现有项目可能还有 Windows/Linux 发布资产，未涉及的平台在打包前确认图标资源、安装包名和兼容性。
5. **测试**：应用运行、macOS Dock/菜单栏实际效果、16–22px 可读性、安装卸载、设置持久化，及现有休息提醒行为。
6. **开源**：用户决定继续开源，本仓库为 Stretchly Fork。保留 BSD-2-Clause 及原作者版权/许可要求，新的品牌图形在拟独立授权前请明确授权条款。
7. **未经用户确认不要**：修改仓库名称、合并 main、上架发布、部署官网、变更域名、创建付费/订阅系统。

## 项目现状

该交接包只生成了**本地品牌资源与集成说明**，目前没有修改 GitHub 仓库，也没有运行 Electron macOS GUI。此包是可以直接上传 Codex 的素材交付物。
