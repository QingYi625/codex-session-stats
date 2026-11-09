# Changelog / 更新日志

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

本项目的重要改动都记录在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.2.0] - 2026-11-09

### Fixed / 修复

- **Bottom bar now follows the chat you are viewing.** Previously it tracked the chat with the most recent log activity, so after switching to an older chat the bar kept showing the old numbers until you sent a message there. It now reads the open chat's title from the Codex window about every 0.7 seconds and refreshes immediately when it changes.
- **底部统计条现在会跟随你正在看的对话。** 以前它统计的是“最近有新记录的对话”，切换到一个旧对话后，要在那个对话里发一条消息才会刷新。现在它每隔约 0.7 秒读取 Codex 窗口里当前打开的对话标题，标题一变就立刻刷新。

### Notes / 说明

- If the open chat cannot be matched (for example, a brand-new chat with no log yet), the bar falls back to the most recently active chat.
- If two chats have exactly the same title, the bar picks the more recently active one.
- 如果对不上当前打开的对话（例如刚新建、还没写日志的对话），会退回统计最近活动的会话。
- 如果有两个对话标题完全相同，会选择最近活动的那个。

## [0.1.0] - 2026-11-09

First public release. / 首个公开版本。

### Added / 新增

- **Codex plugin** with an MCP App stats panel (`@会话统计`), refreshed every 3 seconds: turns, steps, model time, tool time, TTFT, TPS, total tokens, cache hit rate, uncached input, cached input, output, and context usage.
- **Windows bottom bar**: a transparent bar centered below the Codex composer that follows the window, with click-to-open detail cards that close when you click elsewhere.
- Bottom bar starts on sign-in by default, with a right-click toggle and a `--no-autostart` option.
- English and Simplified Chinese README.
- **Codex 插件**：通过 `@会话统计` 打开 MCP App 统计面板，每 3 秒刷新，显示轮数、步数、模型用时、工具用时、TTFT、TPS、Token 总量、缓存命中率、未缓存输入、缓存读取、输出和上下文占用。
- **Windows 底部统计条**：透明背景，居中贴在 Codex 输入框下方并跟随窗口移动；点击摘要弹出详情，点其他地方自动关闭。
- 统计条默认开机自启，可以右键切换，也可以用 `--no-autostart` 参数关闭。
- 中英双语 README。

[0.2.0]: https://github.com/QingYi625/codex-session-stats/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/QingYi625/codex-session-stats/releases/tag/v0.1.0
