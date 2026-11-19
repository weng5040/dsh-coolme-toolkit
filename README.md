# dsh-conversation-width

一个用于 [DeepSeek Harness（dsh）](https://github.com/deepseek-ai/deepseek-harness) 的会话内容宽度插件。

在 **设置 → 通用（Settings → General）** 中添加宽度滑块和数值输入框，按主内容区宽度的百分比调整会话正文、输入框及相关元素的宽度。

## 功能

- 可调范围：**20%–100%**，步进 1%。
- 默认值：**64%**，保持 dsh 官方的 `680–920px` 限制，不注入覆盖样式。
- 改为其他百分比后解除官方最大宽度限制，并保留 `320px` 最小宽度。
- 设置保存在浏览器 `localStorage`，支持同一浏览器的多个标签页同步。
- 提供中文和英文界面文本。
- 一键重置为官方默认值。

## 安装

在需要安装插件的 dsh 环境中执行：

```bash
dsh plugin --profile web add github:weng5040/dsh-conversation-width#v1.0.0
```

安装完成后重启 dsh，并刷新 Web UI。

> dsh 的插件命令底层使用 `pnpm`。如果提示 `spawn pnpm ENOENT`，请先安装 pnpm 并确保它在 `PATH` 中。

## 更新

安装最新发布版本：

```bash
dsh plugin --profile web add github:weng5040/dsh-conversation-width#v1.0.0
```

如果需要跟随 `main` 分支的最新代码：

```bash
dsh plugin --profile web add github:weng5040/dsh-conversation-width#main
```

更新完成后重启 dsh，并刷新 Web UI。

## 卸载

```bash
dsh plugin --profile web remove @local/dsh-conversation-width
```

卸载完成后重启 dsh，并刷新 Web UI。

## 使用

1. 打开 dsh Web UI。
2. 进入 **设置 → 通用**。
3. 找到 **会话内容宽度 / Conversation content width**。
4. 拖动滑块或输入百分比；点击 **重置** 恢复默认值。

## 本地开发

```bash
git clone https://github.com/weng5040/dsh-conversation-width.git
cd dsh-conversation-width
```

插件不需要构建，也没有第三方运行时依赖。目录结构：

```text
.
├── client.js          # 浏览器端：设置界面、样式和偏好存储
├── index.js           # Host 端入口
├── cordis.patch.yml   # dsh bundle patch
├── icon.svg
├── locale/            # 插件市场元数据翻译
└── package.json
```

## 兼容性

- dsh 仍处于开发者预览阶段，上游更新可能带来不兼容变更。
- 本插件使用 `slots`、`locale` 服务以及 `settings.general.item`、`shell.overlay` 插槽。
- `package.json` 中的 `private: true` 用于防止误发布到 npm；不影响从 GitHub 安装。
