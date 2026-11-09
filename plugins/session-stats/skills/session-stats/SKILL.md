---
name: session-stats
description: Use when the user asks to see, open, or check Codex session statistics, token usage, cache hit rate, turn or step counts, model or tool time, TTFT, or output speed for the current chat.
---

Call the `session_stats_panel` tool to open the live statistics panel. It reads the local Codex session log, so it needs no arguments; pass `threadId` only when the user names a specific chat ID.

After the panel opens, report the headline numbers from the tool's text result in one or two sentences. Note that TTFT comes from Codex's per-turn records and output speed is estimated as output tokens divided by model time, so they can differ from other displays.
