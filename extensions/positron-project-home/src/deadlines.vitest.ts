/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { daysUntil, groupByUrgency, migrateLegacyMilestones, parseDueDate, toDayString, urgencyOf } from './deadlines';

describe('parseDueDate', () => {
	it('accepts real calendar dates', () => {
		expect(['2026-11-13', ' 2026-11-13 ', '2024-02-29'].map(parseDueDate))
			.toEqual(['2026-11-13', '2026-11-13', '2024-02-29']);
	});

	it('rejects malformed and impossible dates', () => {
		const rejected = ['2026-02-30', '2025-02-29', '2026-13-01', '2026-00-10', '26-11-13', '2026-1-3', '2026/11/13', '', '  ', 'tomorrow'];
		expect(rejected.map(parseDueDate)).toEqual(rejected.map(() => undefined));
	});

	it('rejects values that are not text', () => {
		expect([undefined, null, 20261113, {}, []].map(parseDueDate)).toEqual([undefined, undefined, undefined, undefined, undefined]);
	});
});

describe('toDayString', () => {
	it('uses the local calendar day', () => {
		expect(toDayString(new Date(2026, 0, 5, 23, 59))).toBe('2026-01-05');
		expect(toDayString(new Date(2026, 11, 31, 0, 0))).toBe('2026-12-31');
	});
});

describe('daysUntil', () => {
	it('counts calendar days in both directions', () => {
		expect([
			daysUntil('2026-11-13', '2026-11-13'),
			daysUntil('2026-11-16', '2026-11-13'),
			daysUntil('2026-11-10', '2026-11-13'),
		]).toEqual([0, 3, -3]);
	});

	it('is not affected by daylight saving changes or month and year boundaries', () => {
		expect([
			daysUntil('2026-03-30', '2026-03-28'),
			daysUntil('2026-11-02', '2026-10-31'),
			daysUntil('2027-01-02', '2026-12-30'),
			daysUntil('2028-03-01', '2028-02-28'),
		]).toEqual([2, 2, 3, 2]);
	});
});

describe('urgencyOf', () => {
	const today = '2026-11-13';

	it('treats today as upcoming and yesterday as overdue', () => {
		expect([urgencyOf('2026-11-12', today), urgencyOf('2026-11-13', today)]).toEqual(['overdue', 'upcoming']);
	});

	it('keeps seven days, today included, in the upcoming group', () => {
		expect([urgencyOf('2026-11-19', today), urgencyOf('2026-11-20', today)]).toEqual(['upcoming', 'later']);
	});
});

describe('groupByUrgency', () => {
	it('groups items and orders each group by date, then by original position', () => {
		const items = [
			{ title: 'later b', due: '2027-01-01' },
			{ title: 'upcoming b', due: '2026-11-15' },
			{ title: 'overdue b', due: '2026-11-10' },
			{ title: 'upcoming a', due: '2026-11-14' },
			{ title: 'later a', due: '2026-12-01' },
			{ title: 'overdue a', due: '2026-10-01' },
			{ title: 'upcoming b twin', due: '2026-11-15' },
		];
		const titles = (group: typeof items) => group.map(item => item.title);
		const groups = groupByUrgency(items, '2026-11-13');
		expect({ overdue: titles(groups.overdue), upcoming: titles(groups.upcoming), later: titles(groups.later) }).toEqual({
			overdue: ['overdue a', 'overdue b'],
			upcoming: ['upcoming a', 'upcoming b', 'upcoming b twin'],
			later: ['later a', 'later b'],
		});
	});

	it('returns empty groups without items', () => {
		expect(groupByUrgency([], '2026-11-13')).toEqual({ overdue: [], upcoming: [], later: [] });
	});

	it('does not reorder the input', () => {
		const items = [{ due: '2026-12-01' }, { due: '2026-11-01' }];
		groupByUrgency(items, '2026-11-13');
		expect(items).toEqual([{ due: '2026-12-01' }, { due: '2026-11-01' }]);
	});
});

describe('migrateLegacyMilestones', () => {
	it('returns the same object when there are no milestones', () => {
		const raw = { title: 'Project', tasks: [{ title: 'Task' }] };
		expect(migrateLegacyMilestones(raw)).toBe(raw);
	});

	it('leaves malformed task or milestone lists alone', () => {
		const badTasks = { tasks: 'oops', milestones: [{ title: 'M' }] };
		const badMilestones = { tasks: [], milestones: 'oops' };
		expect([migrateLegacyMilestones(badTasks), migrateLegacyMilestones(badMilestones)]).toEqual([badTasks, badMilestones]);
	});

	it('moves milestone tasks into the task list with the milestone date as due date', () => {
		const raw = {
			title: 'Project',
			tasks: [{ title: 'Existing' }],
			milestones: [
				{ title: 'Submit', date: '2026-12-01', tasks: [{ title: 'Write', done: true, notes: 'n' }, { title: 'Review', due: '2026-11-20' }] },
				{ title: 'Undated', tasks: [{ title: 'Plan', tag: 'x' }] },
			],
		};
		expect(migrateLegacyMilestones(raw)).toEqual({
			title: 'Project',
			tasks: [
				{ title: 'Existing' },
				{ title: 'Write', done: true, notes: 'n', due: '2026-12-01' },
				{ title: 'Review', due: '2026-11-20' },
				{ title: 'Plan', tag: 'x' },
			],
		});
	});

	it('turns a milestone without tasks into a task that keeps its date and completion', () => {
		const raw = {
			milestones: [
				{ title: 'Kickoff', date: '2026-09-01', done: true },
				{ title: 'Empty list', date: '2026-10-01', tasks: [] },
				{ title: 'No date' },
			],
		};
		expect(migrateLegacyMilestones(raw)).toEqual({
			tasks: [
				{ title: 'Kickoff', done: true, due: '2026-09-01' },
				{ title: 'Empty list', done: false, due: '2026-10-01' },
				{ title: 'No date', done: false },
			],
		});
	});

	it('drops invalid dates and skips entries it cannot read', () => {
		const raw = {
			milestones: [
				{ title: 'Bad date', date: '2026-02-30', tasks: [{ title: 'A' }] },
				{ date: '2026-01-01', tasks: [{ title: 'Untitled milestone' }] },
				'not an object',
				{ title: 'Mixed', date: '2026-05-05', tasks: ['junk', { title: 'B' }] },
			],
		};
		expect(migrateLegacyMilestones(raw)).toEqual({ tasks: [{ title: 'A' }, { title: 'B', due: '2026-05-05' }] });
	});

	it('keeps other fields, does not modify its input and is idempotent', () => {
		const raw = { title: 'P', links: [{ label: 'a', target: 'https://example.com' }], milestones: [{ title: 'M', date: '2026-05-05' }] };
		const before = JSON.stringify(raw);
		const once = migrateLegacyMilestones(raw);
		expect(JSON.stringify(raw)).toBe(before);
		expect(once).toEqual({ title: 'P', links: raw.links, tasks: [{ title: 'M', done: false, due: '2026-05-05' }] });
		expect(migrateLegacyMilestones(once)).toBe(once);
	});
});
