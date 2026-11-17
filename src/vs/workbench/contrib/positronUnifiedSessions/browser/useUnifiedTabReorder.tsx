/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/

import { RefObject, useEffect, useRef, useState } from 'react';
import { isHTMLElement } from '../../../../base/browser/dom.js';
import { DropSide } from './unifiedSessionsOrder.js';

/**
 * How far the pointer has to move, in pixels, before a press becomes a drag.
 * Less than that is a click.
 */
const DRAG_THRESHOLD = 4;

/**
 * The data attribute that marks the elements of the list that can be dragged,
 * and holds the key of the entry each one shows.
 */
export const ENTRY_KEY_ATTRIBUTE = 'data-entry-key';

/**
 * Where a dragged entry would be dropped.
 */
export interface DropTarget {
	readonly key: string;
	readonly side: DropSide;
}

/**
 * What the list shows while an entry is being dragged.
 */
export interface TabReorderState {
	readonly draggingKey: string | undefined;
	readonly dropTarget: DropTarget | undefined;
}

/**
 * Works out which entry the pointer is over, and which side of it.
 * @param container The element that has the entries as its children.
 * @param clientY The vertical position of the pointer.
 * @param sourceKey The key of the entry being dragged.
 * @returns The drop target, or undefined if the pointer is over the dragged entry.
 */
function findDropTarget(container: HTMLElement, clientY: number, sourceKey: string): DropTarget | undefined {
	const entries = Array.from(container.children).filter((child): child is HTMLElement =>
		isHTMLElement(child) && child.hasAttribute(ENTRY_KEY_ATTRIBUTE));
	if (entries.length === 0) {
		return undefined;
	}

	let target = entries[entries.length - 1];
	let side: DropSide = 'after';
	for (const entry of entries) {
		const rect = entry.getBoundingClientRect();
		if (clientY < rect.bottom) {
			target = entry;
			side = clientY < rect.top + rect.height / 2 ? 'before' : 'after';
			break;
		}
	}

	const key = target.getAttribute(ENTRY_KEY_ATTRIBUTE)!;
	return key === sourceKey ? undefined : { key, side };
}

/**
 * Lets the entries of a list be reordered by dragging them with the mouse. It
 * follows the pointer itself rather than using the browser's drag and drop,
 * which does not start from tabs that cancel the mouse down, as console tabs do.
 * @param containerRef The element that has the entries as its children. Each
 * entry carries its key in the `data-entry-key` attribute.
 * @param onReorder Called when an entry is dropped on another one.
 * @returns What to show while an entry is dragged.
 */
export function useUnifiedTabReorder(
	containerRef: RefObject<HTMLElement | null>,
	onReorder: (sourceKey: string, targetKey: string, side: DropSide) => void
): TabReorderState {
	const [draggingKey, setDraggingKey] = useState<string | undefined>(undefined);
	const [dropTarget, setDropTarget] = useState<DropTarget | undefined>(undefined);

	// The latest callback, so that a drag in progress is not cut short when it changes.
	const onReorderRef = useRef(onReorder);
	onReorderRef.current = onReorder;

	useEffect(() => {
		const container = containerRef.current;
		if (!container) {
			return;
		}
		const ownerDocument = container.ownerDocument;

		/** Removes the listeners of the drag in progress, if there is one. */
		let stopDrag: (() => void) | undefined;

		const handlePointerDown = (e: PointerEvent) => {
			const element = e.target instanceof Element ? e.target : undefined;
			if (e.button !== 0 || !element || element.closest('button, input')) {
				return;
			}
			const entry = element.closest(`[${ENTRY_KEY_ATTRIBUTE}]`);
			const sourceKey = entry?.getAttribute(ENTRY_KEY_ATTRIBUTE);
			if (!entry || entry.parentElement !== container || !sourceKey) {
				return;
			}

			const startY = e.clientY;
			let dragging = false;
			let target: DropTarget | undefined;

			const handlePointerMove = (move: PointerEvent) => {
				if (!dragging) {
					if (Math.abs(move.clientY - startY) < DRAG_THRESHOLD) {
						return;
					}
					dragging = true;
					setDraggingKey(sourceKey);
				}
				target = findDropTarget(container, move.clientY, sourceKey);
				setDropTarget(target);
			};

			const removeListeners = () => {
				ownerDocument.removeEventListener('pointermove', handlePointerMove);
				ownerDocument.removeEventListener('pointerup', handlePointerUp);
				ownerDocument.removeEventListener('pointercancel', handlePointerCancel);
				ownerDocument.removeEventListener('keydown', handleKeyDown, true);
				stopDrag = undefined;
			};

			const finish = (drop: boolean) => {
				removeListeners();
				if (!dragging) {
					return;
				}
				// The release of a drag would otherwise also select the tab it ends on.
				const swallowClick = (click: Event) => {
					click.stopPropagation();
					click.preventDefault();
				};
				container.addEventListener('click', swallowClick, { capture: true, once: true });
				ownerDocument.defaultView?.setTimeout(() => container.removeEventListener('click', swallowClick, true), 0);

				setDraggingKey(undefined);
				setDropTarget(undefined);
				if (drop && target) {
					onReorderRef.current(sourceKey, target.key, target.side);
				}
			};

			function handlePointerUp() {
				finish(true);
			}
			function handlePointerCancel() {
				finish(false);
			}
			function handleKeyDown(key: KeyboardEvent) {
				if (key.key === 'Escape') {
					key.stopPropagation();
					finish(false);
				}
			}

			ownerDocument.addEventListener('pointermove', handlePointerMove);
			ownerDocument.addEventListener('pointerup', handlePointerUp);
			ownerDocument.addEventListener('pointercancel', handlePointerCancel);
			ownerDocument.addEventListener('keydown', handleKeyDown, true);
			stopDrag = removeListeners;
		};

		container.addEventListener('pointerdown', handlePointerDown);
		return () => {
			container.removeEventListener('pointerdown', handlePointerDown);
			stopDrag?.();
		};
	}, [containerRef]);

	return { draggingKey, dropTarget };
}
