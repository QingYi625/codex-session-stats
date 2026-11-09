# Changelog / 更新日志

All notable changes to this project are documented here. The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and the project uses [Semantic Versioning](https://semver.org/).

本项目的重要改动都记录在这里。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)，版本号遵循[语义化版本](https://semver.org/lang/zh-CN/)。

## [0.4.0] - 2026-11-09

### Changed / 变更

- **Refreshes every second.** The stats panel and the bottom bar now update every second instead of every 3 seconds.
- **面板和底部统计条改为每秒刷新**，以前是每 3 秒。

### Fixed / 修复

- **TPS no longer jumps to thousands of tok/s in continued chats.** When Codex continues a long chat in a new log file, the new file carries the whole chat's output total but only its own timing, so one chat showed 8,145 tok/s. All log files of a chat are now combined, and TPS is computed per model request, so the tokens and the time always come from the same steps. Across all 368 local chats, the highest value is now 275 tok/s.
- **续接的对话不会再出现几千 tok/s。** Codex 把长对话续写到新日志文件时，新文件带着整段对话的输出总量，但时间只有新文件自己的，所以有个对话显示 8,145 tok/s。现在会把同一对话的所有日志文件合在一起，并按每次模型请求计算 TPS，Token 和时间始终来自同一批步骤。本机全部 368 个对话里，最高值现在是 275 tok/s。
- 0.3.0 only counted output blocks with a recorded duration. Many blocks start and end at the same instant, so their tokens were counted without their time and TPS read high. 0.4.0 counts each request's whole output window, which gives lower but consistent numbers.
- 0.3.0 只统计记录了时长的输出块。很多输出块的开始和结束是同一时刻，它们的 Token 被算进去了，时间却没算，所以数值偏高。0.4.0 按每次请求的完整输出时间计算，数值更低，但口径一致。

| Chat / 对话 | 0.3.0 | 0.4.0 |
| --- | --- | --- |
| Continued chat / 续接的对话 | 8,145 tok/s | 39.3 tok/s |
| Claude Opus chat / Claude Opus 对话 | 100 tok/s | 51.2 tok/s |
| GPT-6.1 Sol chat / GPT-6.1 Sol 对话 | 44.2 tok/s | 28.7 tok/s |

## [0.3.0] - 2026-11-09

### Changed / 变更

- **Output speed (TPS) is now based on generation time.** It used to divide output tokens by model time, which also counted waiting for the first token and the gaps between steps, so it read far too low. It now divides by the time Codex records between the first and last token of each reasoning block and reply, with overlaps counted once. Model time is still shown as before.
- **输出速度（TPS）改为按实际生成时间计算。** 以前用输出 Token 除以模型用时，模型用时里还包含等待首 token 和步与步之间的空隙，所以数字明显偏低。现在除以 Codex 记录的每段思考和回复从开始输出到结束的时间，重叠部分只算一次。模型用时照常显示。

| Chat / 对话 | Before / 之前 | After / 之后 |
| --- | --- | --- |
| Claude Opus chat / Claude Opus 对话 | 30.3 tok/s | 97.7 tok/s |
| GPT-6.1 Sol chat / GPT-6.1 Sol 对话 | 18.8 tok/s | 44.2 tok/s |

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

[0.4.0]: https://github.com/QingYi625/codex-session-stats/compare/v0.3.0...v0.4.0
[0.3.0]: https://github.com/QingYi625/codex-session-stats/compare/v0.2.0...v0.3.0
[0.2.0]: https://github.com/QingYi625/codex-session-stats/compare/v0.1.0...v0.2.0
[0.1.0]: https://github.com/QingYi625/codex-session-stats/releases/tag/v0.1.0
