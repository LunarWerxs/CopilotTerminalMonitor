// Unit tests for the pure logic extracted from src/extension.ts. Run with
// `npm run test:unit` (node --test, native TypeScript type stripping - no
// tsc step, no VS Code, no extension host). Every case here fails when the
// logic it targets is broken; see the canary/mutation notes in the PR
// description for the on-purpose breaks used to prove that.

import test from 'node:test';
import assert from 'node:assert/strict';
import {
	isNameExcluded,
	computeIdleTiming,
	computeIdleTrigger,
	shouldFireTotalNotification,
	shouldAutoTerminate,
	summarizeCommand,
	parseSnoozeMinutes,
	computeDestructiveToggle,
	computeStatusBarIcon,
	type IdleTriggerInput,
	type TotalNotificationInput,
} from '../src/logic.ts';

// --- isNameExcluded -------------------------------------------------------

test('isNameExcluded: returns false when exclusions are disabled entirely', () => {
	assert.equal(isNameExcluded('npm: watch', false, 'npm*'), false);
});

test('isNameExcluded: returns false when the pattern list is empty', () => {
	assert.equal(isNameExcluded('npm: watch', true, ''), false);
});

test('isNameExcluded: matches a trailing-wildcard pattern', () => {
	assert.equal(isNameExcluded('npm: watch:esbuild', true, 'npm*'), true);
});

test('isNameExcluded: does not match an unrelated terminal name', () => {
	assert.equal(isNameExcluded('bash', true, 'npm*, debug'), false);
});

test('isNameExcluded: is case-insensitive', () => {
	assert.equal(isNameExcluded('DEBUG', true, 'debug'), true);
});

test('isNameExcluded: matches one of several comma-separated patterns', () => {
	assert.equal(isNameExcluded('debug', true, 'npm*, debug'), true);
});

// --- computeIdleTiming -----------------------------------------------------

test('computeIdleTiming: floors elapsed and idle seconds independently', () => {
	const now = 10_000;
	const { elapsed, idle } = computeIdleTiming(now, /* startTime */ 3_500, /* lastActivity */ 8_900);
	assert.equal(elapsed, 6); // (10000-3500)/1000 = 6.5 -> 6
	assert.equal(idle, 1); // (10000-8900)/1000 = 1.1 -> 1
});

// --- computeIdleTrigger ------------------------------------------------

function baseTrigger(overrides: Partial<IdleTriggerInput> = {}): IdleTriggerInput {
	return {
		isNotificationShowing: false,
		now: 100_000,
		lastNotificationCloseTime: 0,
		idleNotified: false,
		obnoxiousNotified: false,
		forceNextObnoxious: false,
		isPastIdle: false,
		isPastObnoxious: false,
		isObnoxiousMode: false,
		...overrides,
	};
}

test('computeIdleTrigger: fires a plain idle notification once past the idle threshold', () => {
	const result = computeIdleTrigger(baseTrigger({ isPastIdle: true }));
	assert.deepEqual(result, { triggerIdleNow: true, isObnoxious: false });
});

test('computeIdleTrigger: does not re-fire once already idle-notified', () => {
	const result = computeIdleTrigger(baseTrigger({ isPastIdle: true, idleNotified: true }));
	assert.deepEqual(result, { triggerIdleNow: false, isObnoxious: false });
});

test('computeIdleTrigger: escalates to obnoxious once past the obnoxious threshold', () => {
	const result = computeIdleTrigger(baseTrigger({ isPastIdle: true, isPastObnoxious: true }));
	assert.deepEqual(result, { triggerIdleNow: true, isObnoxious: true });
});

test('computeIdleTrigger: a forced-obnoxious snooze escalates the next idle alert', () => {
	const result = computeIdleTrigger(baseTrigger({ isPastIdle: true, forceNextObnoxious: true }));
	assert.deepEqual(result, { triggerIdleNow: true, isObnoxious: true });
});

test('computeIdleTrigger: obnoxious mode escalates the first idle alert', () => {
	const result = computeIdleTrigger(
		baseTrigger({ isPastIdle: true, isObnoxiousMode: true, idleNotified: false }),
	);
	assert.deepEqual(result, { triggerIdleNow: true, isObnoxious: true });
});

test('computeIdleTrigger: suppresses everything while a notification is already showing', () => {
	const result = computeIdleTrigger(
		baseTrigger({ isPastIdle: true, isPastObnoxious: true, isNotificationShowing: true }),
	);
	assert.deepEqual(result, { triggerIdleNow: false, isObnoxious: false });
});

test('computeIdleTrigger: suppresses everything within 2s of the last notification closing', () => {
	const result = computeIdleTrigger(
		baseTrigger({ isPastIdle: true, now: 5000, lastNotificationCloseTime: 4000 }),
	);
	assert.deepEqual(result, { triggerIdleNow: false, isObnoxious: false });
});

test('computeIdleTrigger: allows a new notification once the 2s cooldown has passed', () => {
	const result = computeIdleTrigger(
		baseTrigger({ isPastIdle: true, now: 7001, lastNotificationCloseTime: 4000 }),
	);
	assert.deepEqual(result, { triggerIdleNow: true, isObnoxious: false });
});

// --- shouldFireTotalNotification ---------------------------------------

function baseTotal(overrides: Partial<TotalNotificationInput> = {}): TotalNotificationInput {
	return {
		enabled: true,
		isNotificationShowing: false,
		now: 100_000,
		lastNotificationCloseTime: 0,
		totalNotified: false,
		elapsedSeconds: 400,
		totalTimeoutMinutes: 5, // 300s
		...overrides,
	};
}

test('shouldFireTotalNotification: fires once elapsed passes the total timeout', () => {
	assert.equal(shouldFireTotalNotification(baseTotal()), true);
});

test('shouldFireTotalNotification: does not fire before the timeout is reached', () => {
	assert.equal(shouldFireTotalNotification(baseTotal({ elapsedSeconds: 100 })), false);
});

test('shouldFireTotalNotification: does not fire twice for the same execution', () => {
	assert.equal(shouldFireTotalNotification(baseTotal({ totalNotified: true })), false);
});

test('shouldFireTotalNotification: does not fire while disabled', () => {
	assert.equal(shouldFireTotalNotification(baseTotal({ enabled: false })), false);
});

test('shouldFireTotalNotification: does not fire while another notification is showing', () => {
	assert.equal(shouldFireTotalNotification(baseTotal({ isNotificationShowing: true })), false);
});

// --- shouldAutoTerminate -------------------------------------------------

test('shouldAutoTerminate: true once idle time reaches the configured minutes', () => {
	assert.equal(shouldAutoTerminate(true, true, 600, 10), true); // 600s == 10min
});

test('shouldAutoTerminate: false before the timeout is reached', () => {
	assert.equal(shouldAutoTerminate(true, true, 599, 10), false);
});

test('shouldAutoTerminate: false when auto-terminate is off, even if idle a long time', () => {
	assert.equal(shouldAutoTerminate(true, false, 10_000, 10), false);
});

test('shouldAutoTerminate: false when monitoring itself is disabled', () => {
	assert.equal(shouldAutoTerminate(false, true, 10_000, 10), false);
});

// --- summarizeCommand -----------------------------------------------------

test('summarizeCommand: leaves short command lines untouched', () => {
	assert.equal(summarizeCommand('npm test'), 'npm test');
});

test('summarizeCommand: truncates long command lines to 27 chars + ellipsis', () => {
	const longCmd = 'a'.repeat(50);
	const result = summarizeCommand(longCmd);
	assert.equal(result, 'a'.repeat(27) + '...');
	assert.equal(result.length, 30);
});

test('summarizeCommand: exactly at the limit is not truncated', () => {
	const exact = 'a'.repeat(30);
	assert.equal(summarizeCommand(exact), exact);
});

// --- parseSnoozeMinutes ---------------------------------------------------

test('parseSnoozeMinutes: reads the number out of a Snooze label', () => {
	assert.equal(parseSnoozeMinutes('$(clock) Snooze 15m'), 15);
});

test('parseSnoozeMinutes: falls back to 5 when no digits are present', () => {
	assert.equal(parseSnoozeMinutes('Snooze'), 5);
});

test('parseSnoozeMinutes: an explicit fallback overrides the default', () => {
	assert.equal(parseSnoozeMinutes('Snooze', 7), 7);
});

// --- computeDestructiveToggle ---------------------------------------------

test('computeDestructiveToggle: a workspace label flips the workspace value', () => {
	const result = computeDestructiveToggle('$(check) Enable Destructive Mode (Workspace)', false, false);
	assert.deepEqual(result, { isWorkspaceToggle: true, newValue: true });
});

test('computeDestructiveToggle: a global label flips the global value and ignores workspace', () => {
	const result = computeDestructiveToggle('$(check) Enable Destructive Mode (Global)', false, true);
	assert.deepEqual(result, { isWorkspaceToggle: false, newValue: true });
});

test('computeDestructiveToggle: toggling off flips true back to false', () => {
	const result = computeDestructiveToggle('$(circle-slash) Disable Destructive Mode (Global)', true, false);
	assert.deepEqual(result, { isWorkspaceToggle: false, newValue: false });
});

// --- computeStatusBarIcon --------------------------------------------------

test('computeStatusBarIcon: plain icon when destructive mode is off', () => {
	assert.equal(computeStatusBarIcon(false, false), '$(terminal-cmd)');
});

test('computeStatusBarIcon: warning icon when destructive mode is on globally', () => {
	assert.equal(computeStatusBarIcon(true, true), '$(warning)');
});

test('computeStatusBarIcon: softer warning icon when destructive mode is workspace-only', () => {
	assert.equal(computeStatusBarIcon(true, false), '$(chat-sparkle-warning)');
});
