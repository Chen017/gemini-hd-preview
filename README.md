# Gemini HD Preview

[中文](#中文说明) · [English](#english)

A lightweight Tampermonkey userscript for displaying **real full-resolution Gemini-generated images inside the chat**, without saving a file when using the custom HD button.

> Unofficial community project. Not affiliated with Google or Gemini.

## 中文说明

Gemini 网页版常以约 1K 的预览图显示生成图片，即使会员使用官方「下载完整尺寸」可以得到更高分辨率。本脚本在图片上加入悬停显示的 **HD** 按钮，让用户直接在对话中查看官方高清图片。

### 功能

- **真正的 2K**：复用 Gemini 原生高清获取请求，检查实际像素后替换预览，不进行简单的 CSS 放大。
- **HD 按钮**：只在鼠标悬停图片上时显示，位置位于图片左上角内侧。
- **不保存文件**：自定义 HD 操作获取图片后，会阻止该次原生下载响应继续进入 Gemini 的保存流程。
- **1K 备用预览**：当图片存在可识别的 `googleusercontent.com` CDN URL 时，尝试 `=s0-rp`；对于 `blob:` 预览无法直接推导该 URL。
- **不影响普通下载**：不使用 HD 按钮时，Gemini 自带的下载按钮保持原有行为。

### 安装

1. 安装 [Tampermonkey](https://www.tampermonkey.net/) 等兼容用户脚本管理器。
2. 点击 [安装脚本](https://raw.githubusercontent.com/Chen017/gemini-hd-preview/main/gemini-hd-preview.user.js)。
3. 在脚本管理器中确认安装，打开或刷新 [Gemini](https://gemini.google.com/)。
4. 悬停生成图片，点击 **HD**；等待按钮变成 **2K ✓**。

> 请禁用任何旧版本 Gemini HD Preview，以免重复挂钩网络请求。

### 工作原理与限制

本脚本调用对应图片的 Gemini 原生下载按钮，然后在当前网页的 `fetch` 返回完整尺寸图片时复制响应、校验图像尺寸并替换页面上的图片。校验通过后，仅让**该次 HD 操作**中的高清图片请求返回 `AbortError`，从而阻断保存流程。

- 依赖 Gemini 未公开的页面结构与内部下载流程，未来可能失效。
- 点击 HD 时 Gemini 可能出现原生的“下载失败”消息或 Console 错误；这是为不保存文件而中断原始响应的副作用。
- 每次只处理一张图片；如果图片与返回文件宽高比不符，不替换也不阻断原始响应。
- 按钮启动后可能需要等待数十秒；达到 90 秒会超时。
- 脚本不会上传图片或读取 Cookie；图片通过现有浏览器会话获取。
- 没有在所有 Gemini 版本及所有浏览器上验证，实测成功案例来自该项目开发过程中的浏览器测试。

### 配置

修改脚本顶部 `CONFIG.buttonInset` 调整 HD 按钮相对图片左上角的距离（默认 22px）；`CONFIG.debug` 可开启诊断日志。

### 反馈

如功能失效，请在 [Issues](https://github.com/Chen017/gemini-hd-preview/issues) 提供浏览器版本、脚本版本和**脱敏**的 Console 输出。请勿发布 Cookie、访问令牌、完整 RPC Payload 或签名图片 URL。

## English

Gemini chat often displays compressed previews even when full-resolution downloads are available to eligible accounts. This userscript adds a hover-only **HD** button to preview the actual full-resolution image in place.

### Features

- Uses Gemini's native full-size image fetch instead of upscaling a thumbnail.
- Validates actual decoded image dimensions before replacement.
- Attempts to suppress file saving only for custom HD-button requests.
- Keeps Gemini's native download button unchanged.
- Attempts a `=s0-rp` fallback when a suitable CDN preview URL exists.
- Configurable button inset; no external libraries.

### Installation

1. Install [Tampermonkey](https://www.tampermonkey.net/).
2. [Install the userscript](https://raw.githubusercontent.com/Chen017/gemini-hd-preview/main/gemini-hd-preview.user.js).
3. Refresh [Gemini](https://gemini.google.com/).
4. Hover over a generated image and click **HD**.

### Limitations

Gemini's undocumented DOM and network APIs may change. The custom HD action may produce a native download failure notification because it intentionally rejects the original image response after copying it into the preview. Timeout is 90 seconds. Disable older versions before installing.

### Publishing

The repository's `.user.js` file can be published to [Greasy Fork](https://greasyfork.org/) as a new script. Keep the source file and `@version` updated for releases.

### License

Licensed under the [MIT License](LICENSE). Copyright (c) 2026 Chen017.
