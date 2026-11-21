# 大肥鱼壳 App（dafeiyu-app）

把网页版包成原生外壳的 Android 应用：内层是打包好的 React 单页应用，外层是很薄的原生壳。

## 基本信息

| 项 | 值 |
| --- | --- |
| 包名 | `dfy.DeepSeek` |
| 主 Activity | `com.deepseek.chat.MainActivity` |
| 技术 | Kotlin + WebView 外壳（React 产物在 `assets/`） |
| 大小 | 约 5.1 MB |
| 权限 | INTERNET、WAKE_LOCK |
| 补丁脚本 | `assets/patch/music.js`、`assets/patch/share.js` |

## 目录说明

- `dafeiyu-app.apk` — 可直接安装的构建产物
- `README.md` — 本文件

## 安装

1. 下载 `dafeiyu-app.apk` 传到手机
2. 允许「安装未知应用」后点击安装
3. 首次启动按提示授予网络权限

> 仅作自用分发，未在应用商店上架。
