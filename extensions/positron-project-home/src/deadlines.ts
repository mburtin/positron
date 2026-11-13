/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// This module must not import `vscode` so that it can be tested without an extension host.

const millisecondsPerDay = 24 * 60 * 60 * 1000;

/** Number of days after today (inclusive of today) that count as upcoming. */
export const upcomingDays = 7;

export type Urgency = 'overdue' | 'upcoming' | 'later';

export interface UrgencyGroups<T> {
	overdue: T[];
	upcoming: T[];
	later: T[];
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
	return value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : undefined;
}

function asText(value: unknown): string | undefined {
	return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

/** Converts an ISO calendar date to a day number, ignoring time zones and daylight saving changes. */
function dayNumber(day: string): number {
	const [year, month, date] = day.split('-').map(Number);
	return Date.UTC(year, month - 1, date) / millisecondsPerDay;
}

/** Accepts only a real calendar date written as `YYYY-MM-DD`, so that dates sort as text. */
export function parseDueDate(value: unknown): string | undefined {
	const text = asText(value);
	const match = text ? /^(?<year>\d{4})-(?<month>\d{2})-(?<day>\d{2})$/.exec(text) : null;
	if (!text || !match?.groups) {
		return undefined;
	}
	const year = Number(match.groups.year);
	const month = Number(match.groups.month);
	const day = Number(match.groups.day);
	const date = new Date(Date.UTC(year, month - 1, day));
	const valid = date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day;
	return valid ? text : undefined;
}

/** Formats the calendar day the user is living in, rather than the UTC day. */
export function toDayString(date: Date): string {
	const pad = (value: number, length = 2) => String(value).padStart(length, '0');
	return `${pad(date.getFullYear(), 4)}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

/** Counts the calendar days from `today` to `due`. The result is negative when `due` has passed. */
export function daysUntil(due: string, today: string): number {
	return dayNumber(due) - dayNumber(today);
}

export function urgencyOf(due: string, today: string): Urgency {
	const days = daysUntil(due, today);
	return days < 0 ? 'overdue' : days < upcomingDays ? 'upcoming' : 'later';
}

/** Splits dated items by urgency, each group ordered by date and then by original position. */
export function groupByUrgency<T extends { due: string }>(items: readonly T[], today: string): UrgencyGroups<T> {
	const groups: UrgencyGroups<T> = { overdue: [], upcoming: [], later: [] };
	// Array#sort is stable, and ISO dates compare correctly as text.
	for (const item of [...items].sort((a, b) => a.due.localeCompare(b.due))) {
		groups[urgencyOf(item.due, today)].push(item);
	}
	return groups;
}

/**
 * Folds the retired milestones into the task list without modifying `raw`.
 *
 * A milestone's tasks inherit its date as their due date, and a milestone without tasks becomes
 * a task of its own, so that its date and completion are not lost. Tasks already in `raw.tasks`
 * keep their positions, which keeps task indexes stable between rendering and editing.
 */
export function migrateLegacyMilestones(raw: Record<string, unknown>): Record<string, unknown> {
	if (!Array.isArray(raw.milestones) || (raw.tasks !== undefined && !Array.isArray(raw.tasks))) {
		return raw;
	}
	const tasks: unknown[] = Array.isArray(raw.tasks) ? [...raw.tasks] : [];
	for (const entry of raw.milestones) {
		const milestone = asRecord(entry);
		const title = asText(milestone?.title);
		if (!milestone || !title) {
			continue;
		}
		const due = parseDueDate(milestone.date);
		const milestoneTasks = Array.isArray(milestone.tasks) ? milestone.tasks : [];
		if (!milestoneTasks.length) {
			tasks.push({ title, done: milestone.done === true, ...(due && { due }) });
			continue;
		}
		for (const taskEntry of milestoneTasks) {
			const task = asRecord(taskEntry);
			if (task) {
				tasks.push(due && parseDueDate(task.due) === undefined ? { ...task, due } : { ...task });
			}
		}
	}
	const { milestones: _milestones, ...rest } = raw;
	return { ...rest, tasks };
}
