# Codex 会话统计（session-stats）

在 Codex 桌面版里实时查看当前会话的轮数、步数、用时、首 token 时间、输出速度和 Token 缓存用量。

![底部统计条：显示在 Codex 输入框正下方](docs/bottom-bar.png)

点击任一组摘要会弹出详情：

<p>
  <img src="docs/detail-session.png" alt="会话统计详情" width="360">
  <img src="docs/detail-tokens.png" alt="Token 用量详情" width="360">
</p>

本项目包含两部分，可以单独使用：

- **Codex 插件**：在对话里输入 `@会话统计`，会在对话中或右侧标签页打开统计面板，每 3 秒刷新一次。
- **底部统计条（仅 Windows）**：一个透明的小条，贴在 Codex 输入框正下方并居中显示，跟随 Codex 窗口移动。点击其中一组摘要会弹出详情卡片，点击其他地方自动关闭。

所有数据都只在本机读取，来源是 Codex 写在本地的会话日志（`~/.codex/sessions`），不会上传。

## 显示的数据

| 分组 | 项目 |
| --- | --- |
| 会话统计 | 轮数、步数、模型用时、工具调用用时、首 token 平均（TTFT）、输出速度（TPS） |
| Token 用量 | Token 总量、缓存命中率、未缓存输入、缓存读取、输出 |

面板里还会显示当前上下文占用。

### 数据口径

- **Token 数**：直接取自 Codex 日志里的累计用量，是精确值。
- **TTFT**：取自 Codex 记录的每轮首 token 时间；还在进行中的一轮没有这个值，所以有时会暂时显示 `—`。
- **模型用时**：每轮总时长减去其中工具调用占用的时间，是估算值。
- **输出速度**：输出 Token 数除以模型用时，是估算值，可能和其他工具显示的数字不同。
- **刷新节奏**：Codex 每完成一步才写一次用量，所以数字是一步一步跳的，不是逐字增长。

## 环境要求

- Codex 桌面版（需要支持插件和 MCP Apps）
- Node.js 18 或更高版本，并且 `node` 在 `PATH` 里
- 底部统计条额外需要 Windows 10/11，以及系统自带的 .NET Framework 4.x（用来编译）

## 安装插件

```bash
git clone https://github.com/QingYi625/codex-session-stats.git
codex plugin marketplace add ./codex-session-stats
codex plugin add session-stats@local-session-stats
```

装好后**新建一个对话**（已经打开的对话不会加载新插件），输入 `@会话统计` 或“打开会话统计面板”即可。

面板里可以切换要统计的会话，也可以暂停自动刷新。

卸载：

```bash
codex plugin remove session-stats
```

## 底部统计条（Windows）

统计条以源码形式提供，需要先在本机编译一次：

```bat
plugins\session-stats\bar\build.cmd
```

编译后会生成 `plugins\session-stats\bar\SessionStatsBar.exe`，双击运行即可。

- 统计条只在 Codex 窗口可见时显示，Codex 最小化时自动隐藏。
- 默认统计**最近活动的会话**。
- 点击“会话统计”或“Token 用量”摘要会弹出详情，再点同一组、点其他地方都会关闭。
- 右键统计条可以退出。
- 背景透明，会根据背后颜色自动切换深色或浅色文字。

统计条是一个独立的小程序，**不会随 Codex 自动启动**。它启动后会一直在后台等待：Codex 打开时自动出现，关闭或最小化时自动隐藏，所以只需要让它开机启动一次即可。

### 开机自启（可选）

按 `Win + R`，输入 `shell:startup` 打开启动文件夹，把 `SessionStatsBar.exe` 的快捷方式放进去即可。之后每次开机它都会在后台运行，打开 Codex 时统计条会自动出现。

也可以在 PowerShell 里一次完成（在仓库根目录执行）：

```powershell
$exe = (Resolve-Path plugins\session-stats\bar\SessionStatsBar.exe).Path
$lnk = Join-Path ([Environment]::GetFolderPath('Startup')) 'Codex Session Stats Bar.lnk'
$shortcut = (New-Object -ComObject WScript.Shell).CreateShortcut($lnk)
$shortcut.TargetPath = $exe
$shortcut.WorkingDirectory = Split-Path $exe
$shortcut.Save()
```

取消开机自启：删除启动文件夹里的这个快捷方式即可。

### 工作原理

- 用 Windows 窗口事件钩子跟随 Codex 窗口移动。
- 用 UI Automation 读取 Codex 输入框的实际位置，保证最大化、调整大小、收起侧边栏后仍然居中。
- 打开详情时会临时注册一个低级鼠标钩子，用来实现“点外面关闭”，关闭详情后立即注销。钩子只判断点击位置，不记录任何输入。

## 项目结构

```text
.agents/plugins/marketplace.json     本地插件市场清单
plugins/session-stats/
  plugin.json                        插件清单（Agent Plugins 格式）
  .codex-plugin/plugin.json          Codex 兼容清单
  mcp.json / .mcp.json               MCP 服务配置
  server/stats.mjs                   解析会话日志、计算统计
  server/index.mjs                   MCP 服务（stdio，零依赖）
  server/bar-feed.mjs                给底部统计条输出数据
  ui/panel.html                      统计面板（MCP App）
  skills/session-stats/SKILL.md      让 Codex 知道何时打开面板
  bar/StatsBar.cs                    底部统计条源码
  bar/build.cmd                      统计条编译脚本
```

## 注意事项

- 会话日志的格式是 Codex 的内部实现，不是公开接口。Codex 更新后统计可能失效，届时需要跟着调整解析代码。
- 底部统计条是一个独立的小窗口，并不是 Codex 界面的一部分；快速拖动窗口时可能有轻微拖影。
- 对话区的位置靠 UI Automation 读取，读不到时会退回按窗口比例估算。
- 本项目与 OpenAI 无关，不是官方插件。

## 许可证

[MIT](LICENSE)
