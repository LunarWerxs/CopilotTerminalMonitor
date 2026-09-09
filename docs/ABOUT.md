# Copilot Terminal Monitor

> Watches VS Code terminals for idle or overrun commands and can auto-terminate them, fully local, no telemetry.

<!-- odin:about HAND-OWNED above the GENERATED marker. Edit freely; `odin codex about --ingest` carries it back into Odin's Codex. -->

## What it is

A VS Code extension that monitors terminal commands and alerts when one produces no output for a set duration or exceeds a total run-time limit. Tracks idle state and total runtime in the status bar, with optional auto-termination (graceful SIGINT then force-close) and high-intensity notifications. Free, runs entirely locally, no telemetry.

## Things not to forget

_The intricacies worth remembering: the gotchas, the half-built parts, the decisions whose
reason lives nowhere else. Odin never overwrites this section._

- Auto-terminate escalation only tries SIGINT (Ctrl+C) first when the 'useSigInt' setting is on; if it is off, terminateExecution() skips straight to force-disposing the terminal with no grace attempt at all. anchors: `src/extension.ts:89-106`
- Even with SIGINT enabled, it force-closes after a configurable retry count (hardTerminateRetries, default 3) rather than waiting indefinitely for the process to respond to Ctrl+C. anchors: `src/extension.ts:96-103`
- Exclusion patterns match only the terminal's title (terminal.name), not the command line actually running in it, so a generically named terminal (bash, pwsh) running several different commands can only be excluded all-or-nothing by renaming the tab - a known, tracked gap, not an oversight. anchors: `src/extension.ts:58`
- The only platform-specific code in the whole repo is in the packaging script, not the extension itself: build_vsix_tmon.py appends a .cmd suffix to npm/vsce invocations on Windows; extension.ts has no runtime OS branching. anchors: `build_vsix_tmon.py:22`
- Requires VS Code's Shell Integration API (engines.vscode pinned to ^1.108.1) to see command start/end/output events at all; without shell integration active in the user's shell, tracking silently does nothing. anchors: `package.json:20-21`
- All execution/idle state lives in an in-memory Map (activeExecutions) on the extension's MonitorState - nothing is written to disk, so every tracked command, snooze, and exclusion-for-this-run is lost on a VS Code restart or window reload. anchors: `src/extension.ts:30-43`
- The in-app Settings Management UI edits VS Code's real configuration keys directly (terminalIdleMonitor.*) via a hand-built HTML/webview panel rather than deferring to the native Settings UI, so any new setting needs matching hand-written HTML plus a handler. anchors: `src/extension.ts:469`

<!-- odin:about GENERATED BEGIN - rewritten by `odin codex about --publish`; edit the Codex, not this -->

## What Odin knows about this project

Everything from here down is generated from this project's Codex dossier
(`codex/projects/copilot-vscode-terminal-monitor.md` in the Odin clone) and is **rewritten on every publish** -
edit the dossier, not this block. Everything ABOVE the marker is yours.

### At a glance

- **Ships as:** VS Code extension - distributed via Visual Studio Code Marketplace
- **Live at:** https://marketplace.visualstudio.com/items?itemName=LunarWerx.copilot-terminal-monitor
- **Written in:** TypeScript (4 files), JavaScript (3 files), Python (1 files)
- **Built with:** TypeScript, esbuild
- **Package:** `copilot-terminal-monitor` 1.4.2
- **Entry points:** `main`, `scripts`
- **Tests:** 2 test file(s)
- **CI:** `ci.yml`, `release.yml`
- **Domain:** terminal monitoring, idle detection, process timeout, auto-termination, VS Code integration, developer tools, shell integration
- **Remote:** https://github.com/LunarWerxs/CopilotTerminalMonitor.git

### Architecture

- `src/` - Main extension logic: terminal event listeners, idle/timeout checking, settings management, status bar rendering, notification dispatch.
- `.vscode/` - VS Code workspace configuration and launch profiles for extension development and testing.
- `docs/` - Documentation and guides for end users and developers.
- `dist/` - Compiled output of esbuild; the extension.js entry point loaded by VS Code.

### Features

11 recorded - 11 shipped, 0 partial, 0 planned. Each `path:line` is where the feature is DEFINED, checked by `odin codex check`.

**Shipped**

- **Idle Tracking & Notification** _(free)_ - Monitors terminal output and fires a notification when a running command produces no output for a configured duration (default 60 seconds). - `src/extension.ts:652`, `src/logic.ts:64`
- **Total Runtime Tracking** _(free)_ - Alerts when a process exceeds a total run-time threshold (default 5 minutes) regardless of output activity. - `src/extension.ts:687`, `src/extension.ts:744`
- **Auto-Terminate with Escalation** _(free)_ - Automatically terminates processes: first attempts graceful termination via SIGINT (Ctrl+C), retries up to configured limit, then force-closes the terminal. - `src/extension.ts:89`, `src/extension.ts:744`
- **Status Bar Integration** _(free)_ - Displays live runtime and idle state with dynamic icons in the status bar; updates in real-time as commands execute. - `src/extension.ts:142`, `src/extension.ts:827`
- **Obnoxious Mode** _(free)_ - High-intensity alerting: flashes the VS Code UI in a configured color and shows unmissable modal popups for time-limit breaches. - `src/extension.ts:170`, `src/extension.ts:597`
- **Snooze Alerts** _(free)_ - Temporarily silence notifications for a specific command: 5, 10, or 15 minute snooze options via context menu. - `src/extension.ts:220`, `src/extension.ts:353`
- **Tag-Style Exclusion Patterns** _(free)_ - Modern exclusion management: match terminal titles against patterns (e.g., 'watch', 'dev-server') to exclude them from monitoring entirely. - `src/extension.ts:58`, `src/extension.ts:109`
- **Settings Management UI** _(free)_ - Built-in HTML settings panel for configuration: timeouts, termination behavior, obnoxious mode, exclusions, with workspace and global scope overrides. - `src/extension.ts:469`, `src/extension.ts:1016`
- **Enable/Disable Commands** _(free)_ - VS Code commands to quickly enable or disable monitoring from the command palette or quick menu. - `src/extension.ts:579`, `src/extension.ts:586`
- **Terminal Event Tracking** _(free)_ - Hooks into VS Code terminal shell integration to track command start, end, and output events with platform-aware shell detection. - `src/extension.ts:890`, `src/extension.ts:930`
- **Quick Actions Menu (Status Bar)** _(free)_ - Clicking the status bar item (or running 'Terminal Monitor: Show Menu') opens a Quick Pick with Reset Timer, Snooze 5/10/15m, and Terminate for the active terminal; lists every background execution with its own idle time and a 'Terminate All Background Tasks' action; toggles Auto-Terminate (Destructive Mode) per-workspace or globally; and offers Exclude Current Terminal and Open Settings. - `src/extension.ts:456`, `src/extension.ts:260`, `src/extension.ts:433`

### Where to add a new one

- **Add a new notification type or alert style** - Extend fireIdleNotification() and fireTotalNotification() functions in src/extension.ts; add new alert templates to showModalAlert() or showProgressAlert() stubs. anchors: `src/extension.ts:652`, `src/extension.ts:687`
- **Add a new configuration setting** - Add property to terminalIdleMonitor.* in package.json contributes.configuration, handle in handleSettingsUpdate() and getSettingsHtml() for UI rendering. anchors: `src/extension.ts:479`, `src/extension.ts:1016`
- **Add a new command or menu action** - Register command in package.json contributes.commands, add handler in extension.ts (e.g., handleOpenSettingsCommand, handleEnableCommand), wire via vscode.commands.registerCommand(). anchors: `src/extension.ts:579`, `src/extension.ts:970`
- **Modify idle or timeout check logic** - Update checkOneExecution() and runIdleCheck() logic; adjust idle/timeout thresholds, notification frequency, or condition for triggering alerts. anchors: `src/extension.ts:744`, `src/extension.ts:852`
- **Add platform-specific build handling** - Extend get_command() in build_vsix_tmon.py, which adds a .cmd suffix to npm/vsce invocations on Windows during packaging; this is the only platform branching in the repo (isTerminalAlive() and handleTerminalClose() in src/extension.ts contain no runtime platform-specific logic). anchors: `build_vsix_tmon.py:22`

### Gaps and wants

_Withheld: this repository is public, and the gap list is not published outside the private index._
_Read it with `python odin.py codex brief copilot-vscode-terminal-monitor` in the Odin clone._

---

_Generated by `odin codex about --publish copilot-vscode-terminal-monitor` on 2026-09-09 from a Codex dossier stamped 2026-09-05. Regenerate after the product moves; `odin codex about` reports drift._
<!-- odin:about GENERATED END sha=ec4c5574583e -->
