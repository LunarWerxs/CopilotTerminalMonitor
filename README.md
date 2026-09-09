# Terminal Idle Monitor

[![Version](https://img.shields.io/badge/version-1.4.2-blue.svg)](https://marketplace.visualstudio.com/items?itemName=LunarWerx.copilot-terminal-monitor)
[![VS Code](https://img.shields.io/badge/VS%20Code-1.108.1+-007ACC.svg)](https://code.visualstudio.com/)
[![Discord](https://img.shields.io/badge/Discord-join_the_community-5865F2?logo=discord&logoColor=white)](https://discord.gg/PsWpeNUzhk)

### Recommended Tools

<a href="https://marketplace.visualstudio.com/items?itemName=LunarWerx.copilot-suite"><img src="https://res.cloudinary.com/dicsgc72e/image/upload/h_120,q_100/v1763756097/ai_suite_badge_ifasdy.png" height="33" alt="CopSuite"></a>
<a href="https://marketplace.visualstudio.com/items?itemName=LunarWerx.copilot-terminal-monitor"><img src="https://res.cloudinary.com/dicsgc72e/image/upload/h_120,q_100/v1770459131/tmonitor_badge_rfsgvr.png" height="33" alt="TerminalMonitor"></a>

Copilot Terminal Monitor is a VS Code extension that tracks commands running in your integrated terminal and notifies you when one produces no output for a set duration or exceeds a total run-time limit, with optional automatic termination and a status bar indicator showing live runtime and idle state.

### Keep track of your terminal commands

and get notified when things get stuck or run for too long.

## Features

- 🕒 **Idle Tracking**: Notifies you if a command hasn't produced output for a specific duration.
- ⏱️ **Total Time Tracking**: Alerting you when a process exceeds a total run-time threshold.
- 🛑 **Auto-Terminate**: Automatically kill processes that exceed your specified run-time or idle thresholds.
- 🧊 **Gentle & Hard Termination**: Supports sending `Ctrl+C` (SIGINT) for graceful stops, with automatic hard-close escalation.
- 🚨 **Obnoxious Mode**: Flashes the VS Code UI and uses modal popups for unmissable alerts.
- 💤 **Snooze**: Silence alerts for a specific command for 5, 10, or 15 minutes.
- 📊 **Status Bar Integration**: Live updates of runtime and idle state with dynamic icons.
- 🏷️ **Tag-Style Exclusions**: Modern exclusion management with tag-based patterns and quick removal.

## Extension Settings

This extension contributes the following settings:

* `terminalIdleMonitor.enabled`: Enable/disable all monitoring.
* `terminalIdleMonitor.idleTimeout`: Seconds before an idle notification (Default: 60s).
* `terminalIdleMonitor.totalTimeout`: Minutes before a total duration notification (Default: 5m).
* `terminalIdleMonitor.onlyMonitorActive`: Restrict monitoring to the active terminal tab only.
* `terminalIdleMonitor.autoTerminateEnabled`: Enable automated process termination.
* `terminalIdleMonitor.enableExclusions`: Enable terminal title patterns to ignore.
* `terminalIdleMonitor.excludePatterns`: Comma-separated list of titles to exclude.
* `terminalIdleMonitor.useSigInt`: Attempt to send `Ctrl+C` before killing the terminal.
* `terminalIdleMonitor.hardTerminateRetries`: Number of SIGINT attempts before force-closing.
* `terminalIdleMonitor.obnoxiousMode`: Enable UI flashing and modal popups.

## Requirements

Requires [VS Code Shell Integration](https://code.visualstudio.com/docs/terminal/shell-integration) to be enabled (default in most modern VS Code setups).

## FAQ

**Is Copilot Terminal Monitor free?**
Yes. It's published free on the Visual Studio Code Marketplace under the MIT license, with no account, subscription, or paid tier. Install it from the Marketplace or a `.vsix` file and every feature, idle tracking, auto-terminate, Obnoxious Mode, is available immediately with no upgrade prompts.

**Does it work offline?**
Yes. The extension runs entirely inside VS Code and only watches terminal activity locally; it makes no network calls and reports no telemetry. Idle tracking, total-time tracking, and auto-terminate all work the same with or without an internet connection, since nothing leaves your machine.

**What are the system requirements?**
VS Code 1.108.1 or newer, which is what `engines.vscode` in the extension's manifest requires, with VS Code Shell Integration enabled, the default in most modern VS Code setups. Shell Integration is what lets the extension see command start and end boundaries and output activity; without it, idle and total-time detection won't work correctly.

**Do I need GitHub Copilot installed to use it?**
No. Despite the name, Copilot Terminal Monitor watches any command in any VS Code integrated terminal; it has no dependency on GitHub Copilot and doesn't call any Copilot API. The name reflects its place in LunarWerx's Copilot Suite of extensions, not a functional requirement.

**Is my data sent anywhere?**
No. All monitoring happens locally in the VS Code process, reading terminal shell-integration events and comparing them against your configured timeouts. The extension contains no analytics, telemetry, or outbound network requests, so command text and output never leave your editor.

**Can I stop it from monitoring specific terminals?**
Yes. Tag-style exclusion patterns let you match terminal titles, for example a `watch` command or a dev-server tab, and exclude them from monitoring entirely. Long-running background terminals you expect to sit idle, like watchers or servers, won't trigger alerts once excluded.

**What happens when Auto-Terminate kicks in?**
By default it attempts a graceful stop first, sending `Ctrl+C` (SIGINT), retried up to the number set in `terminalIdleMonitor.hardTerminateRetries`, then escalates to force-closing the terminal if the process doesn't respond. You can disable auto-terminate entirely and rely on notifications instead.

**How is it different from other terminal-notifier extensions?**
Most terminal notifier extensions only fire once a command finishes. Copilot Terminal Monitor also watches commands while they're still running: it warns when one goes idle or exceeds a time budget, and can auto-terminate it. See "How it compares" below for specifics.

## How it compares

VS Code's built-in terminal bell (Accessibility → Signals: Terminal Bell) can play a sound when a process sends the BEL character, but it doesn't track idle time or total run-time and can't auto-terminate anything; it only reacts to an explicit bell signal from the process itself.

Extensions such as [Background Terminal Notifier](https://marketplace.visualstudio.com/items?itemName=jaredly.background-terminal-notifier) and [Terminal Task Complete](https://marketplace.visualstudio.com/items?itemName=Hacker1337.terminal-notify) notify you once a command finishes, and Terminal Task Complete adds focus-aware rules so it only alerts when you're not already watching. Copilot Terminal Monitor covers the case those don't: a command that's still running but stuck. It tracks idle output and total duration while a process runs, can escalate from a graceful `Ctrl+C` to a hard kill, and keeps a persistent status bar count of everything currently being watched.

---

Made by [LunarWerx Studios](https://lunarwerx.com). Other tools in the suite: [RepoYeti](https://repoyeti.com), [SageThumbs](https://sagethumbs.lunarwerx.com), [QuickDictate](https://quickdictate.lunarwerx.com).
