/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

/**
 * An entry of the unified tab list: a console session or a terminal.
 */
export interface UnifiedEntry {
	/**
	 * Identifies the entry. See `consoleEntryKey` and `terminalEntryKey`.
	 */
	readonly key: string;

	/**
	 * Set on terminals, to the group they are in. The terminals of a group are
	 * always listed together, and move together.
	 */
	readonly groupKey?: string;
}

/**
 * Which side of a tab something is dropped on.
 */
export type DropSide = 'before' | 'after';

/**
 * Gets the key of a console session's entry.
 * @param sessionId The id of the session.
 */
export function consoleEntryKey(sessionId: string): string {
	return `console:${sessionId}`;
}

/**
 * Gets the key of a terminal's entry.
 * @param instanceId The instance id of the terminal.
 */
export function terminalEntryKey(instanceId: number): string {
	return `terminal:${instanceId}`;
}

/**
 * Puts the entries in the order the user gave them. Entries the order does not
 * mention yet (new ones) go last, in the order they were given in. The
 * terminals of a group are kept together, at the place of the first of them
 * to appear, in the order they were given in.
 * @param entries The entries, in their default order.
 * @param order The keys of the entries, in the order the user gave them.
 * @returns The entries, in the order to show them in.
 */
export function sortEntries<T extends UnifiedEntry>(entries: readonly T[], order: readonly string[]): T[] {
	const rankOf = new Map(order.map((key, index) => [key, index]));
	const defaultIndexOf = new Map(entries.map((entry, index) => [entry, index]));
	const sorted = [...entries].sort((a, b) => {
		const rankA = rankOf.get(a.key);
		const rankB = rankOf.get(b.key);
		if (rankA !== undefined && rankB !== undefined) {
			return rankA - rankB;
		}
		if (rankA !== undefined) {
			return -1;
		}
		if (rankB !== undefined) {
			return 1;
		}
		return defaultIndexOf.get(a)! - defaultIndexOf.get(b)!;
	});

	const result: T[] = [];
	const placedGroups = new Set<string>();
	for (const entry of sorted) {
		if (entry.groupKey === undefined) {
			result.push(entry);
		} else if (!placedGroups.has(entry.groupKey)) {
			placedGroups.add(entry.groupKey);
			result.push(...entries.filter(other => other.groupKey === entry.groupKey));
		}
	}
	return result;
}

/**
 * Works out the order after an entry is moved next to another one. Moving a
 * terminal moves its whole group.
 * @param entries The entries, in the order they are shown in.
 * @param sourceKey The key of the entry being moved.
 * @param targetKey The key of the entry it is dropped on.
 * @param side Which side of the target it is dropped on.
 * @returns The keys of the entries in their new order, or undefined if the
 * move would change nothing.
 */
export function moveEntry(entries: readonly UnifiedEntry[], sourceKey: string, targetKey: string, side: DropSide): string[] | undefined {
	const source = entries.find(entry => entry.key === sourceKey);
	const target = entries.find(entry => entry.key === targetKey);
	if (!source || !target) {
		return undefined;
	}

	const unitOf = (entry: UnifiedEntry) => entry.groupKey === undefined ?
		[entry] :
		entries.filter(other => other.groupKey === entry.groupKey);
	const sourceUnit = unitOf(source);
	const targetUnit = unitOf(target);
	if (sourceUnit.includes(target)) {
		return undefined;
	}

	const remaining = entries.filter(entry => !sourceUnit.includes(entry));
	const index = side === 'before' ?
		remaining.indexOf(targetUnit[0]) :
		remaining.indexOf(targetUnit[targetUnit.length - 1]) + 1;
	remaining.splice(index, 0, ...sourceUnit);

	const newKeys = remaining.map(entry => entry.key);
	return newKeys.every((key, i) => key === entries[i].key) ? undefined : newKeys;
}
