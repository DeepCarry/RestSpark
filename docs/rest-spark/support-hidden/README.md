# 临时隐藏旧支持入口

2026-11-09。基线：d9202bb。继续在 feature/rest-spark-brand 开发，不合并主分支。

本次仅隐藏设置侧栏「支持 Stretchly 原项目」并排除其导航事件绑定。保留旧支持页实现，后续按用户要求替换为 DeepCarry 一人公司的赞助页；本次没有新增赞助或支付流程。原 LICENSE 与关于页原作者署名保留。

修改：app/preferences.html、app/preferences-renderer.js；同步已有偏好设置测试和当前 QA 脚本。打包 smoke 支持传入产物及证据路径，断言真实浏览器计算的 supportHidden=true。

验证：
- 偏好设置 8 项通过：[targeted.log](targeted.log)。
- 完整 349/349 通过：[tests.log](tests.log)。
- lint / git diff --check 通过：[lint.log](lint.log)。
- macOS arm64 打包成功：[pack.log](pack.log)。
- 实际打包应用启动、菜单隐藏、4 个计划时间控件正确：[packaged-smoke.json](packaged-smoke.json)。
- 已打开检查 [设置页](packaged-schedule.png) 和 [关于页](packaged-about.png)：侧栏只有设置/休息计划/主题/关于，原作者署名仍可见。

新版应用在 dist/support-hidden/mac-arm64/Rest Spark.app。未覆盖正在运行的旧包、未修改真实用户设置；退出旧版本后打开此包查看。独立测试配置用于本次截图，测试实例完成后退出。此前品牌阶段的原生菜单栏/Dock、公证等未验证边界维持不变。
