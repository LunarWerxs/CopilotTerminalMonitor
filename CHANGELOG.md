# Changelog

All notable changes to the "terminal-idle-monitor" extension will be documented in this file.

## [1.4.2] - 2026-07-24

### Fixed
- **Stale Session Cleanup**: Terminals that have exited are now pruned from monitoring, so the status bar count and the Background Tasks list no longer show sessions that already ended.
- **Closed Terminal Handling**: Closing a terminal now immediately clears its monitoring entry and dismisses any notification it was showing.
- **Safe Terminate**: Choosing Terminate on a session whose terminal is already gone now simply cleans up instead of attempting to kill a dead terminal.

## [1.4.1] - 2026-02-08

### Added
- **Full Control From the Status Bar**: The status bar menu now acts on the active terminal directly with Reset Timer, Snooze 5m/10m/15m, and Terminate.
- **Background Tasks Menu**: Every monitored background terminal is listed with its command and idle time, plus a single "Terminate All Background Tasks" action.
- **Monitored Task Count**: The status bar shows how many sessions are being watched, for example `(3) tasks`.
- **Per-Workspace Auto-Terminate**: Auto-Terminate now has a separate "Enable for THIS Workspace" override alongside the global toggle. It appears only when a folder is open.

### Changed
- **Non-Intrusive Alerts**: Standard idle and total-runtime alerts are now persistent progress notifications instead of pop-up toasts. They stay visible while the command sits idle and clear themselves the moment output resumes or the command finishes. Obnoxious Mode alerts remain modal with their buttons.
- **Per-Window Flashing by Default**: `obnoxiousPerWindow` now defaults to `true`, so Obnoxious Mode flashing affects only the current window instead of every open window.
- **Reduced Disk Pressure**: The flash interval slowed from 500ms to 1s to further reduce writes to `settings.json`.
- **Always-Available Actions**: Terminate and Exclude Terminal are now always offered in alerts.
- **Safer Reset Settings**: Reset now only clears values that were actually set, and only removes workspace overrides for settings that support them, so it no longer wipes unrelated workspace configuration.

### Removed
- **`terminalIdleMonitor.showTerminateButton`**: Removed. Terminate is always offered in alerts now, so the toggle no longer served a purpose.

### Fixed
- **Menu Action Matching**: Status bar menu entries are matched exactly rather than by substring, fixing cases where selecting one item could trigger another.

## [1.3.4] - 2026-02-07

### Changed
- **Global by Default**: Settings now save to Global (User) configuration by default to ensure consistency across multiple windows.
- **Improved Sync**: Settings panel now synchronizes immediately across all open project windows when a change is made.
- **Optimized Performance**: Reduced disk I/O pressure from "Obnoxious Mode" flashing to prevent settings file conflicts.
- **UI Clarification**: Explicitly distinguished between Global activation and Workspace overrides in the Danger Zone settings.

## [1.3.1] - 2026-02-06

### Added
- **Save Settings Button**: Explicit 'Save Settings' button on the settings page for better user confirmation.
- **Success Feedback**: Added a toast notification that confirms when settings have been saved.

### Changed
- **Notification Gating**: Improved notification logic to prevent multiple alerts from "stacking" or overlapping.
- **Paced Alerts**: Implemented a short cooldown between notifications to improve focus and prevent alert fatigue.
- **Dynamic Exclusion Refresh**: Changing exclusion patterns now immediately applies to currently running terminals, stopping or resuming monitoring without manual intervention.

## [1.3.0] - 2026-02-06

### Added
- **Tag-Style Exclusions**: Settings page now features a modern "tag" list for exclusions. Press Enter or Tab to add, and click the "x" to remove.
- **On-the-fly Exclusions**: Add terminals to the exclusion list directly from Idle/Total alerts or the Status Bar menu.
- **Command Palette Integration**: Direct commands for "Enable", "Disable", and "Open Settings" available in the Command Palette.
- **Improved Auto-Terminate Control**: Added a "Enable Globally" toggle for Auto-Terminate in settings, hidden when the feature is disabled.
- **Refined Settings UI**: Softened the "Danger Zone" and "Obnoxious Mode" styling for a better integration with VS Code's theme.

### Changed
- **Menu Layout**: Consolidated status bar menu items to a single line for a cleaner look.
- **Command Prefixes**: Unified all commands under the "Terminal Monitor:" prefix.

## [1.2.6] - 2026-02-05

### Added
- **Quick Menu**: Clicking the status bar icon now opens a menu to toggle Destructive Mode or open Settings.
- **Workspace-Specific Destructive Mode**: Toggle Auto-Terminate for just the current workspace instead of globally.
- **Visual Indicators**: Status bar icon now distinguishes between Global (`$(warning)`) and Workspace (`$(chat-sparkle-warning)`) destructive modes.

### Changed
- **Settings Default**: The Settings UI now updates Workspace configuration by default if a workspace is open, allowing for easier project-specific tuning.
- **Dynamic Feedback**: UI updates immediately when configuration changes are made through any interface.

## [1.2.5] - 2026-02-02

### Changed
- **Resources Section**: Added `bugs` and `repository` configuration to ensure the "Resources" links (Issues, Repository, Homepage) appear in the VS Code extension marketplace/sidebar.
- **Metadata**: Synchronized versioning and author details.
## [1.2.3] - 2026-02-02

### Added
- **Danger Zone**: Introduced automation tools for terminal management.
- **Auto-Terminate**: Automatically kill long-running processes after a set threshold (configured in minutes).
- **Gentle Termination**: Support for sending `Ctrl+C` (SIGINT) to signal processes to stop gracefully.
- **Hard Terminate Escalation**: Improved failsafe that force-closes terminals if Gentle Termination fails after a specified number of retries.
- **Active Terminal Focus**: Option to restrict monitoring only to the currently visible terminal.
- **Manual Control**: New "Terminate" action button directly in the idle/run-time alerts.

### Changed
- **Time Units**: Thresholds for "Total Run Time" and "Auto Terminate" are now set in minutes for better usability.
- **Visual Feedback**: The status bar icon dynamically changes to `chat-sparkle-warning` when Auto-Terminate is active.
- **UI Improvements**: Hiding numeric spinners in the settings UI for a cleaner look; improved layout of the Danger Zone.
- **Branding**: Updated official publisher to **LunarWerx**.

### Fixed
- **Settings Sync**: Resetting defaults now correctly clears both Global and Workspace configurations, ensuring consistency across all windows.
- **Webview Stability**: Hardened conditional UI logic to ensure settings appear correctly after resets.

## [1.0.0] - 2026-02-02

### Added
- **Dual Threshold Monitoring**: Track both "Idle" time (no output) and "Total" execution time.
- **Obnoxious Mode**: High-intensity alerts with modal popups and flashing UI (configurable colors).
- **Snooze Functionality**: Notifications now include snooze options for 1, 5, or 10 minutes.
- **Status Bar Item**: Live updates of run time and idle time. Customizable "terminal-cmd" icon.
- **Webview Settings Page**: A dedicated UI for managing all extension configurations.
- **Persistence**: Settings are saved globally across sessions.
