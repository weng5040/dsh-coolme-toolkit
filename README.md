# CoolMe Toolkit

**CoolMe 的个人 dsh 工具箱。** 将四个本地小插件合并为一个 [DeepSeek Harness（dsh）](https://github.com/deepseek-ai/deepseek-harness) bundle，只需安装、更新和维护一个项目。

> 原项目 `dsh-conversation-width` 已更名为 `dsh-coolme-toolkit`，旧 GitHub 地址会自动跳转。

## 包含功能

| 功能 | 作用 | 运行位置 |
|---|---|---|
| 会话内容宽度 | 在 **设置 → 通用** 中按主列百分比调整会话正文宽度，范围 20%–100% | Client |
| 设置弹窗尺寸 | 调整设置弹窗的宽度和高度，支持滑块、数字输入和一键重置 | Client |
| 服务重启 | 在 **设置 → 通用** 中提供两击确认的重启按钮，等待新进程恢复后自动刷新 | Host + Client |
| fake-ip 放行 | 允许 `web_fetch` 接受透明代理的 `198.18.0.0/15` fake-ip 应答，不修改 dsh 安装文件 | Host |

原有的浏览器存储键保持不变，合并前的会话宽度和弹窗尺寸设置会保留。

## 从旧插件迁移

**先移除旧插件，再安装工具箱。不要同时启用新旧版本**：它们使用相同的 UI 插槽和重启路由，同时加载会发生冲突。

```bash
dsh plugin --profile web remove @local/dsh-conversation-width
dsh plugin --profile web remove @local/dsh-settings-size
dsh plugin --profile web remove @local/dsh-service-restart
dsh plugin --profile web remove @local/dsh-fake-ip-allowlist

dsh plugin --profile web add github:weng5040/dsh-coolme-toolkit#v2.0.0
```

如果某条 `remove` 提示对应插件未安装，继续执行其余命令即可。完成后重启 dsh 并刷新 Web UI。

> dsh 的插件命令底层使用 `pnpm`。如果提示 `spawn pnpm ENOENT`，请先安装 pnpm 并确保它在 `PATH` 中。

## 全新安装

```bash
dsh plugin --profile web add github:weng5040/dsh-coolme-toolkit#v2.0.0
```

安装完成后重启 dsh，并刷新 Web UI。

## 更新

跟随 `main` 分支的最新代码：

```bash
dsh plugin --profile web add github:weng5040/dsh-coolme-toolkit#main
```

或安装指定 Release（将版本号替换为目标版本）：

```bash
dsh plugin --profile web add github:weng5040/dsh-coolme-toolkit#v2.0.0
```

更新完成后重启 dsh，并刷新 Web UI。

## 卸载

```bash
dsh plugin --profile web remove @local/dsh-coolme-toolkit
```

卸载完成后重启 dsh，并刷新 Web UI。

## 配置

默认 bundle 配置位于 [`cordis.patch.yml`](./cordis.patch.yml)：

```yaml
config:
  fakeIp:
    band: '198.18.0.0/15'
    probe: true
  restart:
    unit: 'dsh-web.service'
    delaySeconds: 1
```

- `fakeIp.band`：需要放行的单个 IPv4 CIDR；只有网段内或原本就被上游规则接受的地址才会放行。
- `fakeIp.probe`：激活后探测包装后的 resolver 是否仍被 dsh 调用。
- `restart.unit`：允许使用合法的 systemd unit 名称，默认 `dsh-web.service`。
- `restart.delaySeconds`：返回 HTTP 响应后、执行重启前的延迟秒数。

### fake-ip 安全边界

该功能只针对 Clash/Mihomo 默认 fake-ip 网段做窄范围放行，**不是放开所有内网地址**。回环、链路本地、RFC 1918 私网及其他保留地址仍由 dsh 上游 SSRF 规则拦截。

激活和自检结果会写入 dsh 日志，可使用以下命令检查：

```bash
grep 'dsh-coolme-toolkit' /var/log/dsh-web.log
```

### 服务重启警告

重启按钮等价于：

```bash
systemctl restart dsh-web.service
```

重启会中断正在运行的会话，因此界面要求连续点击两次确认。按钮通过独立 transient unit 调度重启，避免 dsh 自身 cgroup 被 teardown 时把重启命令一并终止。

## 项目结构

```text
.
├── index.js            # 统一 Host 入口，组合两个 Host 功能
├── fake-ip.js          # web_fetch fake-ip resolver 包装
├── service-restart.js  # 认证重启路由
├── client.js           # 三个独立的 Client UI 模块
├── verify.mjs          # fake-ip 独立验证工具
├── cordis.patch.yml    # 单 bundle 声明与默认配置
├── icon.svg
├── locale/
└── package.json
```

无需构建，也没有第三方运行时依赖。`private: true` 只用于防止误发布到 npm，不影响从 GitHub 安装。

## 故障排查

- 工具箱整体未加载：在 dsh 日志中查 `did not activate`。
- fake-ip 放行未生效：`grep 'dsh-coolme-toolkit' /var/log/dsh-web.log`，或运行 `node <插件目录>/verify.mjs`。
- 重启按钮不可用：同一日志中查 `WARN webServer/connection services are unavailable`。
- 设置页缺少三行：刷新页面后检查浏览器控制台，确认 `@local/dsh-coolme-toolkit/*` 三个 client 模块均注册成功。

## 兼容性

dsh 仍处于开发者预览阶段，上游更新可能改变插件 API、UI 插槽或 `web_fetch` 的实现。如果升级后功能异常，请先查看 dsh 日志，再检查本项目的更新。
