/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { DashboardComponent } from './component';
import { deadlines, manuscript, quickLinks, tasks } from './details';
import { data, documentation } from './files';
import { taskSummary } from './metrics';

/** Registers the available components in their default order. */
export function createComponents(): ReadonlyMap<string, DashboardComponent> {
	const components = [
		taskSummary(), tasks(), deadlines(), manuscript(), quickLinks(), documentation(), data(),
	];
	return new Map(components.map(component => [component.id, component]));
}
