/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { consoleEntryKey, moveEntry, sortEntries, terminalEntryKey, UnifiedEntry } from '../../browser/unifiedSessionsOrder.js';

const keys = (entries: readonly UnifiedEntry[]) => entries.map(entry => entry.key);

describe('entry keys', () => {
	test('console and terminal keys cannot collide', () => {
		expect(consoleEntryKey('1')).not.toBe(terminalEntryKey(1));
	});
});

describe('sortEntries', () => {
	const r1 = { key: 'r1' };
	const py = { key: 'py' };
	const t1 = { key: 't1', groupKey: 'g1' };
	const t2 = { key: 't2', groupKey: 'g1' };
	const t3 = { key: 't3', groupKey: 'g2' };
	const defaults = [r1, py, t1, t2, t3];

	test('keeps the default order when nothing was ordered', () => {
		expect(keys(sortEntries(defaults, []))).toEqual(['r1', 'py', 't1', 't2', 't3']);
	});

	test('follows the order the user gave', () => {
		expect(keys(sortEntries(defaults, ['t3', 'py', 'r1', 't1', 't2']))).toEqual(['t3', 'py', 'r1', 't1', 't2']);
	});

	test('puts entries the order does not mention last, in their default order', () => {
		expect(keys(sortEntries(defaults, ['t3', 'r1']))).toEqual(['t3', 'r1', 'py', 't1', 't2']);
	});

	test('ignores keys of entries that are gone', () => {
		expect(keys(sortEntries(defaults, ['gone', 'py', 'r1']))).toEqual(['py', 'r1', 't1', 't2', 't3']);
	});

	test('keeps the terminals of a group together, in their default order', () => {
		expect(keys(sortEntries(defaults, ['t2', 'r1', 'py', 't3', 't1']))).toEqual(['t1', 't2', 'r1', 'py', 't3']);
	});
});

describe('moveEntry', () => {
	const entries = [
		{ key: 'r1' },
		{ key: 'py' },
		{ key: 't1', groupKey: 'g1' },
		{ key: 't2', groupKey: 'g1' },
		{ key: 't3', groupKey: 'g2' },
	];

	test('moves a console before another entry', () => {
		expect(moveEntry(entries, 'py', 'r1', 'before')).toEqual(['py', 'r1', 't1', 't2', 't3']);
	});

	test('moves a console after a terminal', () => {
		expect(moveEntry(entries, 'r1', 't3', 'after')).toEqual(['py', 't1', 't2', 't3', 'r1']);
	});

	test('moves a terminal in front of a console', () => {
		expect(moveEntry(entries, 't3', 'r1', 'before')).toEqual(['t3', 'r1', 'py', 't1', 't2']);
	});

	test('moves the whole group of a terminal', () => {
		expect(moveEntry(entries, 't2', 'r1', 'before')).toEqual(['t1', 't2', 'r1', 'py', 't3']);
	});

	test('drops next to a whole group, never inside it', () => {
		expect(moveEntry(entries, 'r1', 't1', 'after')).toEqual(['py', 't1', 't2', 'r1', 't3']);
		expect(moveEntry(entries, 'r1', 't2', 'before')).toEqual(['py', 'r1', 't1', 't2', 't3']);
	});

	test('does nothing when the entry would stay where it is', () => {
		expect(moveEntry(entries, 'py', 'r1', 'after')).toBeUndefined();
		expect(moveEntry(entries, 'py', 'py', 'before')).toBeUndefined();
		expect(moveEntry(entries, 't1', 't2', 'before')).toBeUndefined();
	});

	test('does nothing for an entry that is not there', () => {
		expect(moveEntry(entries, 'gone', 'r1', 'before')).toBeUndefined();
		expect(moveEntry(entries, 'r1', 'gone', 'before')).toBeUndefined();
	});
});
