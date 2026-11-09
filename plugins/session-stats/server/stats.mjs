import fs from "node:fs";
import os from "node:os";
import path from "node:path";

const CODEX_HOME = process.env.CODEX_HOME || path.join(os.homedir(), ".codex");
const SESSIONS_DIR = path.join(CODEX_HOME, "sessions");
const INDEX_FILE = path.join(CODEX_HOME, "session_index.jsonl");
const TOOL_ITEM_TYPES = new Set(["CommandExecution", "McpToolCall", "FileChange", "Extension", "ImageView", "WebSearch"]);
const RECENT_DAYS = 14;
const RECENT_LIMIT = 30;
const LIVE_IDLE_MS = 15 * 60 * 1000;

const fileStates = new Map();
const metaCache = new Map();
const activityCache = new Map();
let indexCache = { mtimeMs: -1, size: -1, titles: new Map() };

function readFirstLine(filePath) {
  const fd = fs.openSync(filePath, "r");
  try {
    const chunks = [];
    const chunk = Buffer.alloc(64 * 1024);
    let position = 0;
    while (position < 8 * 1024 * 1024) {
      const bytesRead = fs.readSync(fd, chunk, 0, chunk.length, position);
      if (bytesRead <= 0) break;
      const newline = chunk.indexOf(10);
      if (newline >= 0 && newline < bytesRead) {
        chunks.push(Buffer.from(chunk.subarray(0, newline)));
        break;
      }
      chunks.push(Buffer.from(chunk.subarray(0, bytesRead)));
      position += bytesRead;
    }
    return Buffer.concat(chunks).toString("utf8");
  } finally {
    fs.closeSync(fd);
  }
}

function readMeta(filePath) {
  const cached = metaCache.get(filePath);
  if (cached) return cached;
  let meta = null;
  try {
    const record = JSON.parse(readFirstLine(filePath));
    if (record.type === "session_meta") {
      const payload = record.payload || {};
      const source = payload.source;
      meta = {
        id: payload.id || payload.session_id,
        cwd: payload.cwd || "",
        isSubagent: Boolean(source && typeof source === "object" && source.subagent) || Boolean(payload.parent_thread_id),
        startedAt: payload.timestamp || record.timestamp,
      };
    }
  } catch {
    meta = null;
  }
  if (meta) metaCache.set(filePath, meta);
  return meta;
}

function readTitles() {
  try {
    const stat = fs.statSync(INDEX_FILE);
    if (stat.mtimeMs === indexCache.mtimeMs && stat.size === indexCache.size) return indexCache.titles;
    const titles = new Map();
    for (const line of fs.readFileSync(INDEX_FILE, "utf8").split("\n")) {
      if (!line) continue;
      try {
        const entry = JSON.parse(line);
        if (entry.id && entry.thread_name) titles.set(entry.id, entry.thread_name);
      } catch {}
    }
    indexCache = { mtimeMs: stat.mtimeMs, size: stat.size, titles };
    return titles;
  } catch {
    return indexCache.titles;
  }
}

function lastActivityMs(filePath, size, fallbackMs) {
  const cached = activityCache.get(filePath);
  if (cached && cached.size === size) return cached.ms;
  let ms = fallbackMs;
  try {
    const fd = fs.openSync(filePath, "r");
    try {
      for (const window of [64 * 1024, 1024 * 1024, 16 * 1024 * 1024]) {
        const length = Math.min(size, window);
        const tail = Buffer.alloc(length);
        fs.readSync(fd, tail, 0, length, size - length);
        const matches = tail.toString("utf8").match(/"timestamp":"([^"]+)"/g);
        if (matches) {
          const parsed = Date.parse(matches[matches.length - 1].slice(13, -1));
          if (parsed) ms = parsed;
          break;
        }
        if (length === size) break;
      }
    } finally {
      fs.closeSync(fd);
    }
  } catch {}
  activityCache.set(filePath, { size, ms });
  return ms;
}

function recentSessionFiles() {
  const files = [];
  const now = new Date();
  for (let dayOffset = 0; dayOffset < RECENT_DAYS; dayOffset += 1) {
    const day = new Date(now.getTime() - dayOffset * 86400000);
    const dir = path.join(
      SESSIONS_DIR,
      String(day.getFullYear()),
      String(day.getMonth() + 1).padStart(2, "0"),
      String(day.getDate()).padStart(2, "0"),
    );
    let names = [];
    try {
      names = fs.readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of names) {
      if (!name.endsWith(".jsonl")) continue;
      const filePath = path.join(dir, name);
      try {
        const stat = fs.statSync(filePath);
        files.push({ filePath, mtimeMs: lastActivityMs(filePath, stat.size, stat.mtimeMs) });
      } catch {}
    }
  }
  files.sort((a, b) => b.mtimeMs - a.mtimeMs);
  return files;
}

export function listRecentThreads() {
  const titles = readTitles();
  const threads = [];
  for (const file of recentSessionFiles()) {
    const meta = readMeta(file.filePath);
    if (!meta || meta.isSubagent || !meta.id) continue;
    threads.push({
      id: meta.id,
      title: titles.get(meta.id) || path.basename(meta.cwd) || meta.id,
      cwd: meta.cwd,
      updatedAt: new Date(file.mtimeMs).toISOString(),
      filePath: file.filePath,
    });
    if (threads.length >= RECENT_LIMIT) break;
  }
  return threads;
}

function findThreadFile(threadId) {
  for (const file of recentSessionFiles()) {
    if (path.basename(file.filePath).includes(threadId)) {
      const meta = readMeta(file.filePath);
      if (meta && meta.id === threadId) return file.filePath;
    }
  }
  return null;
}

function newState(filePath) {
  return {
    filePath,
    offset: 0,
    leftover: Buffer.alloc(0),
    turns: new Map(),
    turnOrder: [],
    steps: 0,
    toolCount: 0,
    toolTimeMs: 0,
    totalUsage: null,
    lastUsage: null,
    contextWindow: null,
    lastEventMs: 0,
    model: null,
  };
}

function ensureTurn(state, turnId, startedMs) {
  let turn = state.turns.get(turnId);
  if (!turn) {
    turn = { startedMs, endedMs: null, durationMs: null, ttftMs: null, toolIntervals: [] };
    state.turns.set(turnId, turn);
    state.turnOrder.push(turnId);
  }
  if (startedMs && (!turn.startedMs || startedMs < turn.startedMs)) turn.startedMs = startedMs;
  return turn;
}

function handleRecord(state, line) {
  const head = line.slice(0, 480);
  const isEvent = head.includes('"type":"event_msg"');
  const isUsageRecord = head.includes('"type":"token_usage_record"');
  const isSettings = isEvent && head.includes('"type":"thread_settings_applied"');
  if (!isEvent && !isUsageRecord) return;
  if (isEvent) {
    const wanted =
      head.includes('"type":"task_started"') ||
      head.includes('"type":"task_complete"') ||
      head.includes('"type":"turn_aborted"') ||
      head.includes('"type":"token_count"') ||
      isSettings ||
      (head.includes('"type":"item_completed"') &&
        [...TOOL_ITEM_TYPES].some((type) => head.includes(`"item":{"type":"${type}"`)));
    if (!wanted) return;
  }
  let record;
  try {
    record = JSON.parse(line);
  } catch {
    return;
  }
  const payload = record.payload || {};
  const timestampMs = Date.parse(record.timestamp) || 0;
  if (timestampMs > state.lastEventMs) state.lastEventMs = timestampMs;

  if (record.type === "token_usage_record") {
    state.steps += 1;
    if (payload.thread_token_usage) state.totalUsage = payload.thread_token_usage;
    if (payload.usage) state.lastUsage = payload.usage;
    return;
  }

  switch (payload.type) {
    case "task_started": {
      const turn = ensureTurn(state, payload.turn_id, timestampMs);
      if (payload.model_context_window) state.contextWindow = payload.model_context_window;
      turn.endedMs = null;
      break;
    }
    case "task_complete":
    case "turn_aborted": {
      const turn = ensureTurn(state, payload.turn_id, payload.started_at ? payload.started_at * 1000 : timestampMs);
      turn.endedMs = timestampMs;
      if (typeof payload.duration_ms === "number") turn.durationMs = payload.duration_ms;
      if (typeof payload.time_to_first_token_ms === "number") turn.ttftMs = payload.time_to_first_token_ms;
      break;
    }
    case "token_count": {
      const info = payload.info;
      if (info) {
        if (info.total_token_usage) state.totalUsage = info.total_token_usage;
        if (info.last_token_usage) state.lastUsage = info.last_token_usage;
        if (info.model_context_window) state.contextWindow = info.model_context_window;
      }
      break;
    }
    case "thread_settings_applied": {
      const model = payload.thread_settings && payload.thread_settings.model;
      if (model) state.model = model;
      break;
    }
    case "item_completed": {
      const item = payload.item || {};
      if (!TOOL_ITEM_TYPES.has(item.type)) break;
      const startMs = payload.started_at_ms || timestampMs;
      let endMs = payload.completed_at_ms || timestampMs;
      if (item.duration && typeof item.duration.secs === "number") {
        const reportedMs = item.duration.secs * 1000 + Math.round((item.duration.nanos || 0) / 1e6);
        if (reportedMs > endMs - startMs) endMs = startMs + reportedMs;
      }
      const turn = ensureTurn(state, payload.turn_id, startMs);
      turn.toolIntervals.push([startMs, endMs]);
      state.toolCount += 1;
      state.toolTimeMs += Math.max(0, endMs - startMs);
      break;
    }
    default:
      break;
  }
}

function updateState(filePath) {
  let state = fileStates.get(filePath);
  const size = fs.statSync(filePath).size;
  if (!state || size < state.offset) {
    state = newState(filePath);
    fileStates.set(filePath, state);
  }
  if (size === state.offset) return state;
  const fd = fs.openSync(filePath, "r");
  try {
    const length = size - state.offset;
    const fresh = Buffer.alloc(length);
    let read = 0;
    while (read < length) {
      const bytesRead = fs.readSync(fd, fresh, read, length - read, state.offset + read);
      if (bytesRead <= 0) break;
      read += bytesRead;
    }
    state.offset += read;
    const buffer = state.leftover.length ? Buffer.concat([state.leftover, fresh.subarray(0, read)]) : fresh.subarray(0, read);
    const lastNewline = buffer.lastIndexOf(10);
    if (lastNewline < 0) {
      state.leftover = Buffer.from(buffer);
      return state;
    }
    state.leftover = Buffer.from(buffer.subarray(lastNewline + 1));
    const text = buffer.subarray(0, lastNewline).toString("utf8");
    let start = 0;
    while (start < text.length) {
      let end = text.indexOf("\n", start);
      if (end < 0) end = text.length;
      if (end > start) handleRecord(state, text.slice(start, end));
      start = end + 1;
    }
  } finally {
    fs.closeSync(fd);
  }
  return state;
}

function unionLength(intervals, lower, upper) {
  const clipped = intervals
    .map(([start, end]) => [Math.max(start, lower), Math.min(end, upper)])
    .filter(([start, end]) => end > start)
    .sort((a, b) => a[0] - b[0]);
  let total = 0;
  let currentStart = null;
  let currentEnd = null;
  for (const [start, end] of clipped) {
    if (currentEnd === null || start > currentEnd) {
      if (currentEnd !== null) total += currentEnd - currentStart;
      currentStart = start;
      currentEnd = end;
    } else if (end > currentEnd) {
      currentEnd = end;
    }
  }
  if (currentEnd !== null) total += currentEnd - currentStart;
  return total;
}

function summarize(state, now) {
  let modelTimeMs = 0;
  let ttftSum = 0;
  let ttftCount = 0;
  let running = false;
  const lastTurnId = state.turnOrder[state.turnOrder.length - 1];
  for (const turnId of state.turnOrder) {
    const turn = state.turns.get(turnId);
    if (!turn.startedMs) continue;
    let endMs = turn.endedMs;
    if (turn.durationMs !== null && turn.durationMs !== undefined) endMs = turn.startedMs + turn.durationMs;
    if (!endMs) {
      const live = turnId === lastTurnId && now - state.lastEventMs < LIVE_IDLE_MS;
      endMs = live ? now : state.lastEventMs;
      if (live) running = true;
    }
    const wallMs = Math.max(0, endMs - turn.startedMs);
    modelTimeMs += Math.max(0, wallMs - unionLength(turn.toolIntervals, turn.startedMs, endMs));
    if (typeof turn.ttftMs === "number" && turn.ttftMs > 0) {
      ttftSum += turn.ttftMs;
      ttftCount += 1;
    }
  }
  const usage = state.totalUsage || {};
  const inputTokens = usage.input_tokens || 0;
  const cachedTokens = usage.cached_input_tokens || 0;
  const outputTokens = usage.output_tokens || 0;
  const lastInput = (state.lastUsage && state.lastUsage.input_tokens) || 0;
  return {
    turns: state.turnOrder.length,
    steps: state.steps,
    toolCalls: state.toolCount,
    running,
    modelTimeMs,
    toolTimeMs: state.toolTimeMs,
    avgTtftMs: ttftCount ? Math.round(ttftSum / ttftCount) : null,
    outputTps: modelTimeMs > 0 ? outputTokens / (modelTimeMs / 1000) : null,
    tokens: {
      total: inputTokens + outputTokens,
      input: inputTokens,
      uncachedInput: Math.max(0, inputTokens - cachedTokens),
      cachedInput: cachedTokens,
      output: outputTokens,
      reasoningOutput: usage.reasoning_output_tokens || 0,
      cacheHitRate: inputTokens > 0 ? cachedTokens / inputTokens : null,
    },
    context: {
      window: state.contextWindow,
      used: lastInput,
      usedRate: state.contextWindow ? lastInput / state.contextWindow : null,
    },
    model: state.model,
    lastEventAt: state.lastEventMs ? new Date(state.lastEventMs).toISOString() : null,
  };
}

function normalizeTitle(value) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function findThreadByTitle(title, recent) {
  const wanted = normalizeTitle(title);
  if (!wanted) return null;
  const candidates = recent.filter((thread) => normalizeTitle(thread.title) === wanted);
  if (candidates.length) return candidates[0];
  const ids = [];
  for (const [id, name] of readTitles()) if (normalizeTitle(name) === wanted) ids.push(id);
  for (const id of ids.reverse()) {
    const filePath = findThreadFile(id);
    if (filePath) return { id, title, filePath, cwd: "" };
  }
  return null;
}

export function getSessionStats({ threadId, hintIds = [], title } = {}) {
  const recent = listRecentThreads();
  let target = null;
  let selection = "auto";
  if (threadId) {
    target = recent.find((thread) => thread.id === threadId) || null;
    if (!target) {
      const filePath = findThreadFile(threadId);
      if (filePath) target = { id: threadId, title: readTitles().get(threadId) || threadId, filePath, cwd: "" };
    }
    selection = "pinned";
  }
  if (!target) {
    for (const hint of hintIds) {
      const match = recent.find((thread) => thread.id === hint);
      if (match) {
        target = match;
        selection = "host";
        break;
      }
    }
  }
  if (!target && title) {
    target = findThreadByTitle(title, recent);
    if (target) selection = "window";
  }
  if (!target) {
    target = recent[0] || null;
    selection = "auto";
  }
  const threads = recent.map(({ id, title, updatedAt }) => ({ id, title, updatedAt }));
  if (!target) {
    return { ok: false, error: `没有在 ${SESSIONS_DIR} 找到最近的会话日志`, threads, generatedAt: new Date().toISOString() };
  }
  const now = Date.now();
  const state = updateState(target.filePath);
  return {
    ok: true,
    selection,
    thread: { id: target.id, title: target.title, cwd: target.cwd || "" },
    stats: summarize(state, now),
    threads,
    generatedAt: new Date(now).toISOString(),
  };
}
