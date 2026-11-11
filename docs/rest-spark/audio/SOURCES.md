# 休息提醒音效

来源、许可及原文件于 2026-11-12 核对。[校验和](SHA256SUMS) 以仓库根目录为基准。

| 应用文件 | 中文 / English | 素材、作者或发布者 | 许可及原件 |
| --- | --- | --- | --- |
| `app/audio/gentle.wav` | 轻柔 / Gentle | [Gentle Notification](https://frema.itlibra.com/en/asset/se-notification)，frema（运营者 Libra，站方说明素材由 AI 生成，素材页未列个人作者） | [CC0 1.0](https://frema.itlibra.com/en/license) · [官方 WAV 下载](https://frema.itlibra.com/api/asset/se-notification/download?format=wav) · [原始 WAV](originals/se-notification.wav) |
| `app/audio/warm-chime.wav` | 和煦 / Warm Chime | [Warm Gentle Success Chime 68 (No Reverb)](https://sfxmint.com/sounds/feedback-success-68)，SFXMint（站方标注 AI 生成） | [CC0 1.0](https://sfxmint.com/license) · [官方 MP3 下载](https://sfxmint.com/dl/feedback-success-68.mp3) · [原始 MP3](originals/feedback-success-68.mp3) |
| `app/audio/tic-toc.wav` | 滴答 / Tic Toc | [magundah14](https://freesound.org/people/magundah14/) | 沿用仓库原文件及 CC0 记录 |
| `app/audio/reverie.wav` | 悠然 / Reverie | Seemant Chandra（piyush.x_x） | 沿用仓库原文件及署名 |
| `app/audio/silence.wav` | 静音 / Silence | [parcodeisuoni](https://freesound.org/people/parcodeisuoni/) | 沿用仓库原文件及 [CC BY 3.0](https://creativecommons.org/licenses/by/3.0/) 记录 |

[许可证据目录](license-evidence/) 保存两站的素材页与许可页 HTML。SFXMint 的官方 WAV 下载返回 HTTP 402，采用同一素材的官方公开 MP3，其 SHA-256 与本机先前下载的 `sfxmint-feedback-success-68.mp3` 完全一致。

此前试听的「曙光」备选保存在 [RestSpark-Soft-Glow.mp3](originals/RestSpark-Soft-Glow.mp3)。存档使用本机下载的 MP3 原件，两份同名下载副本逐字节一致。应用只提供表中的四款有声音效，备选位于仓库文档目录。

## 音频处理

Gentle 和 Warm Chime 转为 16-bit PCM WAV，保留双声道、采样率和完整时长。两款转换文件分别为 48 kHz / 0.72 秒和 44.1 kHz / 2.00 秒。滴答和 Reverie 与正式仓库基线逐字节一致。

在播放器内使用固定增益，使四款音效在全局音量 100% 时接近滴答的 −34 LUFS。音量设置继续按比例缩放该增益。常规播放保留完整尾音。试听切换时，播放器先将上一段用约 40 ms 淡出，再播放最后一次请求的音效。同一声音播放中重复点击会继续当前试听。实际休息音效优先。

| 音效 | 播放增益 | 实测响度（LUFS-I） | 实测真峰值（dBTP） |
| --- | ---: | ---: | ---: |
| Gentle | 0.644 | −34.0 | −23.8 |
| Warm Chime | 0.313 | −34.0 | −17.1 |
| Tic Toc | 1.000 | −34.0 | −10.1 |
| Reverie | 0.136 | −34.0 | −25.0 |

## 配置兼容

启动及同步恢复时，对短休息和长休息各自的开始、结束音效独立迁移。旧 `crystal-glass` 对应 `gentle`，旧 `wind-chime` 对应 `warm-chime`。迁移可重复执行，`tic-toc`、`reverie`、`silence`、音量及全局开关保留原值。

新安装的短休息和长休息结束音效默认使用 Gentle，开始音效继续默认静音。「外观与声音」中的选择同时用于两种休息的结束音效。全局开关控制自动提醒，手动试听使用保存的音量。
