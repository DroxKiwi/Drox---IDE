/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

/** What the tour opens before the spotlight. `wizard-sample` fills a draft and never saves it. */
export type DroxTutorialOpen =
	| 'chat'
	| 'chip'
	| 'model'
	| 'server'
	| 'wizard'
	| 'wizard-sample'
	| 'codebase'
	| 'regulation'
	| 'traffic'
	| 'ports'
	| 'sdtcm';

/** One beat of the tour. `target` is a selector inside the workbench; the rest of the window dims. */
export interface DroxTutorialStep {
	readonly id: string;
	readonly title: string;
	readonly body: string;
	readonly open?: DroxTutorialOpen;
	readonly target?: string;
	readonly fallback?: string;
	readonly link?: { readonly label: string; readonly href: string };
	/** Open the SDTCM map in an editor tab. Does not start a run. */
	readonly map?: boolean;
	/** Show the session-card toolbar, which is otherwise hidden until hover. */
	readonly revealSessionTools?: boolean;
	/** Agents tour: make sure a discussion card exists before spotlighting its icon. */
	readonly ensureHistory?: boolean;
}

export const DROX_TUTORIAL_VSCODE_DOCS = 'https://code.visualstudio.com/docs';

/** IDE tour, in display order. Read top to bottom. */
export const DROX_TUTORIAL_STEPS: readonly DroxTutorialStep[] = [
	{
		id: 'vscode-fork',
		title: 'Tutorial',
		body: 'Drox IDE is a fork of Visual Studio Code. Most features of version 1.127 are included.',
		link: { label: 'Visual Studio Code documentation', href: DROX_TUTORIAL_VSCODE_DOCS },
	},
	{
		id: 'open-in-agents',
		title: 'Open in Agents',
		body: 'Open in Agents opens this same workspace in the Agents window. That window is a second view of the chat, laid out for longer sessions. This tour stays here and does not open it. The Agents window has its own tour.',
		target: '.open-in-agents-titlebar-widget',
	},
	{
		id: 'model-picker',
		title: 'Model',
		body: 'This first button picks which model answers in the chat. It lists the models already available on the current connection.',
		open: 'chat',
		target: '.drox-ide-native-chat .model-picker-split',
	},
	{
		id: 'model',
		title: 'Model settings',
		body: 'Model settings is the next button. It opens the panel for context size, iterations, and sampling. It does not store a server address.',
		open: 'chip',
		target: '#architect-model-vignette',
	},
	{
		id: 'server',
		title: 'Server',
		body: 'Server is the connection button. It opens the panel where a backend is chosen. Opening it does not write a connection.',
		open: 'chip',
		target: '#general-settings-vignette',
	},
	{
		id: 'auto',
		title: 'Auto',
		body: 'Auto forces the codebase index into the next prompt when the index is ready. Leave it off when you want the model to read files itself.',
		open: 'chip',
		target: '#codebase-force-vignette',
	},
	{
		id: 'align-chip',
		title: 'SDTCM Align',
		body: 'Align asks the model to line the project map up with the code. It spends tokens. This tour does not turn it on.',
		open: 'chip',
		target: '#sdtcm-auto-align-vignette',
	},
	{
		id: 'permission',
		title: 'Request mode',
		body: 'Request mode is the last button on the row. It sets how much the model may do on its own: plan only, trust edits, or confirm each write.',
		open: 'chip',
		target: '.drox-agents-permission-picker',
	},
	{
		id: 'model-window',
		title: 'Model settings',
		body: 'This is the window behind Model settings: context size, how long a run may continue, and sampling. Closing the tour leaves these values as they were.',
		open: 'model',
		target: '#role-model-panel',
		fallback: '#architect-model-vignette',
	},
	{
		id: 'server-window',
		title: 'Server',
		body: 'This is the window behind Server. A connection is stored only when the wizard finishes a successful test.',
		open: 'server',
		target: '#general-settings-panel',
		fallback: '#general-settings-vignette',
	},
	{
		id: 'change-connection',
		title: 'Change connection',
		body: 'Change connection is the button that opens the connection window. The next two steps open that window for you, and nothing is saved.',
		open: 'server',
		target: '#general-settings-connect-ia',
		fallback: '#general-settings-panel',
	},
	{
		id: 'wizard',
		title: 'Connection',
		body: 'This is the connection window. Cloud is a hosted provider. Self-hosted is your own server. This preview is not saved.',
		open: 'wizard',
		target: '#drox-connection-wizard .drox-connection-wizard-card',
	},
	{
		id: 'wizard-sample',
		title: 'Sample connection',
		body: 'A sample local address is filled in, http://127.0.0.1:11434, as if Ollama were running on this machine. Finish would test it and then store it. This tour never presses Finish, and Stop discards the draft.',
		open: 'wizard-sample',
		target: '#drox-connection-wizard .drox-connection-wizard-card',
	},
	{
		id: 'codebase-button',
		title: 'Codebase',
		body: 'Codebase is a local index of the open folder. It stays on this machine, under the workspace .drox data, and nothing in it is sent out by itself. The chat uses it to search the project. Inside the panel: the index state, the vectorization pipeline, the local embedding model, the last inject into a prompt, storage, reindex and purge, the file catalogue, and a probe.',
		open: 'codebase',
		target: '.activitybar .action-item:has(.codicon-drox-codebase-view-icon)',
	},
	{
		id: 'codebase-index',
		title: 'Codebase',
		body: 'The header names the indexed folder and the state: idle, indexing, paused, missing, or error. Alerts, when there are any, appear just under it.',
		open: 'codebase',
		target: '[data-drox-tour="codebase-header"]',
	},
	{
		id: 'codebase-pipeline',
		title: 'Codebase',
		body: 'The vectorization pipeline is the live pass on this machine: scan, chunk, embed, write. Export diag copies a debug dump. Clear log only clears that list.',
		open: 'codebase',
		target: '.drox-codebase-pipeline',
	},
	{
		id: 'codebase-embed',
		title: 'Codebase',
		body: 'Embed turns each chunk into a vector so a search can match meaning, not only the same words. It runs locally inside drox. With it off, the index stays lexical: exact words only.',
		open: 'codebase',
		target: '[data-drox-tour="codebase-embed"]',
	},
	{
		id: 'codebase-inject',
		title: 'Codebase',
		body: 'Last auto-inject is what the previous prompt actually received from the index. Auto ON packs hits into the next prompt. Auto OFF leaves the model to read files itself. The Auto chip in the chat is the same switch.',
		open: 'codebase',
		target: '.drox-codebase-inject',
	},
	{
		id: 'codebase-state',
		title: 'Codebase',
		body: 'Storage shows how much the index holds — files, chunks, vectors — and the path of the vector database on disk.',
		open: 'codebase',
		target: '[data-drox-tour="codebase-storage"]',
	},
	{
		id: 'codebase-actions',
		title: 'Codebase',
		body: 'Reindex rebuilds the index from the folder. Purge all saved data deletes that index from this machine. Neither one calls the chat model.',
		open: 'codebase',
		target: '[data-drox-tour="codebase-actions"]',
	},
	{
		id: 'codebase-catalog',
		title: 'Codebase',
		body: 'The knowledge catalogue lists the indexed files. From here you can refresh it, compact it, drop selected paths, exclude them so they are never indexed again, or rebuild only those paths.',
		open: 'codebase',
		target: '.drox-codebase-catalog',
	},
	{
		id: 'codebase-probe',
		title: 'Codebase',
		body: 'Probe runs the same search the chat would use, on a phrase you type, and shows the hits. It does not send a prompt.',
		open: 'codebase',
		target: '[data-drox-tour="codebase-probe"]',
	},
	{
		id: 'regulation-button',
		title: 'Regulation',
		body: 'Regulation scores how the current model behaves on this workspace. The score follows the model, not one conversation. Each lever can stay on Auto, which applies a recommended module after a scored run, or be held on a module you pick. Trends and the run history sit under the levers.',
		open: 'regulation',
		target: '.activitybar .action-item:has(.codicon-drox-regulation-view-icon)',
	},
	{
		id: 'regulation-scores',
		title: 'Regulation',
		body: 'Global is one number for the model on this workspace, plus how many runs it was built from. It does not reset when you start a new chat.',
		open: 'regulation',
		target: '.drox-regulation-global',
	},
	{
		id: 'regulation-levers',
		title: 'Regulation',
		body: 'Each lever has a score and a module. Auto ON lets the score pick the module after the next run. Choosing a module yourself switches that lever to manual and keeps your pick.',
		open: 'regulation',
		target: '.drox-regulation-levers',
	},
	{
		id: 'regulation-charts',
		title: 'Regulation',
		body: 'Trends plot the global score across recent scored runs. The chart stays empty until a run has been scored.',
		open: 'regulation',
		target: '.drox-regulation-charts',
	},
	{
		id: 'regulation-history',
		title: 'Regulation',
		body: 'Run history is the list of those scored runs, newest first. Finishing an agent run is what adds a row.',
		open: 'regulation',
		target: '[data-drox-tour="regulation-history"]',
	},
	{
		id: 'traffic-button',
		title: 'Traffic',
		body: 'Traffic records the requests Drox itself sends: the chat model, embeddings, MCP, and tools. It is not a proxy for the rest of the machine. You choose whether capture stays in memory until quit or is kept on disk, you read the ledger, and you can raise an alert when a call matches a host.',
		open: 'traffic',
		target: '.activitybar .action-item:has(.codicon-drox-traffic-view-icon)',
	},
	{
		id: 'traffic-capture',
		title: 'Traffic',
		body: 'Enable capture is remembered. Live session clears the buffer when you quit. Persisted on disk keeps it under the path shown here. Clear drops the current buffer.',
		open: 'traffic',
		target: '[data-drox-tour="traffic-capture"]',
	},
	{
		id: 'traffic-ledger',
		title: 'Traffic',
		body: 'The ledger is the list of captured calls, newest first. Newer and Older move through the pages.',
		open: 'traffic',
		target: '[data-drox-tour="traffic-ledger"]',
	},
	{
		id: 'traffic-alerts',
		title: 'Traffic',
		body: 'A destination alert matches a host, an IP, or a piece of URL. When a captured call hits it, you get a toast. Use one for a cloud API you want to notice.',
		open: 'traffic',
		target: '[data-drox-tour="traffic-alerts"]',
	},
	{
		id: 'ports-button',
		title: 'Ports',
		body: 'Ports keeps tunnels and the commands that open them. A tool is an external program, such as ssh, saved for your user. A forward belongs to the open workspace: it maps a remote host and port onto a local port, and can open a preview or a browser when the tunnel is ready.',
		open: 'ports',
		target: '.activitybar .action-item:has(.codicon-drox-ports-view-icon)',
	},
	{
		id: 'ports-tools',
		title: 'Ports',
		body: 'External tools is the command list. A label, the program, and its arguments. Placeholders such as {{localPort}} and {{remoteHost}} are filled when a forward starts. One tool can be marked as the default.',
		open: 'ports',
		target: '[data-drox-tour="ports-tools"]',
	},
	{
		id: 'ports-forwards',
		title: 'Ports',
		body: 'A forward names a remote host and port and the local port to open. It runs through the tool you pick. On ready, it can stay quiet, open a preview, or open a browser.',
		open: 'ports',
		target: '[data-drox-tour="ports-forwards"]',
	},
	{
		id: 'sdtcm-button',
		title: 'SDTCM',
		body: 'SDTCM is a map of the project: folders, files, bricks, and pieces of data, with the links between them. The next steps open that map for you. Opening it does not spend tokens. Building or updating it does, and this tour never starts a run. The side panel then holds Move, tags, link filters, and a focus list.',
		open: 'sdtcm',
		map: true,
		target: '.activitybar .action-item:has(.codicon-drox-sdtcm-view-icon)',
	},
	{
		id: 'sdtcm-map',
		title: 'SDTCM',
		body: 'This is the map, open in an editor tab. Bricks sit on the graph. Links are the edges between them. Clicking a brick later can open the code it came from. Nothing here has called the model.',
		open: 'sdtcm',
		map: true,
		target: '[data-drox-tour="sdtcm-graph"]',
	},
	{
		id: 'sdtcm-header',
		title: 'SDTCM',
		body: 'The header is the strip above the graph. The dot and the text are the live status. The chips — build, data, trace, link, tag — choose where a run starts. Launch a run builds or updates the map and spends tokens. Realign lines it up with the code and spends tokens too. This tour does not press either. Zoom and Reset only change what you see.',
		open: 'sdtcm',
		map: true,
		target: '[data-drox-tour="sdtcm-header"]',
	},
	{
		id: 'sdtcm-open',
		title: 'SDTCM',
		body: 'Open the map, in the side panel, is the same action the tour just did. Use it when the editor tab has been closed.',
		open: 'sdtcm',
		map: true,
		target: '[data-drox-tour="sdtcm-open"]',
	},
	{
		id: 'sdtcm-tools',
		title: 'SDTCM',
		body: 'Move lets you drag bricks on the map. Turn it on, then drag. Turn it off when the layout should stay put.',
		open: 'sdtcm',
		map: true,
		target: '[data-drox-tour="sdtcm-tools"]',
	},
	{
		id: 'sdtcm-tags',
		title: 'SDTCM',
		body: 'A tag names a folder, a file, a brick, or a piece of data. The name starts with a letter and stays unique. A description is required. The checkbox shows or hides that tag on the map.',
		open: 'sdtcm',
		map: true,
		target: '[data-drox-tour="sdtcm-tags"]',
	},
	{
		id: 'sdtcm-links',
		title: 'SDTCM',
		body: 'Links shows or hides the edges. The other switches filter by kind, such as type or value, and by form, declare or apply.',
		open: 'sdtcm',
		map: true,
		target: '[data-drox-tour="sdtcm-links"]',
	},
	{
		id: 'sdtcm-focus',
		title: 'SDTCM',
		body: 'Keep in focus pins paths so they stay on the map. Remove drops one pin. Remove all clears the list. An empty list means nothing is pinned.',
		open: 'sdtcm',
		map: true,
		target: '[data-drox-tour="sdtcm-focus"]',
	},
	{
		id: 'sdtcm-align',
		title: 'SDTCM',
		body: 'Align, on the chat row, is the pass that lines the map up with the code. It calls the model and spends tokens. It stays off until you turn it on. This tour does not switch it.',
		open: 'sdtcm',
		map: true,
		target: '#sdtcm-auto-align-vignette',
	},
];
