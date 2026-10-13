/*---------------------------------------------------------------------------------------------
 *  Copyright (C) 2025-2026 Posit Software, PBC. All rights reserved.
 *  Licensed under the Elastic License 2.0. See LICENSE.txt for license information.
 *--------------------------------------------------------------------------------------------*/


// CSS.
import './activityErrorQuickFix.css';

// React.
import { useMemo, useRef } from 'react';

// Other dependencies.
import { localize } from '../../../../../nls.js';
import { Button } from '../../../../../base/browser/ui/positronComponents/button/button.js';
import { usePositronConfiguration } from '../../../../../base/browser/positronReactHooks.js';
import { usePositronReactServicesContext } from '../../../../../base/browser/positronReactRendererContext.js';
import { ANSIOutputLine } from '../../../../../base/common/ansiOutput.js';
import { toErrorMessage } from '../../../../../base/common/errorMessage.js';
import { encodeBase64, VSBuffer } from '../../../../../base/common/buffer.js';
import { NewChatFile, NewChatOptions, openPositAssistantChat } from '../../../positronAssistant/browser/positAssistantChat.js';

const fixPrompt = localize('positronConsoleAssistantFixPrompt', "Fix this console error.");
const explainPrompt = localize('positronConsoleAssistantExplainPrompt', "Explain this console error.");

/** Setting that chooses which AI tool the console Fix and Explain actions use. */
export const CONSOLE_ACTIONS_TARGET_KEY = 'console.assistantActions.target';
export const CLAUDE_CODE_TARGET = 'claude-code';
export const CLAUDE_CODE_EXTENSION_ID = 'anthropic.claude-code';

// Command exposed by the Claude Code extension; its arguments are an optional
// session ID and an initial prompt.
const CLAUDE_CODE_OPEN_COMMAND = 'claude-vscode.primaryEditor.open';

const ATTACHMENT_NAME = localize('positronConsoleAssistantErrorAttachmentName', "Console Error");

interface ConsoleQuickFixProps {
	outputLines: ANSIOutputLine[];
	tracebackLines: ANSIOutputLine[];
}

const formatOutput = (outputLines: ANSIOutputLine[], tracebackLines: ANSIOutputLine[]) => {
	const lineText = (lines: ANSIOutputLine[]) =>
		lines.map(line => line.outputRuns.map(run => run.text).join('')).join('\n');
	const message = lineText(outputLines);
	const traceback = lineText(tracebackLines);
	return traceback ? `${message}\n${traceback}` : message;
};

const buildAttachment = (text: string): NewChatFile | undefined => {
	if (!text) {
		return undefined;
	}
	const base64 = encodeBase64(VSBuffer.fromString(text));
	return { uri: `data:text/plain;base64,${base64}`, name: ATTACHMENT_NAME };
};

/**
 * Quick fix component.
 * @returns The rendered component.
 */
export const ConsoleQuickFix = (props: ConsoleQuickFixProps) => {
	const buttonRef = useRef<HTMLDivElement>(undefined!);
	const services = usePositronReactServicesContext();
	const { commandService, logService, notificationService } = services;

	const attachment = useMemo(
		() => buildAttachment(formatOutput(props.outputLines, props.tracebackLines)),
		[props.outputLines, props.tracebackLines]
	);

	const target = usePositronConfiguration<string>(CONSOLE_ACTIONS_TARGET_KEY);

	const runClaudeCode = async (prompt: string) => {
		try {
			// Claude Code takes no attachments, so the error text is part of the prompt.
			const errorText = formatOutput(props.outputLines, props.tracebackLines);
			await commandService.executeCommand(CLAUDE_CODE_OPEN_COMMAND, undefined, errorText ? `${prompt}\n\n${errorText}` : prompt);
		} catch (error) {
			logService.error('Failed to open Claude Code', error);
			notificationService.error(
				localize('positronConsoleClaudeCodeUnavailable', "Claude Code could not be opened: {0}", toErrorMessage(error))
			);
		}
	};

	const runNewChat = (prompt: string) => {
		if (target === CLAUDE_CODE_TARGET) {
			return runClaudeCode(prompt);
		}
		const options: NewChatOptions = {
			prompt,
			target: 'auto',
			behavior: 'submit',
			...(attachment && { files: [attachment] }),
		};
		return openPositAssistantChat(commandService, notificationService, logService, options);
	};

	const pressedFixHandler = () => runNewChat(fixPrompt);

	const pressedExplainHandler = () => runNewChat(explainPrompt);

	// Render.
	return (
		<div className='quick-fix'>
			<Button className='assistant-action' onPressed={pressedFixHandler}>
				<div ref={buttonRef} className='link-text'>
					<span className='codicon codicon-sparkle' />
					{localize('positronConsoleAssistantFix', "Fix")}
				</div>
			</Button>
			<Button className='assistant-action' onPressed={pressedExplainHandler}>
				<div ref={buttonRef} className='link-text'>
					<span className='codicon codicon-sparkle' />
					{localize('positronConsoleAssistantExplain', "Explain")}
				</div>
			</Button>
		</div>
	);
};
