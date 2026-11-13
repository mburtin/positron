/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

(() => {
	/** Allows reordering the dashboard through its drag handles. */
	function enableReordering(container: HTMLElement, reorder: (source: HTMLElement, target: HTMLElement, before: boolean) => void): void {
		let dragged: HTMLElement | undefined;
		let dropTarget: HTMLElement | undefined;

		const itemAt = (target: EventTarget | null) => {
			const item = target instanceof Element ? target.closest<HTMLElement>('[data-component]') : undefined;
			return item?.parentElement === container ? item : undefined;
		};
		const clearTarget = () => {
			dropTarget?.removeAttribute('data-drop-edge');
			dropTarget = undefined;
		};
		const finishDrag = () => {
			dragged?.classList.remove('dragging');
			dragged = undefined;
			clearTarget();
		};
		const dropEdge = (target: HTMLElement, event: DragEvent) => {
			const rect = target.getBoundingClientRect();
			if (rect.width < container.clientWidth - 1) {
				return event.clientX < rect.left + rect.width / 2 ? 'left' : 'right';
			}
			return event.clientY < rect.top + rect.height / 2 ? 'top' : 'bottom';
		};

		container.addEventListener('dragstart', event => {
			if (!(event.target instanceof Element) || !event.target.closest('.drag-handle') || !event.dataTransfer) {
				return;
			}
			dragged = itemAt(event.target);
			if (dragged?.dataset.component) {
				event.dataTransfer.setData('text/plain', dragged.dataset.component);
				event.dataTransfer.effectAllowed = 'move';
				dragged.classList.add('dragging');
			}
		});
		container.addEventListener('dragover', event => {
			if (!dragged) {
				return;
			}
			const target = itemAt(event.target);
			if (target !== dropTarget) {
				clearTarget();
			}
			if (!target || target === dragged) {
				return;
			}

			event.preventDefault();
			if (event.dataTransfer) {
				event.dataTransfer.dropEffect = 'move';
			}
			dropTarget = target;
			target.dataset.dropEdge = dropEdge(target, event);
		});
		container.addEventListener('dragleave', event => {
			if (dropTarget && event.relatedTarget instanceof Node && !dropTarget.contains(event.relatedTarget)) {
				clearTarget();
			}
		});
		container.addEventListener('drop', event => {
			const target = itemAt(event.target);
			const source = dragged;
			finishDrag();
			if (source && target && source !== target) {
				event.preventDefault();
				const edge = dropEdge(target, event);
				reorder(source, target, edge === 'left' || edge === 'top');
			}
		});
		container.addEventListener('dragend', finishDrag);
	}

	/** Resizes cards in whole grid tracks and lets CSS Grid place the other cards. */
	function enableResizing(grid: HTMLElement, save: () => void): () => void {
		const cards = () => Array.from(grid.querySelectorAll<HTMLElement>(':scope > .card'));
		const maxRows = Number(grid.dataset.maxRows);
		let gridColumns = 0;
		// Explicit placements reserve cells before CSS Grid auto-places the rest.
		const renderGrid = (preferred?: HTMLElement) => {
			const ordered = cards();
			if (preferred) {
				ordered.splice(ordered.indexOf(preferred), 1);
				ordered.unshift(preferred);
			}
			const occupied = new Set<number>();
			for (const card of ordered) {
				const columns = Math.min(Number(card.dataset.columns), gridColumns);
				const rows = Number(card.dataset.rows);
				const [row, column, anchorColumns] = card.dataset.anchor?.split(',').map(Number) ?? [];
				let cells: number[] = [];
				if (anchorColumns === gridColumns && column + columns - 1 <= gridColumns) {
					cells = Array.from({ length: rows * columns }, (_, index) =>
						(row + Math.floor(index / columns) - 1) * gridColumns + column + index % columns);
				}
				const anchored = cells.length > 0 && cells.every(cell => !occupied.has(cell));
				if (anchored) {
					cells.forEach(cell => occupied.add(cell));
				}
				card.style.gridColumnStart = anchored ? String(column) : '';
				card.style.gridRowStart = anchored ? String(row) : '';
				card.style.gridColumnEnd = `span ${columns}`;
				card.style.gridRowEnd = `span ${rows}`;
			}
		};
		const updateColumns = () => {
			const columns = Number(getComputedStyle(grid).getPropertyValue('--dashboard-columns')) || 1;
			if (columns !== gridColumns) {
				gridColumns = columns;
				renderGrid();
			}
		};
		updateColumns();
		new ResizeObserver(updateColumns).observe(grid);

		const trackAt = (offset: number, tracks: string, gap: string) => {
			let start = 0;
			return tracks.split(' ').findIndex(track => {
				const matches = Math.abs(start - offset) < 1;
				start += parseFloat(track) + parseFloat(gap);
				return matches;
			}) + 1;
		};
		const topAnchor = (card: HTMLElement, edge: string) => {
			if (edge !== 'top') {
				return undefined;
			}
			const rect = card.getBoundingClientRect();
			const gridRect = grid.getBoundingClientRect();
			const style = getComputedStyle(grid);
			const row = trackAt(rect.top - gridRect.top, style.gridTemplateRows, style.rowGap);
			const column = trackAt(rect.left - gridRect.left, style.gridTemplateColumns, style.columnGap);
			return row && column ? { row, column, gridColumns } : undefined;
		};
		const setAnchor = (card: HTMLElement, anchor: string | undefined) => {
			if (anchor === undefined) {
				delete card.dataset.anchor;
			} else {
				card.dataset.anchor = anchor;
			}
		};
		const saveSize = () => {
			for (const card of cards()) {
				if (Number(card.dataset.anchor?.split(',')[2]) === gridColumns && !card.style.gridRowStart) {
					delete card.dataset.anchor;
				}
			}
			save();
		};

		const resizeTarget = (target: EventTarget | null) => {
			if (!(target instanceof HTMLElement) || !target.classList.contains('resize-handle')) {
				return undefined;
			}
			const card = target.closest<HTMLElement>('.card');
			const edge = target.dataset.edge;
			if (!card || !edge) {
				return undefined;
			}
			return { handle: target, card, edge, horizontal: edge === 'left' || edge === 'right' };
		};
		const changeSpan = (card: HTMLElement, dimension: 'columns' | 'rows', span: number, anchor: string | undefined) => {
			const value = String(span);
			if (card.dataset[dimension] !== value || card.dataset.anchor !== anchor) {
				card.dataset[dimension] = value;
				setAnchor(card, anchor);
				renderGrid(card);
			}
		};

		let gesture: {
			pointerId: number;
			card: HTMLElement;
			dimension: 'columns' | 'rows';
			initial: number;
			visible: number;
			maximum: number;
			origin: number;
			step: number;
			direction: number;
			anchor: string | undefined;
			top: ReturnType<typeof topAnchor>;
		} | undefined;

		grid.addEventListener('pointerdown', event => {
			const target = resizeTarget(event.target);
			if (!target || event.button !== 0 || gesture) {
				return;
			}
			const { handle, card, edge, horizontal } = target;
			const dimension = horizontal ? 'columns' : 'rows';
			const initial = Number(card.dataset[dimension]);
			const top = topAnchor(card, edge);
			const maximum = horizontal ? gridColumns : edge === 'top' ? Math.min(maxRows, initial + (top?.row ?? 1) - 1) : maxRows;
			const visible = Math.min(initial, maximum);
			const style = getComputedStyle(grid);
			const step = horizontal
				? (grid.clientWidth + parseFloat(style.columnGap)) / gridColumns
				: (card.getBoundingClientRect().height + parseFloat(style.rowGap)) / visible;
			gesture = {
				pointerId: event.pointerId, card, dimension, initial, visible, maximum, step, top, anchor: card.dataset.anchor,
				origin: horizontal ? event.clientX : event.clientY,
				direction: edge === 'left' || edge === 'top' ? -1 : 1,
			};
			event.preventDefault();
			handle.focus({ preventScroll: true });
			handle.setPointerCapture(event.pointerId);
		});
		grid.addEventListener('pointermove', event => {
			if (!gesture || gesture.pointerId !== event.pointerId) {
				return;
			}
			const { card, dimension, origin, direction, step, visible, maximum, initial, top, anchor } = gesture;
			const position = dimension === 'columns' ? event.clientX : event.clientY;
			const delta = Math.round(direction * (position - origin) / step);
			const size = Math.max(1, Math.min(maximum, visible + delta));
			const placement = top && size !== visible ? `${top.row + visible - size},${top.column},${top.gridColumns}` : anchor;
			changeSpan(card, dimension, size === visible ? initial : size, placement);
		});
		const finish = (commit: boolean) => {
			if (!gesture) {
				return;
			}
			const { card, dimension, initial, anchor } = gesture;
			gesture = undefined;
			if (!commit) {
				changeSpan(card, dimension, initial, anchor);
				renderGrid();
			} else if (Number(card.dataset[dimension]) !== initial) {
				saveSize();
			}
		};
		for (const type of ['pointerup', 'pointercancel', 'lostpointercapture'] as const) {
			grid.addEventListener(type, event => {
				if (gesture?.pointerId === event.pointerId) {
					finish(type === 'pointerup');
				}
			});
		}
		grid.addEventListener('keydown', event => {
			if (event.key === 'Escape') {
				finish(false);
				return;
			}
			const target = resizeTarget(event.target);
			if (!target) {
				return;
			}
			const { card, edge, horizontal } = target;
			const grow = event.key === (horizontal ? 'ArrowRight' : edge === 'top' ? 'ArrowUp' : 'ArrowDown');
			if (!grow && event.key !== (horizontal ? 'ArrowLeft' : edge === 'top' ? 'ArrowDown' : 'ArrowUp')) {
				return;
			}
			event.preventDefault();
			const dimension = horizontal ? 'columns' : 'rows';
			const initial = Number(card.dataset[dimension]);
			const top = topAnchor(card, edge);
			const maximum = horizontal ? gridColumns : edge === 'top' ? Math.min(maxRows, initial + (top?.row ?? 1) - 1) : maxRows;
			const visible = Math.min(initial, maximum);
			const size = Math.max(1, Math.min(maximum, visible + (grow ? 1 : -1)));
			if (size !== visible) {
				const anchor = top ? `${top.row + visible - size},${top.column},${top.gridColumns}` : card.dataset.anchor;
				changeSpan(card, dimension, size, anchor);
				saveSize();
			}
		});
		return renderGrid;
	}

	type ViewState = {
		folder: string | undefined; editing?: boolean; showCompleted?: boolean; notesDraft?: string;
		dueDraft?: { title: string; due: string }; pageScroll?: number; manuscriptScroll?: number;
	};
	const { acquireVsCodeApi } = globalThis as typeof globalThis & {
		acquireVsCodeApi(): {
			getState(): ViewState | undefined;
			setState(state: ViewState): void;
			postMessage(message: string | { type: 'save-task-notes'; notes: string }
				| { type: 'save-task-due'; title: string; due: string }
				| { id: string; columns: number; rows: number; anchor?: number[] }[]): void;
		};
	};
	const api = acquireVsCodeApi();
	const folder = document.body.dataset.project;
	const settings = document.getElementById('layout-settings');
	const grid = document.querySelector<HTMLElement>('.dashboard');
	const state = { ...api.getState(), folder };
	api.setState(state);

	document.addEventListener('click', event => {
		const action = event.target instanceof Element
			? event.target.closest<HTMLButtonElement>('button[data-action]')?.dataset.action
			: undefined;
		if (action) {
			api.postMessage(action);
		}
	});

	if (!settings || !grid) {
		return;
	}

	const completed = document.querySelector<HTMLDetailsElement>('#completed-tasks');
	if (completed) {
		completed.open = state.showCompleted ?? false;
		completed.addEventListener('toggle', () => {
			state.showCompleted = completed.open;
			api.setState(state);
		});
	}

	const notesDialog = document.querySelector<HTMLDialogElement>('#task-notes')!;
	const notesText = notesDialog.querySelector<HTMLTextAreaElement>('textarea')!;
	const notesError = notesDialog.querySelector<HTMLElement>('#task-notes-error')!;
	const notesTitle = notesDialog.querySelector<HTMLElement>('#task-notes-title')!;
	const cancelNotes = notesDialog.querySelector<HTMLButtonElement>('#cancel-task-notes')!;
	const saveNotes = notesDialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
	const setSavingNotes = (saving: boolean) => {
		saveNotes.disabled = cancelNotes.disabled = saving;
		notesText.readOnly = saving;
		notesError.hidden = true;
	};
	cancelNotes.addEventListener('click', () => notesDialog.close());
	notesDialog.addEventListener('close', () => {
		delete state.notesDraft;
		api.setState(state);
		api.postMessage('cancel-task-notes');
	});
	notesDialog.addEventListener('cancel', event => {
		if (saveNotes.disabled) {
			event.preventDefault();
		}
	});
	notesDialog.addEventListener('submit', event => {
		event.preventDefault();
		setSavingNotes(true);
		api.postMessage({ type: 'save-task-notes', notes: notesText.value });
	});
	notesText.addEventListener('input', () => {
		state.notesDraft = notesText.value;
		api.setState(state);
	});
	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'open-task-notes' && !notesDialog.open) {
			notesTitle.textContent = data.title;
			notesText.value = (data.restore ? state.notesDraft : undefined) ?? data.notes;
			state.notesDraft = notesText.value;
			api.setState(state);
			setSavingNotes(!!data.saving);
			notesDialog.showModal();
			notesText.focus();
		} else if (data?.type === 'task-notes-save-failed' && notesDialog.open) {
			setSavingNotes(false);
			notesError.textContent = data.message;
			notesError.hidden = false;
		} else if (data?.type === 'clear-task-notes-draft') {
			delete state.notesDraft;
			api.setState(state);
		}
	});
	if (state.notesDraft !== undefined) {
		api.postMessage('restore-task-notes');
	}

	const dueDialog = document.querySelector<HTMLDialogElement>('#task-due')!;
	const dueHeading = dueDialog.querySelector<HTMLElement>('#task-due-heading')!;
	const dueTitle = dueDialog.querySelector<HTMLElement>('#task-due-title')!;
	const dueNameField = dueDialog.querySelector<HTMLElement>('#task-due-name-field')!;
	const dueName = dueDialog.querySelector<HTMLInputElement>('#task-due-name')!;
	const dueDate = dueDialog.querySelector<HTMLInputElement>('#task-due-date')!;
	const dueError = dueDialog.querySelector<HTMLElement>('#task-due-error')!;
	const clearDue = dueDialog.querySelector<HTMLButtonElement>('#clear-task-due')!;
	const cancelDue = dueDialog.querySelector<HTMLButtonElement>('#cancel-task-due')!;
	const saveDue = dueDialog.querySelector<HTMLButtonElement>('button[type="submit"]')!;
	const setSavingDue = (saving: boolean) => {
		saveDue.disabled = cancelDue.disabled = clearDue.disabled = saving;
		dueName.readOnly = dueDate.readOnly = saving;
		dueError.hidden = true;
	};
	const saveDueDraft = () => {
		state.dueDraft = { title: dueName.value, due: dueDate.value };
		api.setState(state);
	};
	cancelDue.addEventListener('click', () => dueDialog.close());
	clearDue.addEventListener('click', () => {
		dueDate.value = '';
		setSavingDue(true);
		api.postMessage({ type: 'save-task-due', title: '', due: '' });
	});
	dueDialog.addEventListener('close', () => {
		delete state.dueDraft;
		api.setState(state);
		api.postMessage('cancel-task-due');
	});
	dueDialog.addEventListener('cancel', event => {
		if (saveDue.disabled) {
			event.preventDefault();
		}
	});
	dueDialog.addEventListener('submit', event => {
		event.preventDefault();
		setSavingDue(true);
		api.postMessage({ type: 'save-task-due', title: dueName.value, due: dueDate.value });
	});
	dueName.addEventListener('input', saveDueDraft);
	dueDate.addEventListener('input', saveDueDraft);
	window.addEventListener('message', ({ data }) => {
		if (data?.type === 'open-task-due' && !dueDialog.open) {
			const create = !!data.create;
			const draft = data.restore ? state.dueDraft : undefined;
			dueHeading.textContent = (create ? dueHeading.dataset.create : dueHeading.dataset.edit) ?? '';
			dueTitle.textContent = data.title;
			dueTitle.hidden = create;
			dueNameField.hidden = !create;
			// A new deadline needs both fields, while an existing task can have its date cleared.
			dueName.required = dueDate.required = create;
			clearDue.hidden = create || !data.due;
			dueName.value = create ? draft?.title ?? '' : '';
			dueDate.value = draft?.due ?? data.due;
			saveDueDraft();
			setSavingDue(!!data.saving);
			dueDialog.showModal();
			(create ? dueName : dueDate).focus();
		} else if (data?.type === 'task-due-save-failed' && dueDialog.open) {
			setSavingDue(false);
			dueError.textContent = data.message;
			dueError.hidden = false;
		} else if (data?.type === 'clear-task-due-draft') {
			delete state.dueDraft;
			api.setState(state);
		}
	});
	if (state.dueDraft !== undefined) {
		api.postMessage('restore-task-due');
	}

	const setEditing = (editing: boolean) => {
		document.body.classList.toggle('layout-editing', editing);
		settings.setAttribute('aria-pressed', String(editing));
		state.editing = editing;
		api.setState(state);
	};
	setEditing(state.editing ?? false);
	settings.addEventListener('click', () => setEditing(!document.body.classList.contains('layout-editing')));
	const save = () => {
		api.postMessage(Array.from(grid.querySelectorAll<HTMLElement>(':scope > .card'), card => ({
			id: card.id,
			columns: Number(card.dataset.columns),
			rows: Number(card.dataset.rows),
			anchor: card.dataset.anchor?.split(',').map(Number),
		})));
	};
	const relayout = enableResizing(grid, save);
	window.scrollTo(0, state.pageScroll ?? 0);
	window.addEventListener('scroll', () => {
		state.pageScroll = window.scrollY;
		api.setState(state);
	});
	const manuscript = grid.querySelector<HTMLElement>('#manuscript .card-content');
	if (manuscript) {
		manuscript.scrollTop = state.manuscriptScroll ?? 0;
		manuscript.addEventListener('scroll', () => {
			state.manuscriptScroll = manuscript.scrollTop;
			api.setState(state);
		});
	}
	const reorder = (source: HTMLElement, target: Element, before: boolean) => {
		delete source.dataset.anchor;
		if (before) {
			target.before(source);
		} else {
			target.after(source);
		}
		relayout();
		save();
	};

	grid.addEventListener('keydown', event => {
		if (!document.body.classList.contains('layout-editing')) {
			return;
		}
		if (event.key === 'Escape') {
			event.stopPropagation();
			setEditing(false);
			settings.focus();
			return;
		}
		const handle = event.target;
		if (!(handle instanceof HTMLElement) || !handle.classList.contains('drag-handle')) {
			return;
		}
		const earlier = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
		if (!earlier && event.key !== 'ArrowRight' && event.key !== 'ArrowDown') {
			return;
		}
		event.preventDefault();
		const card = handle.closest<HTMLElement>('[data-component]');
		const target = earlier ? card?.previousElementSibling : card?.nextElementSibling;
		if (card && target) {
			reorder(card, target, earlier);
			handle.focus();
		}
	});

	enableReordering(grid, reorder);
})();
