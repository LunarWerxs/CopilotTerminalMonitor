// Pure, vscode-free logic pulled out of extension.ts so it can run under
// `node --test` without booting the VS Code extension host (extension.ts's
// own `test` script launches a real VS Code window, which this file must
// never need). Every function here takes plain values in and returns plain
// values out; extension.ts is the only caller and must keep behaviour
// byte-for-byte identical to what used to be inlined at each call site.

/** Turns a comma-separated exclusion list into case-insensitive glob
 * matchers (only `*` is a wildcard) and reports whether `name` matches one
 * of them. Mirrors the `excludePatterns` pattern language documented in
 * package.json. */
export function isNameExcluded(
	name: string,
	enableExclusions: boolean,
	excludePatternsCsv: string,
): boolean {
	if (!enableExclusions || !excludePatternsCsv) {
		return false;
	}
	const patterns = excludePatternsCsv.split(',').map((p) => p.trim());
	return patterns.some((p) => {
		if (!p) {
			return false;
		}
		const regex = new RegExp(
			'^' + p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') + '$',
			'i',
		);
		return regex.test(name);
	});
}

/** Elapsed and idle seconds for one execution, floored the same way the
 * idle-check loop has always floored them. */
export function computeIdleTiming(
	now: number,
	startTime: number,
	lastActivity: number,
): { elapsed: number; idle: number } {
	return {
		elapsed: Math.floor((now - startTime) / 1000),
		idle: Math.floor((now - lastActivity) / 1000),
	};
}

export interface IdleTriggerInput {
	isNotificationShowing: boolean;
	now: number;
	lastNotificationCloseTime: number;
	idleNotified: boolean;
	obnoxiousNotified: boolean;
	forceNextObnoxious: boolean | undefined;
	isPastIdle: boolean;
	isPastObnoxious: boolean;
	isObnoxiousMode: boolean;
}

/** Decides whether an idle notification should fire this tick, and whether
 * it should be the "obnoxious" (modal + flashing) variant. This carries the
 * escalation rules: a forced-obnoxious snooze wins first, then obnoxious
 * mode's own idle threshold, then the plain idle fallback - and nothing
 * fires at all while another notification is already showing or just
 * closed within the last 2 seconds. */
export function computeIdleTrigger(
	input: IdleTriggerInput,
): { triggerIdleNow: boolean; isObnoxious: boolean } {
	let triggerIdleNow = false;
	let isObnoxious = false;

	if (
		input.isNotificationShowing ||
		input.now - input.lastNotificationCloseTime <= 2000
	) {
		return { triggerIdleNow, isObnoxious };
	}

	if (!input.obnoxiousNotified) {
		if (input.isPastObnoxious) {
			triggerIdleNow = true;
			isObnoxious = true;
		} else if (input.forceNextObnoxious && input.isPastIdle) {
			triggerIdleNow = true;
			isObnoxious = true;
		} else if (input.isObnoxiousMode && input.isPastIdle && !input.idleNotified) {
			triggerIdleNow = true;
			isObnoxious = true;
		}
	}

	if (!triggerIdleNow && !input.idleNotified && input.isPastIdle) {
		triggerIdleNow = true;
		isObnoxious = false;
	}

	return { triggerIdleNow, isObnoxious };
}

export interface TotalNotificationInput {
	enabled: boolean;
	isNotificationShowing: boolean;
	now: number;
	lastNotificationCloseTime: number;
	totalNotified: boolean;
	elapsedSeconds: number;
	totalTimeoutMinutes: number;
}

/** Whether the total-runtime notification should fire this tick. */
export function shouldFireTotalNotification(input: TotalNotificationInput): boolean {
	return (
		input.enabled &&
		!input.isNotificationShowing &&
		input.now - input.lastNotificationCloseTime > 2000 &&
		!input.totalNotified &&
		input.elapsedSeconds >= input.totalTimeoutMinutes * 60
	);
}

/** Whether an idle execution should be auto-terminated this tick. */
export function shouldAutoTerminate(
	enabled: boolean,
	autoTerminateEnabled: boolean,
	idleSeconds: number,
	autoTerminateTimeoutMinutes: number,
): boolean {
	return enabled && autoTerminateEnabled && idleSeconds >= autoTerminateTimeoutMinutes * 60;
}

/** Truncates a command line for display in a notification/status bar the
 * same way the idle-check loop always has: cut to `maxLen - 3` chars plus
 * an ellipsis once the command line exceeds `maxLen`. */
export function summarizeCommand(commandLine: string, maxLen = 30): string {
	return commandLine.length > maxLen
		? commandLine.substring(0, maxLen - 3) + '...'
		: commandLine;
}

/** Parses "Snooze 5m" / "Snooze 10m" style labels into a minute count,
 * falling back to 5 if nothing numeric is present. */
export function parseSnoozeMinutes(label: string, fallback = 5): number {
	const match = label.match(/\d+/);
	return match ? parseInt(match[0], 10) : fallback;
}

/** Decides which scope (workspace vs global) a Destructive Mode toggle from
 * the Show Menu quick pick applies to, and what its new value should be. */
export function computeDestructiveToggle(
	label: string,
	globalValue: boolean,
	workspaceValue: boolean,
): { isWorkspaceToggle: boolean; newValue: boolean } {
	const isWorkspaceToggle = label.includes('(Workspace)');
	const newValue = isWorkspaceToggle ? !workspaceValue : !globalValue;
	return { isWorkspaceToggle, newValue };
}

/** Chooses the status bar icon: the plain terminal icon normally, a warning
 * icon when Destructive Mode (auto-terminate) is on globally, and a softer
 * warning when it is only on for this workspace. */
export function computeStatusBarIcon(isDestructive: boolean, isGlobalDestructive: boolean): string {
	if (!isDestructive) {
		return '$(terminal-cmd)';
	}
	return isGlobalDestructive ? '$(warning)' : '$(chat-sparkle-warning)';
}
