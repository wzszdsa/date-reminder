# 纪念日 · 把重要的日子，留在心上

一个温暖、简洁、低饱和的纪念日 PWA，同时提供 Android APK 封装版本。

## 功能

- 管理多个纪念日
- 支持每年重复和一次性事件
- 记录名称、日期、分类/图标和备注
- 显示已持续时间与距离下一次纪念日的倒计时
- 支持手动置顶，未置顶时自动选择最近的纪念日
- App 内提醒、系统通知授权
- JSON 导入/导出备份
- 浅色/深色模式
- 本地优先保存，无需登录
- 支持 PWA 安装到手机主屏幕

## Web 开发

```powershell
npm install
npm run dev
```

生产构建和检查：

```powershell
npm run build
npm run lint
```

## Android 打包

Android 工程位于 `android/`，应用包名为 `com.date.reminder`。

```powershell
npm run cap:build:android
```

当前根目录中的 `date-reminder.apk` 是可直接安装的 Debug APK。正式发布到应用商店前，需要配置发布签名并生成 Release AAB。

## Netlify

Netlify 构建配置位于 `netlify.toml`：

- 构建命令：`npm run build`
- 发布目录：`dist`
- 单页应用回退：`/* -> /index.html`

线上版本：<https://date-reminder-pwa.netlify.app>

## 数据说明

纪念日数据保存在当前浏览器或 Android App 的本地存储中。建议定期使用页面顶部的导出按钮备份 JSON 文件。
