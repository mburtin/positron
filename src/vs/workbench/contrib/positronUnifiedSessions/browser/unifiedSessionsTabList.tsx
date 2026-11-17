/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

// React.
import React, { useCallback, useEffect, useRef, useState } from 'react';

// Other dependencies.
import { DisposableStore } from '../../../../base/common/lifecycle.js';
import { usePositronReactServicesContext } from '../../../../base/browser/positronReactRendererContext.js';
import { IHoverManager } from '../../../../platform/hover/browser/hoverManager.js';
import { PositronActionBarHoverManager } from '../../../../platform/positronActionBar/browser/positronActionBarHoverManager.js';
import { PositronConsoleTabFocused } from '../../../common/contextkeys.js';
import { IPositronConsoleInstance } from '../../../services/positronConsole/browser/interfaces/positronConsoleService.js';
import { ConsoleTab } from '../../positronConsole/browser/components/consoleTab.js';
import { usePositronConsoleContext } from '../../positronConsole/browser/positronConsoleContext.js';
import { ITerminalGroupService, ITerminalInstance, ITerminalService } from '../../terminal/browser/terminal.js';
import { IUnifiedSessionsState } from '../common/unifiedSessions.js';
import { consoleEntryKey, DropSide, moveEntry, sortEntries, terminalEntryKey, UnifiedEntry } from './unifiedSessionsOrder.js';
import { UnifiedTerminalTab } from './unifiedTerminalTab.js';
import { ENTRY_KEY_ATTRIBUTE, useUnifiedTabReorder } from './useUnifiedTabReorder.js';

/**
 * UnifiedSessionsTabListProps interface.
 */
interface UnifiedSessionsTabListProps {
	readonly width: number;
	readonly height: number;
	readonly terminals: readonly ITerminalInstance[];
	readonly selectedTerminal: ITerminalInstance | undefined;
	readonly terminalService: ITerminalService;
	readonly terminalGroupService: ITerminalGroupService;
	readonly unifiedState: IUnifiedSessionsState;
	readonly onSelectConsole: () => void;
	readonly onSelectTerminal: (terminal: ITerminalInstance) => void;
}

/**
 * An entry of the list: a console session or a terminal.
 */
type TabEntry = UnifiedEntry & (
	{ readonly kind: 'console'; readonly console: IPositronConsoleInstance } |
	{ readonly kind: 'terminal'; readonly terminal: ITerminalInstance }
);

/**
 * UnifiedSessionsTabList component. Lists the console sessions and the
 * terminals in one vertical list, in the order the user dragged them into.
 * @param props The component properties.
 * @returns The rendered component.
 */
export const UnifiedSessionsTabList = (props: UnifiedSessionsTabListProps) => {
	const services = usePositronReactServicesContext();
	const positronConsoleContext = usePositronConsoleContext();
	const tabListRef = useRef<HTMLDivElement>(null);

	// One hover manager for the whole list, so that moving from one tab to the
	// next shows the next name at once.
	const [hoverManager, setHoverManager] = useState<IHoverManager>();
	useEffect(() => {
		const disposableStore = new DisposableStore();
		setHoverManager(disposableStore.add(new PositronActionBarHoverManager(
			true,
			services.configurationService,
			services.hoverService
		)));
		return () => disposableStore.dispose();
	}, [services.configurationService, services.hoverService]);

	// The console tabs hide their names all at once when one of them runs out of room.
	const [sessionsWithHiddenName, setSessionsWithHiddenName] = useState<ReadonlySet<string>>(() => new Set());
	const handleSessionNameHiddenChange = useCallback((sessionId: string, hidden: boolean) => {
		setSessionsWithHiddenName(current => {
			if (current.has(sessionId) === hidden) {
				return current;
			}
			const updated = new Set(current);
			if (hidden) {
				updated.add(sessionId);
			} else {
				updated.delete(sessionId);
			}
			return updated;
		});
	}, []);

	// The order the user dragged the entries into.
	const [order, setOrder] = useState(() => props.unifiedState.order);
	useEffect(() => {
		setOrder(props.unifiedState.order);
		const disposable = props.unifiedState.onDidChangeOrder(() => setOrder(props.unifiedState.order));
		return () => disposable.dispose();
	}, [props.unifiedState]);

	// The entries by default: console sessions oldest to newest, then the
	// terminals as the terminal service has them. The terminals of a group are
	// listed together.
	const defaultEntries: TabEntry[] = [
		...Array.from(positronConsoleContext.positronConsoleInstances.values())
			.sort((a, b) => a.sessionMetadata.createdTimestamp - b.sessionMetadata.createdTimestamp)
			.map((consoleInstance): TabEntry => ({
				kind: 'console',
				key: consoleEntryKey(consoleInstance.sessionId),
				console: consoleInstance,
			})),
		...props.terminals.map((terminal): TabEntry => {
			const group = props.terminalGroupService.getGroupForInstance(terminal);
			return {
				kind: 'terminal',
				key: terminalEntryKey(terminal.instanceId),
				groupKey: group ? `group:${props.terminalGroupService.groups.indexOf(group)}` : undefined,
				terminal,
			};
		}),
	];
	const entries = sortEntries(defaultEntries, order);

	// Keep the console tab focus context key in step with focus in the list.
	useEffect(() => {
		const element = tabListRef.current;
		if (!element) {
			return;
		}
		const contextKey = PositronConsoleTabFocused.bindTo(services.contextKeyService);
		const handleFocus = () => contextKey.set(true);
		const handleBlur = (e: FocusEvent) => {
			if (!element.contains(e.relatedTarget as Node)) {
				contextKey.set(false);
			}
		};
		element.addEventListener('focusin', handleFocus);
		element.addEventListener('focusout', handleBlur);
		return () => {
			element.removeEventListener('focusin', handleFocus);
			element.removeEventListener('focusout', handleBlur);
			contextKey.set(false);
		};
	}, [services.contextKeyService]);

	/**
	 * Makes the console session the foreground session, and shows it.
	 * @param sessionId The id of the session.
	 */
	const handleSelectConsole = async (sessionId: string): Promise<void> => {
		props.onSelectConsole();
		const session = services.runtimeSessionService.getSession(sessionId);
		if (session) {
			services.runtimeSessionService.foregroundSession = session;
		} else {
			// A console instance can exist without a session while it waits for
			// one to connect; it can still be made the active instance.
			services.positronConsoleService.setActivePositronConsoleSession(sessionId);
		}
	};

	// Move between all of the tabs, console sessions and terminals alike.
	const handleKeyDown = (e: React.KeyboardEvent) => {
		if (entries.length === 0) {
			return;
		}

		const activeKey = props.selectedTerminal ?
			terminalEntryKey(props.selectedTerminal.instanceId) :
			positronConsoleContext.activePositronConsoleInstance &&
			consoleEntryKey(positronConsoleContext.activePositronConsoleInstance.sessionId);
		const activeIndex = entries.findIndex(entry => entry.key === activeKey);

		let newIndex = activeIndex;
		switch (e.code) {
			case 'ArrowDown':
				newIndex = Math.min(entries.length - 1, activeIndex + 1);
				break;
			case 'ArrowUp':
				newIndex = Math.max(0, activeIndex - 1);
				break;
			case 'Home':
				newIndex = 0;
				break;
			case 'End':
				newIndex = entries.length - 1;
				break;
			default:
				return;
		}
		e.preventDefault();
		e.stopPropagation();

		if (newIndex === activeIndex || newIndex < 0) {
			return;
		}

		const entry = entries[newIndex];
		const select = entry.kind === 'console' ?
			handleSelectConsole(entry.console.sessionId) :
			Promise.resolve(props.onSelectTerminal(entry.terminal));
		select.then(() => {
			// Each tab sits inside an element that carries its key.
			(tabListRef.current?.children[newIndex]?.firstElementChild as HTMLElement | null | undefined)?.focus();
		});
	};

	// Puts the entry that was dragged where it was dropped.
	const handleReorder = (sourceKey: string, targetKey: string, side: DropSide) => {
		const newOrder = moveEntry(entries, sourceKey, targetKey, side);
		if (!newOrder) {
			return;
		}
		props.unifiedState.setOrder(newOrder);

		// Keep the terminal service's order in step when terminals move among themselves.
		const source = entries.find(entry => entry.key === sourceKey);
		const target = entries.find(entry => entry.key === targetKey);
		if (source?.kind === 'terminal' && target?.kind === 'terminal') {
			props.terminalGroupService.moveGroup(source.terminal, target.terminal);
		}
	};
	const { draggingKey, dropTarget } = useUnifiedTabReorder(tabListRef, handleReorder);

	// Render. Clicking a console tab always shows the console, even when its
	// session is already the active one.
	return (
		<div
			className={`unified-sessions-tab-list${props.selectedTerminal ? ' terminal-selected' : ''}`}
			style={{ height: props.height, width: props.width }}
		>
			<div
				ref={tabListRef}
				aria-orientation='vertical'
				className='tabs-container'
				role='tablist'
				style={{ height: props.height, width: props.width }}
				tabIndex={0}
				onKeyDown={handleKeyDown}
			>
				{entries.map(entry => {
					const classNames = ['unified-tab-entry'];
					if (entry.key === draggingKey) {
						classNames.push('unified-tab-entry--dragging');
					}
					if (dropTarget?.key === entry.key) {
						classNames.push(`unified-tab-entry--drop-${dropTarget.side}`);
					}
					return (
						<div
							key={entry.key}
							className={classNames.join(' ')}
							onClickCapture={entry.kind === 'console' ? props.onSelectConsole : undefined}
							{...{ [ENTRY_KEY_ATTRIBUTE]: entry.key }}
						>
							{entry.kind === 'console' ?
								<ConsoleTab
									hideSessionName={sessionsWithHiddenName.size > 0}
									hoverManager={hoverManager}
									positronConsoleInstance={entry.console}
									width={props.width}
									onChangeSession={() => handleSelectConsole(entry.console.sessionId)}
									onSessionNameHiddenChange={handleSessionNameHiddenChange}
								/> :
								<UnifiedTerminalTab
									active={entry.terminal === props.selectedTerminal}
									instance={entry.terminal}
									terminalService={props.terminalService}
									onSelect={props.onSelectTerminal}
								/>
							}
						</div>
					);
				})}
			</div>
		</div>
	);
};
