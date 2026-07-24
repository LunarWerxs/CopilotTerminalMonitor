import * as vscode from 'vscode';

interface ExecutionData {
	startTime: number;
	lastActivity: number;
	terminal: vscode.Terminal;
	commandLine: string;
	idleNotified: boolean;
	obnoxiousNotified: boolean;
	totalNotified: boolean;
	snoozeUntil: number;
	forceNextObnoxious?: boolean;
	terminationAttempts: number;
	dismissNotification?: () => void;
}

export function activate(context: vscode.ExtensionContext) {
	const activeExecutions = new Map<
		vscode.TerminalShellExecution,
		ExecutionData
	>();
	let flashInterval: NodeJS.Timeout | undefined;
	let flashState = false;
	let currentFlashTarget: vscode.ConfigurationTarget | undefined;
	let isNotificationShowing = false;
	let lastNotificationCloseTime = 0;

	let statusBarItem: vscode.StatusBarItem;
	let settingsPanel: vscode.WebviewPanel | undefined;

	const isTerminalExcluded = (terminalName: string) => {
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		if (!config.get<boolean>('enableExclusions')) {
			return false;
		}
		const excludePatterns = config.get<string>('excludePatterns') || '';
		if (!excludePatterns) {
			return false;
		}
		const patterns = excludePatterns.split(',').map((p) => p.trim());
		return patterns.some((p) => {
			const regex = new RegExp(
				'^' +
					p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\\\*/g, '.*') +
					'$',
				'i',
			);
			return regex.test(terminalName);
		});
	};

	const removeExecution = (data: ExecutionData) => {
		if (data.dismissNotification) {
			data.dismissNotification();
			data.dismissNotification = undefined;
		}
		for (const [execution, execData] of activeExecutions.entries()) {
			if (execData === data) {
				activeExecutions.delete(execution);
				break;
			}
		}
	};

	const isTerminalAlive = (terminal: vscode.Terminal): boolean => {
		// Terminal has exited if exitStatus is set
		if (terminal.exitStatus !== undefined) {
			return false;
		}
		// Also check if it still appears in the terminal list
		return vscode.window.terminals.includes(terminal);
	};

	const terminateExecution = async (data: ExecutionData) => {
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		// If terminal is already dead, just clean up the map entry
		if (!isTerminalAlive(data.terminal)) {
			removeExecution(data);
			return;
		}
		if (config.get<boolean>('useSigInt')) {
			data.terminationAttempts++;
			const maxRetries = config.get<number>('hardTerminateRetries') || 3;
			if (data.terminationAttempts > maxRetries) {
				data.terminal.dispose();
			} else {
				data.terminal.sendText('\u0003'); // Ctrl+C
			}
		} else {
			data.terminal.dispose();
		}
	};

	const handleExcludeAction = async (data: ExecutionData) => {
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		const name = data.terminal.name;
		const currentExclusions = config.get<string>('excludePatterns') || '';
		const patterns = currentExclusions
			.split(',')
			.map((p) => p.trim())
			.filter((p) => p);
		if (!patterns.includes(name)) {
			patterns.push(name);
			await config.update(
				'excludePatterns',
				patterns.join(', '),
				vscode.ConfigurationTarget.Global,
			);
			await config.update(
				'enableExclusions',
				true,
				vscode.ConfigurationTarget.Global,
			);
		}

		for (const [execution, execData] of activeExecutions.entries()) {
			if (execData === data) {
				activeExecutions.delete(execution);
				break;
			}
		}
		vscode.window.showInformationMessage(
			`Excluded terminal "${name}" from monitoring.`,
		);
	};

	const createStatusBar = () => {
		if (statusBarItem) {
			statusBarItem.dispose();
		}
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		const alignment =
			config.get<string>('statusBarAlignment') === 'Left'
				? vscode.StatusBarAlignment.Left
				: vscode.StatusBarAlignment.Right;
		statusBarItem = vscode.window.createStatusBarItem(alignment, 100);
		statusBarItem.command = 'terminal-idle-monitor.showMenu';

		const inspect = config.inspect<boolean>('autoTerminateEnabled');
		const isGlobalDestructive = inspect?.globalValue === true;
		const isDestructive = config.get<boolean>('autoTerminateEnabled');

		let icon = '$(terminal-cmd)';
		if (isDestructive) {
			icon = isGlobalDestructive ? '$(warning)' : '$(chat-sparkle-warning)';
		}

		statusBarItem.text = icon;
		statusBarItem.tooltip = `Terminal Idle Monitor${isDestructive ? ' (Destructive' + (isGlobalDestructive ? ' - Global' : ' - Workspace') + ')' : ''}`;
		if (
			config.get<boolean>('enabled') &&
			config.get<boolean>('statusBarAlwaysVisible')
		) {
			statusBarItem.show();
		}
	};

	createStatusBar();

	const startFlashing = (color: string) => {
		if (flashInterval) {
			return;
		}
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		const hasWorkspace = !!(
			vscode.workspace.workspaceFolders &&
			vscode.workspace.workspaceFolders.length > 0
		);
		currentFlashTarget =
			config.get<boolean>('obnoxiousPerWindow') && hasWorkspace
				? vscode.ConfigurationTarget.Workspace
				: vscode.ConfigurationTarget.Global;

		flashInterval = setInterval(async () => {
			flashState = !flashState;
			const customizations = flashState
				? {
						'titleBar.activeBackground': color,
						'titleBar.activeForeground': '#ffffff',
						'activityBar.background': color,
						'statusBar.background': color,
					}
				: {};

			const workbenchConfig = vscode.workspace.getConfiguration('workbench');
			// Only update if the value has changed or is different to avoid redundant writes
			await workbenchConfig.update(
				'colorCustomizations',
				customizations,
				currentFlashTarget,
			);
		}, 1000); // Slower interval (1s) to reduce disk I/O pressure on settings.json
	};

	const stopFlashing = async () => {
		if (flashInterval) {
			clearInterval(flashInterval);
			flashInterval = undefined;
			if (currentFlashTarget !== undefined) {
				await vscode.workspace
					.getConfiguration('workbench')
					.update('colorCustomizations', {}, currentFlashTarget);
				currentFlashTarget = undefined;
			}
		}
	};

	context.subscriptions.push(
		vscode.commands.registerCommand(
			'terminal-idle-monitor.showMenu',
			async () => {
				const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
				const inspect = config.inspect<boolean>('autoTerminateEnabled');
				const hasWorkspace =
					vscode.workspace.workspaceFolders &&
					vscode.workspace.workspaceFolders.length > 0;

				const globalValue = inspect?.globalValue ?? false;
				const workspaceValue = inspect?.workspaceValue ?? false;
				const activeTerminal = vscode.window.activeTerminal;
				const activeExecution = activeTerminal
					? Array.from(activeExecutions.values()).find(
							(d) => d.terminal === activeTerminal,
						)
					: undefined;

				const backgroundExecutions = Array.from(
					activeExecutions.values(),
				).filter((d) => d.terminal !== activeTerminal);

				const options: vscode.QuickPickItem[] = [];

				if (activeExecution) {
					options.push({
						label: '$(refresh) Reset Timer',
						description: `Active terminal: ${activeExecution.commandLine} (${Math.floor((Date.now() - activeExecution.lastActivity) / 1000)}s idle)`,
					});
					options.push({
						label: '$(clock) Snooze 5m',
						description: 'Pause alerts for 5 minutes',
					});
					options.push({
						label: '$(clock) Snooze 10m',
						description: 'Pause alerts for 10 minutes',
					});
					options.push({
						label: '$(clock) Snooze 15m',
						description: 'Pause alerts for 15 minutes',
					});
					options.push({
						label: '$(terminate) Terminate',
						description: 'Close this terminal session',
					});
					options.push({
						label: '',
						kind: vscode.QuickPickItemKind.Separator,
					});
				}

				if (backgroundExecutions.length > 0) {
					options.push({
						label: 'Background Tasks',
						kind: vscode.QuickPickItemKind.Separator,
					});
					for (const exec of backgroundExecutions) {
						options.push({
							label: `$(terminal) ${exec.terminal.name}: ${exec.commandLine}`,
							description: `Last activity: ${Math.floor((Date.now() - exec.lastActivity) / 1000)}s ago`,
						});
					}
					options.push({
						label: '$(close-all) Terminate All Background Tasks',
						description: `Stop all ${backgroundExecutions.length} background sessions`,
					});
					options.push({
						label: '',
						kind: vscode.QuickPickItemKind.Separator,
					});
				}

				if (hasWorkspace) {
					options.push({
						label: workspaceValue
							? '$(circle-slash) Disable Destructive Mode (Workspace)'
							: '$(check) Enable Destructive Mode (Workspace)',
						description: `Currently ${workspaceValue ? 'ENABLED' : 'DISABLED'} in workspace`,
					});
				}

				options.push({
					label: globalValue
						? '$(circle-slash) Disable Destructive Mode (Global)'
						: '$(check) Enable Destructive Mode (Global)',
					description: `Currently ${globalValue ? 'ENABLED' : 'DISABLED'} globally`,
				});

				if (activeTerminal) {
					options.push({
						label: '$(exclude) Exclude Current Terminal',
						description: `Stop monitoring "${activeTerminal.name}"`,
					});
				}

				options.push({
					label: '$(settings-gear) Open Settings',
					description: 'Configure monitor and alerts',
				});

				const selection = await vscode.window.showQuickPick(options, {
					placeHolder: 'Terminal Idle Monitor',
				});

				if (selection) {
					if (
						selection.label === '$(close-all) Terminate All Background Tasks'
					) {
						for (const exec of backgroundExecutions) {
							await terminateExecution(exec);
						}
					} else if (
						selection.label === '$(refresh) Reset Timer' &&
						activeExecution
					) {
						activeExecution.lastActivity = Date.now();
						activeExecution.idleNotified = false;
						activeExecution.obnoxiousNotified = false;
						await stopFlashing();
						if (activeExecution.dismissNotification) {
							activeExecution.dismissNotification();
							activeExecution.dismissNotification = undefined;
						}
					} else if (
						selection.label.startsWith('$(clock) Snooze') &&
						activeExecution
					) {
						const minsMatch = selection.label.match(/\d+/);
						const mins = minsMatch ? parseInt(minsMatch[0]) : 5;
						activeExecution.snoozeUntil = Date.now() + mins * 60000;
						activeExecution.idleNotified = false;
						activeExecution.obnoxiousNotified = false;
						activeExecution.totalNotified = false;
						if (config.get<boolean>('obnoxiousSnooze')) {
							activeExecution.forceNextObnoxious = true;
						}
						await stopFlashing();
						if (activeExecution.dismissNotification) {
							activeExecution.dismissNotification();
							activeExecution.dismissNotification = undefined;
						}
					} else if (
						selection.label === '$(terminate) Terminate' &&
						activeExecution
					) {
						await terminateExecution(activeExecution);
					} else if (selection.label === '$(settings-gear) Open Settings') {
						vscode.commands.executeCommand(
							'terminal-idle-monitor.openSettings',
						);
					} else if (
						selection.label === '$(exclude) Exclude Current Terminal'
					) {
						const activeExecution = Array.from(activeExecutions.values()).find(
							(d) => d.terminal === activeTerminal,
						);
						if (activeExecution) {
							await handleExcludeAction(activeExecution);
						} else if (activeTerminal) {
							// Fallback if no execution data but terminal exists
							const name = activeTerminal.name;
							const currentExclusions =
								config.get<string>('excludePatterns') || '';
							const patterns = currentExclusions
								.split(',')
								.map((p) => p.trim())
								.filter((p) => p);
							if (!patterns.includes(name)) {
								patterns.push(name);
								await config.update(
									'excludePatterns',
									patterns.join(', '),
									vscode.ConfigurationTarget.Global,
								);
								await config.update(
									'enableExclusions',
									true,
									vscode.ConfigurationTarget.Global,
								);
								vscode.window.showInformationMessage(
									`Excluded terminal "${name}" from monitoring.`,
								);
							}
						}
					} else if (selection.label.includes('Destructive Mode')) {
						const isWorkspaceToggle = selection.label.includes('(Workspace)');
						const newValue = isWorkspaceToggle ? !workspaceValue : !globalValue;
						const target = isWorkspaceToggle
							? vscode.ConfigurationTarget.Workspace
							: vscode.ConfigurationTarget.Global;

						await config.update('autoTerminateEnabled', newValue, target);

						vscode.window.showInformationMessage(
							`Destructive mode ${newValue ? 'enabled' : 'disabled'} ${
								isWorkspaceToggle ? 'for this workspace' : 'globally'
							}.`,
						);
					}
				}
			},
		),
		vscode.commands.registerCommand(
			'terminal-idle-monitor.openSettings',
			() => {
				if (settingsPanel) {
					settingsPanel.reveal();
					return;
				}
				settingsPanel = vscode.window.createWebviewPanel(
					'terminalIdleMonitorSettings',
					'Copilot Terminal Monitor Settings',
					vscode.ViewColumn.One,
					{ enableScripts: true },
				);
				settingsPanel.webview.html = getSettingsHtml(
					vscode.workspace.getConfiguration('terminalIdleMonitor'),
					!!(
						vscode.workspace.workspaceFolders &&
						vscode.workspace.workspaceFolders.length > 0
					),
				);
				settingsPanel.webview.onDidReceiveMessage(async (message) => {
					if (message.command === 'update') {
						let target = vscode.ConfigurationTarget.Global;

						if (message.target === 'global') {
							target = vscode.ConfigurationTarget.Global;
						} else if (message.target === 'workspace') {
							target = vscode.ConfigurationTarget.Workspace;
						}

						await vscode.workspace
							.getConfiguration('terminalIdleMonitor')
							.update(message.key, message.value, target);

						if (settingsPanel) {
							settingsPanel.webview.html = getSettingsHtml(
								vscode.workspace.getConfiguration('terminalIdleMonitor'),
								!!(
									vscode.workspace.workspaceFolders &&
									vscode.workspace.workspaceFolders.length > 0
								),
							);
						}
						if (
							message.key === 'statusBarAlignment' ||
							message.key === 'autoTerminateEnabled' ||
							message.key === 'enabled'
						) {
							createStatusBar();
						}
					} else if (message.command === 'save') {
						vscode.window.showInformationMessage(
							'Terminal Idle Monitor settings saved!',
						);
						createStatusBar();
					} else if (message.command === 'reset') {
						const cfg = vscode.workspace.getConfiguration(
							'terminalIdleMonitor',
						);
						const keys = [
							'enabled',
							'idleTimeout',
							'totalTimeout',
							'statusBarAlignment',
							'statusBarAlwaysVisible',
							'displayIdleText',
							'obnoxiousMode',
							'obnoxiousColor',
							'obnoxiousModeTime',
							'obnoxiousSnooze',
							'obnoxiousPerWindow',
							'enableExclusions',
							'excludePatterns',
							'onlyMonitorActive',
							'useSigInt',
							'autoTerminateEnabled',
							'autoTerminateTimeout',
							'hardTerminateRetries',
						];

						const hasWorkspace = !!(
							vscode.workspace.workspaceFolders &&
							vscode.workspace.workspaceFolders.length > 0
						);

						// Workspace-specific keys that support per-workspace overrides
						const workspaceOverridableKeys = ['autoTerminateEnabled'];

						for (const key of keys) {
							const inspect = cfg.inspect(key);
							if (inspect?.globalValue !== undefined) {
								await cfg.update(
									key,
									undefined,
									vscode.ConfigurationTarget.Global,
								);
							}
							// Only clear workspace overrides for keys that explicitly support it
							if (
								hasWorkspace &&
								workspaceOverridableKeys.includes(key) &&
								inspect?.workspaceValue !== undefined
							) {
								await cfg.update(
									key,
									undefined,
									vscode.ConfigurationTarget.Workspace,
								);
							}
						}
						if (settingsPanel) {
							settingsPanel.webview.html = getSettingsHtml(
								vscode.workspace.getConfiguration('terminalIdleMonitor'),
								hasWorkspace,
							);
						}
						createStatusBar();
					}
				});
				settingsPanel.onDidDispose(() => {
					settingsPanel = undefined;
					stopFlashing();
				});
			},
		),
		vscode.commands.registerCommand(
			'terminal-idle-monitor.enable',
			async () => {
				await vscode.workspace
					.getConfiguration('terminalIdleMonitor')
					.update('enabled', true, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage('Terminal Monitoring enabled.');
			},
		),
		vscode.commands.registerCommand(
			'terminal-idle-monitor.disable',
			async () => {
				await vscode.workspace
					.getConfiguration('terminalIdleMonitor')
					.update('enabled', false, vscode.ConfigurationTarget.Global);
				vscode.window.showInformationMessage('Terminal Monitoring disabled.');
			},
		),
	);

	const checkInterval = setInterval(async () => {
		const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
		if (!config.get<boolean>('enabled')) {
			statusBarItem.hide();
			return;
		}

		const now = Date.now();
		const activeTerminal = vscode.window.activeTerminal;
		const onlyMonitorActive = config.get<boolean>('onlyMonitorActive');
		const icon = config.get<boolean>('autoTerminateEnabled')
			? '$(chat-sparkle-warning)'
			: '$(terminal-cmd)';
		let activeTerminalDataFound = false;
		let monitoredTasksCount = 0;

		// Prune stale entries for terminals that no longer exist
		for (const [execution, data] of Array.from(activeExecutions.entries())) {
			if (!isTerminalAlive(data.terminal)) {
				if (data.dismissNotification) {
					data.dismissNotification();
					data.dismissNotification = undefined;
				}
				activeExecutions.delete(execution);
			}
		}

		// Use Array.from to avoid issues if the map is modified during iteration (e.g. by terminal disposal)
		for (const data of Array.from(activeExecutions.values())) {
			if (isTerminalExcluded(data.terminal.name)) {
				continue;
			}

			if (onlyMonitorActive && data.terminal !== activeTerminal) {
				continue;
			}

			monitoredTasksCount++;
			const isSnoozed = now < data.snoozeUntil;
			const elapsed = Math.floor((now - data.startTime) / 1000);
			const idle = Math.floor((now - data.lastActivity) / 1000);

			if (data.terminal === activeTerminal) {
				activeTerminalDataFound = true;
				if (isSnoozed) {
					statusBarItem.text = `${icon} Snoozed (${Math.ceil((data.snoozeUntil - now) / 1000)}s)`;
				} else {
					statusBarItem.text = `${icon} ${elapsed}s (Idle: ${idle}s)`;
				}
				statusBarItem.show();
			}

			if (isSnoozed) {
				continue;
			}

			const cmdSummary =
				data.commandLine.length > 30
					? data.commandLine.substring(0, 27) + '...'
					: data.commandLine;

			const idleTimeout = config.get<number>('idleTimeout') || 60;
			const obnoxiousTimeout = config.get<number>('obnoxiousModeTime');
			const isObnoxiousMode = config.get<boolean>('obnoxiousMode');

			const isPastIdle = idle >= idleTimeout;
			const isPastObnoxious =
				obnoxiousTimeout !== null &&
				obnoxiousTimeout !== undefined &&
				idle >= obnoxiousTimeout;

			let triggerIdleNow = false;
			let isObnoxious = false;

			if (!isNotificationShowing && now - lastNotificationCloseTime > 2000) {
				if (!data.obnoxiousNotified) {
					if (isPastObnoxious) {
						triggerIdleNow = true;
						isObnoxious = true;
					} else if (data.forceNextObnoxious && isPastIdle) {
						triggerIdleNow = true;
						isObnoxious = true;
					} else if (isObnoxiousMode && isPastIdle && !data.idleNotified) {
						triggerIdleNow = true;
						isObnoxious = true;
					}
				}

				if (!triggerIdleNow && !data.idleNotified && isPastIdle) {
					triggerIdleNow = true;
					isObnoxious = false;
				}
			}

			if (triggerIdleNow) {
				data.idleNotified = true;
				if (isObnoxious) {
					data.obnoxiousNotified = true;
					data.forceNextObnoxious = false;
				}
				isNotificationShowing = true;
				if (isObnoxious) {
					startFlashing(config.get<string>('obnoxiousColor') || '#ff0000');
				}
				const actions = [
					'Reset Timer',
					'Snooze 5m',
					'Snooze 10m',
					'Snooze 15m',
					'Terminate',
					'Exclude Terminal',
				];

				const message = `IDLE: "${cmdSummary}" (${idle}s)${data.terminal === activeTerminal ? '' : ' [Background]'}`;

				if (isObnoxious) {
					vscode.window
						.showWarningMessage(message, { modal: true }, ...actions)
						.then(async (s) => {
							isNotificationShowing = false;
							lastNotificationCloseTime = Date.now();
							await stopFlashing();
							if (s === 'Reset Timer') {
								data.lastActivity = Date.now();
								data.idleNotified = false;
								data.obnoxiousNotified = false;
							} else if (s === 'Terminate') {
								await terminateExecution(data);
							} else if (s === 'Exclude Terminal') {
								await handleExcludeAction(data);
							} else if (s?.startsWith('Snooze')) {
								const mins = parseInt(s.match(/\d+/)![0]);
								data.snoozeUntil = Date.now() + mins * 60000;
								data.idleNotified = false;
								data.obnoxiousNotified = false;
								data.totalNotified = false;
								if (config.get<boolean>('obnoxiousSnooze')) {
									data.forceNextObnoxious = true;
								}
							}
						});
				} else {
					vscode.window
						.withProgress(
							{
								location: vscode.ProgressLocation.Notification,
								title: `${message} (Click status bar icon to Snooze/Terminate)`,
								cancellable: true,
							},
							(progress, token) => {
								return new Promise<void>((resolve) => {
									data.dismissNotification = resolve;
									token.onCancellationRequested(() => {
										data.dismissNotification = undefined;
										resolve();
									});
								});
							},
						)
						.then(() => {
							isNotificationShowing = false;
							lastNotificationCloseTime = Date.now();
						});
				}
			}

			// Auto-Terminate Check
			if (
				config.get<boolean>('enabled') &&
				config.get<boolean>('autoTerminateEnabled') &&
				idle >= (config.get<number>('autoTerminateTimeout') || 10) * 60
			) {
				await terminateExecution(data);
				continue;
			}

			if (
				config.get<boolean>('enabled') &&
				!isNotificationShowing &&
				now - lastNotificationCloseTime > 2000 &&
				!data.totalNotified &&
				elapsed >= (config.get<number>('totalTimeout') || 5) * 60
			) {
				const isObnoxiousTotal = isObnoxiousMode || data.forceNextObnoxious;
				data.totalNotified = true;
				isNotificationShowing = true;
				if (isObnoxiousTotal) {
					startFlashing(config.get<string>('obnoxiousColor') || '#ff0000');
					data.forceNextObnoxious = false;
				}
				const actions = [
					'Snooze 5m',
					'Snooze 10m',
					'Snooze 15m',
					'Terminate',
					'Exclude Terminal',
				];

				const message = `TOTAL: "${cmdSummary}" (${elapsed}s)${data.terminal === activeTerminal ? '' : ' [Background]'}`;

				if (isObnoxiousTotal) {
					vscode.window
						.showInformationMessage(message, { modal: true }, ...actions)
						.then(async (s) => {
							isNotificationShowing = false;
							lastNotificationCloseTime = Date.now();
							if (isObnoxiousTotal) {
								await stopFlashing();
							}
							if (s === 'Terminate') {
								await terminateExecution(data);
							} else if (s === 'Exclude Terminal') {
								await handleExcludeAction(data);
							} else if (s?.startsWith('Snooze')) {
								const mins = parseInt(s.match(/\d+/)![0]);
								data.snoozeUntil = Date.now() + mins * 60000;
								data.idleNotified = false;
								data.obnoxiousNotified = false;
								data.totalNotified = false;
								if (config.get<boolean>('obnoxiousSnooze')) {
									data.forceNextObnoxious = true;
								}
							}
						});
				} else {
					vscode.window
						.withProgress(
							{
								location: vscode.ProgressLocation.Notification,
								title: `${message} (Click status bar icon to Snooze/Terminate)`,
								cancellable: true,
							},
							(progress, token) => {
								return new Promise<void>((resolve) => {
									data.dismissNotification = resolve;
									token.onCancellationRequested(() => {
										data.dismissNotification = undefined;
										resolve();
									});
								});
							},
						)
						.then(() => {
							isNotificationShowing = false;
							lastNotificationCloseTime = Date.now();
						});
				}
			}
		}

		if (!activeTerminalDataFound) {
			if (monitoredTasksCount > 0) {
				statusBarItem.text = config.get<boolean>('displayIdleText')
					? `${icon} (${monitoredTasksCount}) tasks`
					: icon;
				statusBarItem.show();
			} else if (config.get<boolean>('statusBarAlwaysVisible')) {
				statusBarItem.text = config.get<boolean>('displayIdleText')
					? `${icon} Idle`
					: icon;
				statusBarItem.show();
			} else {
				statusBarItem.hide();
			}
		}
	}, 1000);

	context.subscriptions.push(
		new vscode.Disposable(() => {
			clearInterval(checkInterval);
			if (statusBarItem) {
				statusBarItem.dispose();
			}
		}),
	);

	context.subscriptions.push(
		vscode.window.onDidStartTerminalShellExecution(async (event) => {
			if (isTerminalExcluded(event.terminal.name)) {
				return;
			}

			const data: ExecutionData = {
				startTime: Date.now(),
				lastActivity: Date.now(),
				terminal: event.terminal,
				commandLine: event.execution.commandLine.value || 'Unknown',
				idleNotified: false,
				obnoxiousNotified: false,
				totalNotified: false,
				snoozeUntil: 0,
				terminationAttempts: 0,
			};
			activeExecutions.set(event.execution, data);
			try {
				for await (const _ of event.execution.read()) {
					data.lastActivity = Date.now();
					data.idleNotified = false;
					data.obnoxiousNotified = false;
					if (data.dismissNotification) {
						data.dismissNotification();
						data.dismissNotification = undefined;
					}
				}
			} catch {
			} finally {
				if (data.dismissNotification) {
					data.dismissNotification();
					data.dismissNotification = undefined;
				}
				activeExecutions.delete(event.execution);
			}
		}),
	);
	context.subscriptions.push(
		vscode.window.onDidEndTerminalShellExecution((e) => {
			const data = activeExecutions.get(e.execution);
			if (data && data.dismissNotification) {
				data.dismissNotification();
				data.dismissNotification = undefined;
			}
			activeExecutions.delete(e.execution);
		}),
	);

	// Clean up executions when a terminal is closed
	context.subscriptions.push(
		vscode.window.onDidCloseTerminal((closedTerminal) => {
			for (const [execution, data] of Array.from(activeExecutions.entries())) {
				if (data.terminal === closedTerminal) {
					if (data.dismissNotification) {
						data.dismissNotification();
						data.dismissNotification = undefined;
					}
					activeExecutions.delete(execution);
				}
			}
		}),
	);

	context.subscriptions.push(
		vscode.workspace.onDidChangeConfiguration(async (e) => {
			if (e.affectsConfiguration('terminalIdleMonitor')) {
				const config = vscode.workspace.getConfiguration('terminalIdleMonitor');
				if (!config.get<boolean>('enabled')) {
					await stopFlashing();
				}
				createStatusBar();
				if (settingsPanel) {
					settingsPanel.webview.html = getSettingsHtml(
						config,
						!!(
							vscode.workspace.workspaceFolders &&
							vscode.workspace.workspaceFolders.length > 0
						),
					);
				}
			}
		}),
	);
}

function getSettingsHtml(
	config: vscode.WorkspaceConfiguration,
	hasWorkspace: boolean,
): string {
	const alignment = config.get<string>('statusBarAlignment') || 'Left';
	return `<!DOCTYPE html><html><head><style>
    body { font: 13px sans-serif; padding: 16px; color: var(--vscode-foreground); background: var(--vscode-editor-background); line-height: 1.4; }
    .container { max-width: 800px; margin: 0 auto; }
    .section { margin-bottom: 16px; padding: 12px 16px; background: var(--vscode-sideBar-background); border: 1px solid var(--vscode-widget-border); border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
    .setting-item { margin-bottom: 10px; }
    label { display: block; font-size: .85em; font-weight: 600; margin-bottom: 4px; opacity: .9; }
    .checkbox-label { display: flex; align-items: center; font-weight: 600; font-size: .9em; cursor: pointer; }
    .checkbox-label input { appearance: none; width: 16px; height: 16px; margin: 0 10px 0 0; border: 1px solid var(--vscode-checkbox-border); background: var(--vscode-checkbox-background); border-radius: 3px; position: relative; cursor: pointer; }
    .checkbox-label input:checked { background: var(--vscode-checkbox-selectBackground); border-color: var(--vscode-checkbox-selectBorder); }
    .checkbox-label input:checked::after { content: '✓'; position: absolute; top: 45%; left: 50%; transform: translate(-50%, -50%); color: #fff; font-size: 11px; font-weight: bold; }
    input[type="number"], input[type="text"], select { background: var(--vscode-input-background); color: var(--vscode-input-foreground); border: 1px solid var(--vscode-input-border); padding: 4px 8px; border-radius: 4px; width: 130px; font: inherit; }
    input[type="number"]::-webkit-outer-spin-button, input[type="number"]::-webkit-inner-spin-button { -webkit-appearance: none; margin: 0; }
    input[type="number"] { -moz-appearance: textfield; }
    .desc { font-size: .8em; opacity: .65; margin: 2px 0 0 26px; }
    .tags-container { display: flex; flex-wrap: wrap; gap: 6px; padding: 6px; background: var(--vscode-input-background); border: 1px solid var(--vscode-input-border); border-radius: 4px; min-height: 32px; align-items: center; width: 100%; max-width: 400px; box-sizing: border-box; }
    .tag { display: flex; align-items: center; background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); padding: 2px 8px; border-radius: 3px; font-size: 0.85em; }
    .tag-remove { margin-left: 6px; cursor: pointer; opacity: 0.7; font-weight: bold; }
    .tag-remove:hover { opacity: 1; color: #f44; }
    .tag-input { border: none !important; background: transparent !important; color: var(--vscode-input-foreground); flex: 1; min-width: 80px; padding: 2px 4px !important; outline: none; }
    .obnoxious { border-left: 2px solid rgba(255,68,68,0.4); background: rgba(255,68,68,0.02); }
    .obnoxious-active { background: rgba(255,68,68,0.04); }
    h2 { margin: 0 0 16px; font-size: 1.5em; font-weight: 400; border-bottom: 1px solid var(--vscode-widget-border); padding-bottom: 8px; }
    h3 { margin: 0 0 12px; font-size: 1.1em; text-transform: uppercase; opacity: .7; }
    .flex-row { display: flex; gap: 16px; flex-wrap: wrap; margin-bottom: 8px; }
    button { background: var(--vscode-button-background); color: var(--vscode-button-foreground); border: none; padding: 6px 14px; cursor: pointer; border-radius: 4px; font: 600 .95em sans-serif; }
    button.secondary { background: var(--vscode-button-secondaryBackground); color: var(--vscode-button-secondaryForeground); }
  </style></head><body>
    <div class="container">
      <h2>Terminal Monitor Settings</h2>
      
      <div class="section">
        <h3>General Monitoring</h3>
        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('enabled') ? 'checked' : ''} onchange="update('enabled', this.checked)"> Enable Terminal Monitoring</label>
        </div>
        
        <div class="flex-row">
          <div class="setting-item">
            <label>Idle Time Threshold</label>
            <input type="number" value="${config.get('idleTimeout')}" onchange="update('idleTimeout', parseInt(this.value))">
            <div class="desc" style="margin-left:0">Seconds until alert</div>
          </div>
          <div class="setting-item">
            <label>Total Running Time</label>
            <input type="number" value="${config.get('totalTimeout')}" onchange="update('totalTimeout', parseInt(this.value))">
            <div class="desc" style="margin-left:0">Minutes until alert</div>
          </div>
          <div class="setting-item">
            <label>Status Bar Position</label>
            <select onchange="update('statusBarAlignment', this.value)">
              <option value="Left" ${alignment === 'Left' ? 'selected' : ''}>Left Side</option>
              <option value="Right" ${alignment === 'Right' ? 'selected' : ''}>Right Side</option>
            </select>
          </div>
        </div>

        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('statusBarAlwaysVisible') ? 'checked' : ''} onchange="update('statusBarAlwaysVisible', this.checked)"> Keep Status Bar Visible</label>
        </div>
        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('displayIdleText') ? 'checked' : ''} onchange="update('displayIdleText', this.checked)"> Show "Idle" Status</label>
        </div>
        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('onlyMonitorActive') ? 'checked' : ''} onchange="update('onlyMonitorActive', this.checked)"> Monitor Active Terminal Only</label>
          <div class="desc">If enabled, terminals in the background will not trigger alerts.</div>
        </div>

        <div class="setting-item">
          <label class="checkbox-label"><input type="checkbox" ${config.get('enableExclusions') ? 'checked' : ''} onchange="update('enableExclusions', this.checked)"> Exclude Terminals</label>
          <div style="display: ${config.get('enableExclusions') ? 'block' : 'none'}; margin: 10px 0 0 26px;">
            <div class="tags-container" id="exclusion-tags">
              ${(config.get<string>('excludePatterns') || '')
								.split(',')
								.map((p) => p.trim())
								.filter((p) => p)
								.map(
									(p) =>
										`<span class="tag">${p}<span class="tag-remove" onclick="removeTag('${p}')">×</span></span>`,
								)
								.join('')}
              <input type="text" class="tag-input" id="new-tag-input" placeholder="Add pattern..." onkeydown="handleTagInput(event)">
            </div>
            <input type="hidden" id="patterns-hidden" value="${config.get('excludePatterns') || ''}">
            <div class="desc" style="margin-left:0">Press Enter or Tab to add. Titles to ignore (* supported)</div>
          </div>
        </div>
      </div>
      
      <div class="section obnoxious ${!!config.get('obnoxiousMode') ? 'obnoxious-active' : ''}">
        <h3>Alert Intensity</h3>
        <div class="setting-item">
          <label class="checkbox-label" style="font-size: 1em; color: rgba(255,68,68,0.9);">
            <input type="checkbox" ${config.get('obnoxiousMode') ? 'checked' : ''} onchange="update('obnoxiousMode', this.checked)"> 
            🚨 OBNOXIOUS MODE
          </label>
          <div class="desc">Enable high-intensity alerts with modal popups and a flashing UI.</div>
        </div>
        
        <div style="display: ${!!config.get('obnoxiousMode') ? 'block' : 'none'}; margin-top: 12px; padding-top: 12px; border-top: 1px solid rgba(255,68,68,0.2);">
          <div class="flex-row">
            <div class="setting-item">
              <label>Flash Color (Hex)</label>
              <input type="text" value="${config.get('obnoxiousColor')}" onchange="update('obnoxiousColor', this.value)">
              <div class="desc" style="margin-left:0">Applies to next alert</div>
            </div>
            <div class="setting-item">
              <label>Intensify After (seconds)</label>
              <input type="number" placeholder="At idle" value="${config.get('obnoxiousModeTime') || ''}" onchange="update('obnoxiousModeTime', this.value ? parseInt(this.value) : null)">
            </div>
          </div>
          
          <div class="setting-item">
            <label class="checkbox-label"><input type="checkbox" ${config.get('obnoxiousSnooze') ? 'checked' : ''} onchange="update('obnoxiousSnooze', this.checked)"> Escalating Snooze</label>
            <div class="desc">Next alert becomes obnoxious after snoozing.</div>
          </div>
          
          <div class="setting-item">
            <label class="checkbox-label"><input type="checkbox" ${config.get('obnoxiousPerWindow') ? 'checked' : ''} onchange="update('obnoxiousPerWindow', this.checked)"> Isolate to Current Window</label>
            <div class="desc">Only flash active project window.</div>
          </div>
        </div>
      </div>

      <div class="section" style="border-left: 2px solid rgba(255,68,68,0.4); background: rgba(255,68,68,0.02);">
        <h3 style="color: rgba(255,68,68,0.8); font-weight: bold;">⚠️ DANGER ZONE</h3>
        <div class="setting-item">
          <label class="checkbox-label" style="color: rgba(255,68,68,0.9);">
            <input type="checkbox" ${config.inspect('autoTerminateEnabled')?.globalValue ? 'checked' : ''} onchange="update('autoTerminateEnabled', this.checked, 'global')"> 
            ☢️ AUTO-TERMINATE (Global)
          </label>
          <div class="desc">Automatically kill the session if idle for too long on all projects.</div>
        </div>

        ${
					hasWorkspace
						? `
          <div class="setting-item" style="margin: 5px 0 10px 26px;">
            <label class="checkbox-label" style="color: rgba(255,68,68,0.9);">
              <input type="checkbox" ${config.inspect('autoTerminateEnabled')?.workspaceValue !== undefined ? (config.inspect('autoTerminateEnabled')?.workspaceValue ? 'checked' : '') : ''} onchange="update('autoTerminateEnabled', this.checked, 'workspace')"> 
              Enable for THIS Workspace
            </label>
            <div class="desc">Overrides global setting for this folder only.</div>
          </div>
        `
						: ''
				}

        <div style="display: ${!!config.get('autoTerminateEnabled') ? 'block' : 'none'}; padding-left: 26px;">
          <div class="setting-item">
            <label>Auto-Kill After (minutes)</label>
            <input type="number" value="${config.get('autoTerminateTimeout')}" onchange="update('autoTerminateTimeout', parseInt(this.value))">
          </div>
          
          <div class="setting-item" style="margin-top: 16px;">
            <label class="checkbox-label"><input type="checkbox" ${config.get('useSigInt') ? 'checked' : ''} onchange="update('useSigInt', this.checked)"> Gentle Termination (Ctrl+C)</label>
            <div class="desc">Send SIGINT (Ctrl+C) instead of destroying the terminal window.</div>
          </div>

          <div style="display: ${!!config.get('useSigInt') ? 'block' : 'none'}; margin: 10px 0 0 26px;">
            <div class="setting-item">
              <label>Hard Terminate After (retries)</label>
              <input type="number" value="${config.get('hardTerminateRetries')}" onchange="update('hardTerminateRetries', parseInt(this.value))">
              <div class="desc" style="margin-left:0">Force close terminal if Ctrl+C fails after this many attempts.</div>
            </div>
          </div>
        </div>
      </div>

      <div style="margin-top: 24px; display: flex; justify-content: flex-end; gap: 10px;">
        <button class="secondary" onclick="reset()">Reset All to Defaults</button>
        <button onclick="save()">Save Settings</button>
      </div>
    </div>

    <script>
      const vscode = acquireVsCodeApi(); 
      function update(key, value, target) { vscode.postMessage({ command: 'update', key, value, target }); }
      function save() { vscode.postMessage({ command: 'save' }); }
      function reset() { vscode.postMessage({ command: 'reset' }); }

      function handleTagInput(e) {
        if (e.key === 'Enter' || e.key === 'Tab') {
          e.preventDefault();
          const input = e.target;
          const val = input.value.trim();
          if (val) {
            const current = document.getElementById('patterns-hidden').value;
            const patterns = current ? current.split(',').map(p => p.trim()).filter(p => p) : [];
            if (!patterns.includes(val)) {
              patterns.push(val);
              update('excludePatterns', patterns.join(', '));
            }
            input.value = '';
          }
        }
      }

      function removeTag(tag) {
        const current = document.getElementById('patterns-hidden').value;
        const patterns = current ? current.split(',').map(p => p.trim()).filter(p => p) : [];
        const filtered = patterns.filter(p => p !== tag);
        update('excludePatterns', filtered.join(', '));
      }
    </script>
  </body></html>`;
}
export function deactivate() {}
