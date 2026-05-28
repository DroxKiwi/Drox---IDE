/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (global) {
	const D = global.DroxChat || (global.DroxChat = { dom: {}, state: {}, const: {}, fn: {} });
	D.vscode = acquireVsCodeApi();
	D.dom.logEl = document.getElementById('log');
	D.dom.promptEl = /** @type {HTMLTextAreaElement | null} */ (document.getElementById('prompt'));
	D.dom.refsEl = document.getElementById('refs');
	if (!D.dom.promptEl) {
		throw new Error('Drox: prompt textarea not found');
	}
	D.dom.sendBtn = document.getElementById('send');
	D.dom.sendActionIconSend = D.dom.sendBtn?.querySelector('.composer-action-icon-send');
	D.dom.sendActionIconStop = D.dom.sendBtn?.querySelector('.composer-action-icon-stop');
	D.dom.statusEl = document.getElementById('status');
	D.dom.statTokensIn = document.getElementById('tok-in');
	D.dom.statTokensOut = document.getElementById('tok-out');
	D.dom.statCtx = document.getElementById('ctx');
	D.dom.statCycleEl = document.getElementById('cycle-elapsed');
	D.dom.revertLastRunBtn = document.getElementById('revert-last-run');
	D.dom.progressEl = document.getElementById('progress');
	D.dom.userAskEl = document.getElementById('user-ask');
	D.dom.composerEl = document.getElementById('composer');
	D.dom.pendingPromptsEl = document.getElementById('pending-prompts');
	D.dom.sendQueueBadge = document.getElementById('send-queue-badge');
	D.dom.sessionTabsListEl = document.getElementById('session-tabs-list');
	D.dom.stickyUserPromptEl = document.getElementById('user-prompt-sticky');
	D.dom.stickyRunObjectiveEl = document.getElementById('run-objective-sticky');
	D.dom.agentActivityStickyEl = document.getElementById('agent-activity-sticky');
	D.dom.attachmentsEl = document.getElementById('attachments');
	D.dom.attachBtn = document.getElementById('attach');
	D.dom.addRefsBtn = document.getElementById('add-refs');
	D.dom.fileInput = document.getElementById('file-input');
	D.dom.exportTranscriptBtn = document.getElementById('export-transcript');
	D.dom.historyToggleBtn = document.getElementById('history-toggle');
	D.dom.historyCloseBtn = document.getElementById('history-close');
	D.dom.historyResetWorkspaceBtn = document.getElementById('history-reset-workspace');
	D.dom.historyPanel = document.getElementById('history-panel');
	D.dom.historyList = document.getElementById('history-list');
	D.dom.newChatBtn = document.getElementById('new-chat');
	D.dom.openSettingsBtn = document.getElementById('open-settings');
	D.dom.agentVignettesEl = document.getElementById('agent-vignettes');
	D.dom.roleModelVignettesEl = document.getElementById('role-model-vignettes');
	D.dom.generalSettingsVignettesEl = document.getElementById('general-settings-vignettes');
	D.dom.generalSettingsVignetteEl = document.getElementById('general-settings-vignette');
	D.dom.generalSettingsPanelEl = document.getElementById('general-settings-panel');
	D.dom.generalSettingsPanelCloseEl = document.getElementById('general-settings-panel-close');
	D.dom.generalSettingsOpenAllEl = document.getElementById('general-settings-open-all');
	D.dom.architectModelVignetteEl = document.getElementById('architect-model-vignette');
	D.dom.executorModelVignetteEl = document.getElementById('executor-model-vignette');
	D.dom.roleModelPanelEl = document.getElementById('role-model-panel');
	D.dom.roleModelPanelTitleEl = document.getElementById('role-model-panel-title');
	D.dom.roleModelPanelCloseEl = document.getElementById('role-model-panel-close');
	D.dom.roleModelPanelSelectEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('role-model-panel-select'));
	D.dom.roleModelPanelArchitectFieldsEl = document.getElementById('role-model-panel-architect-fields');
	D.dom.roleModelPanelExecutorFieldsEl = document.getElementById('role-model-panel-executor-fields');
	D.dom.roleModelPanelNumCtxEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-num-ctx'));
	D.dom.roleModelPanelExecutorNumCtxEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-num-ctx'));
	D.dom.roleModelPanelExecutorTopPEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-top-p'));
	D.dom.roleModelPanelExecutorTopKEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-top-k'));
	D.dom.roleModelPanelExecutorRepeatPenaltyEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-repeat-penalty'));
	D.dom.roleModelPanelExecutorMinPEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-min-p'));
	D.dom.roleModelPanelExecutorSeedEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-seed'));
	D.dom.roleModelPanelExecutorTemperatureEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-executor-temperature'));
	D.dom.roleModelPanelTopPEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-top-p'));
	D.dom.roleModelPanelTopKEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-top-k'));
	D.dom.roleModelPanelRepeatPenaltyEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-repeat-penalty'));
	D.dom.roleModelPanelMinPEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-min-p'));
	D.dom.roleModelPanelSeedEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-seed'));
	D.dom.roleModelPanelTemperatureEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-temperature'));
	D.dom.roleModelPanelMaxParallelEl = /** @type {HTMLInputElement | null} */ (document.getElementById('role-model-panel-max-parallel'));
	D.dom.roleModelPanelReloadEl = document.getElementById('role-model-panel-reload');
	D.dom.roleModelPanelExecutorHintEl = document.getElementById('role-model-panel-executor-hint');
	D.dom.llmModelPickerWrapEl = document.getElementById('llm-model-picker-wrap');
	D.dom.llmModelPickerEl = /** @type {HTMLSelectElement | null} */ (document.getElementById('llm-model-picker'));
	D.dom.llmModelReloadBtn = document.getElementById('llm-model-reload');
	D.dom.suggestionsEl = document.getElementById('prompt-suggestions');
	D.const.MODE_STORAGE_KEY = 'drox.permissionMode';
	D.const.DEFAULT_PERMISSION_MODE = 'imNotCrazy';
	D.const.VALID_MODES = new Set(['analyze', 'trustEdit', 'imNotCrazy']);
	D.const.LEGACY_MODE_MAP = {
		default: 'imNotCrazy',
		plan: 'analyze',
		acceptEdits: 'trustEdit',
		bypassPermissions: 'trustEdit',
	};
	D.state.selectedPermissionMode = D.const.DEFAULT_PERMISSION_MODE;
	D.const.PENDING_SNIPPET_MAX = 120;
	D.const.DEFAULT_PROMPT_PLACEHOLDER =
		'Ask Drox… (drop files here · @ path · /help · Enter to send)';
	D.state.pathCompleteSeq = 0;
	D.state.pathCompletePendingId = null;
	D.state.pathCompleteTimer = null;
	D.state.pathSuggestions = null;
	D.state.busy = false;
	D.state.compactBusy = false;
	D.state.runRevertAvailable = false;
	D.state.runRevertFileCount = 0;
	D.state.pendingPrompts = [];
	D.state.attachments = [];
	D.state.references = [];
	D.state.pasteAttachments = [];
	D.state.pasteCandidates = new Map();
	D.state.userAskPending = false;
	D.state.pendingUserAsk = null;
	D.state.assistantEl = null;
	D.state.currentPhase = null;
	D.state.currentPhaseEl = null;
	D.state.currentPhaseBodyEl = null;
	D.state.exploreBundleEl = null;
	D.state.exploreBodyEl = null;
	D.state.exploreSummaryEl = null;
	D.state.exploreStats = null;
	D.state.exploreReflectionHostEl = null;
	D.state.exploreToolsTrayEl = null;
	D.state.exploreToolsInnerEl = null;
	D.state.exploreToolLineCount = 0;
	D.state.exploreMetaTrayEl = null;
	D.state.exploreMetaInnerEl = null;
	D.state.exploreIssuesTray = null;
	D.state.logIssuesTray = null;
	D.state.exploreToolsTrayState = null;
	D.state.toolTraysByParent = null;
	D.state.activeSubagentCount = 0;
	/** job_id → carte sous-agent DOM (M5c async). */
	D.state.subagentJobCards = new Map();
	/** Fil linéaire — ancrage après le message user du tour. */
	D.state.runStripAnchorEl = null;
	/** Vrai dès le premier événement live (delta/tool/todo) — verrouille le strip en place. */
	D.state.runStripCommitted = false;
	/** Exécuteur orchestration — outils relayés dans la carte (P4). */
	D.state.executorCaptures = new Map();
	D.state.executorActiveJobId = null;
	D.state.executorCaptureJobId = null;
	D.state.executorCaptureStreamEl = null;
	D.state.executorCaptureToolsEl = null;
	D.state.executorCaptureThinkingEl = null;
	D.state.executorCaptureReportEl = null;
	/** Thinking exécuteur reçu avant `subagentStart` (RoleEnter précède la carte). */
	D.state.pendingExecutorThinking = null;
	/** job_id → chunks thinking en attente de carte (batch parallèle). */
	D.state.pendingExecutorThinkingByJob = new Map();
	/** Jobs exécuteur actifs (batch parallèle). */
	D.state.activeExecutorJobIds = new Set();
	D.state.executorActionRailEl = null;
	D.state.executorActionRailSummaryEl = null;
	D.state.executorActionRailListEl = null;
	D.state.executorActionLineCount = 0;
	D.state.planActionRailEl = null;
	D.state.planActionRailSummaryEl = null;
	D.state.planActionRailListEl = null;
	D.state.planActionLineCount = 0;
	D.state.architectActionRailEl = null;
	D.state.architectActionRailSummaryEl = null;
	D.state.architectActionRailListEl = null;
	D.state.architectActionLineCount = 0;
	/** Par host thinking : auto-scroll tant que l'utilisateur n'a pas remonté. */
	D.state.thinkingScrollStick = new WeakMap();
	D.state.pendingTodoUpdates = null;
	/** `architect` | `executor` | null — fil linéaire v1_2. */
	D.state.orchestrationRole = null;
	/** Rejeu journal UI — pas de post-traitement Exploring synthétique. */
	D.state.uiReplayActive = false;
	/** Nom outil en cours (mount section plan vs work). */
	D.state.pendingToolName = '';
	/** Auto-scroll du fil tant que l'utilisateur n'a pas remonté manuellement. */
	D.state.logStickToBottom = true;
	/** Réponse finale streamée sur le fil principal (hors Exploring). */
	D.state.answerStreamOnLog = false;
	/** Une réponse utilisateur a déjà été publiée sur le fil — le reste va dans Exploring replié. */
	D.state.runHasFinalAnswer = false;
	D.state.toolBlocks = new Map();
	D.state.currentTodoBlockEl = null;
	D.state.todoSnapshot = [];
	D.state.currentActivityGridEl = null;
	D.state.currentWarmupRowEl = null;
	/** Indicateur « ça tourne » en bas du fil architecte (run linéaire). */
	D.state.architectTailActivityEl = null;
	D.state.lastWarmupPhraseIdx = -1;
	D.const.WARMUP_PHRASES = [
		// Dev classics
		'npm install patience…',
		'It works on my machine…',
		'Have you tried turning it off and on again…',
		'404: motivation not found…',
		'Stack Overflow is typing…',
		'git blame --everything…',
		'Delegating patience to executors…',
		'Ollama warming the GPU…',
		'Almost done (narrator: not yet)…',
		// Gears of War
		'Mad World loading…',
		'Chainsaw bayonet revving…',
		'Grub killer mode: compiling…',
		'Marcus Fenix voice: hold on…',
		// Halo
		'Master Chief, finish the build…',
		'Cortana calculating odds…',
		'Ring world still spinning…',
		'Need a weapon (and a merge)…',
		'117 approving this commit…',
		// The Sims
		'Plumbob spinning above the architect…',
		'Needs: Fun low, Coffee critical…',
		'Simlish negotiation with the linter…',
		'Building a room for your patience…',
		'Rosebud… (just kidding)…',
		// Jurassic Park
		'Life finds a way (so do bugs)…',
		'Clever girl… hold the deploy…',
		'Spared no expense on this refactor…',
		'Must go faster — CI is chasing us…',
		'Ah ah ah, you didn\'t say the magic word…',
		// Terminator
		'I\'ll be back… with the test results…',
		'Come with me if you want to ship…',
		'Hasta la vista, flaky tests…',
		'Judgment Day postponed to next sprint…',
		'No fate but what we merge…',
		// Fallout
		'War never changes, dependencies do…',
		'Patrolling the Mojave of node_modules…',
		'Please stand by…',
		'Vault-Tec approved loading screen…',
		'Another settlement needs your patch…',
		// Star Wars
		'These aren\'t the bugs you\'re looking for…',
		'I find your lack of tests disturbing…',
		'Do or do not, there is no try/catch…',
		'The Force is strong with this build…',
		'In a galaxy far, far from prod…',
		// Lord of the Rings
		'One does not simply push to prod…',
		'You shall not pass (without review)…',
		'My precious… green CI badge…',
		'A wizard is never late, nor early…',
		// Matrix
		'There is no spoon, only stack trace…',
		'Red pill or blue pill deploy…',
		'I know kung fu — loading module…',
		'Follow the white rabbit (README)…',
		// Portal
		'The cake is a lie, the build isn\'t…',
		'Still alive… still compiling…',
		'Now you\'re thinking with portals…',
		'GLaDOS reviewing your code…',
		// Half-Life
		'Rise and shine, Mr. Developer…',
		'Waiting for Gordon to push…',
		'Right man in the wrong pipeline…',
		// Mass Effect
		'Commander, go to the relay (main branch)…',
		'Cerberus can\'t fix this one…',
		'Reapers delayed, ship anyway…',
		// Skyrim
		'Hey you, you\'re finally awake…',
		'Arrow to the knee of this PR…',
		'Fus ro dah — force-push denied…',
		'Lydia carrying your dependencies…',
		// Dark Souls / Elden Ring
		'You died — respawning build…',
		'Praise the sun (and green CI)…',
		'Git gud… eventually…',
		'Tarnished, await guidance…',
		// Minecraft
		'Steve mining for answers…',
		'Creeper? Aww man… rollback time…',
		'Crafting table of solutions…',
		// Pokémon
		'Gotta catch \'em all (edge cases)…',
		'It\'s super effective on bugs…',
		'Professor Oak evaluating your diff…',
		// Zelda
		'Hey! Listen! — still loading…',
		'It\'s dangerous to go alone, take CI…',
		'Triforce of lint, test, deploy…',
		// Mario
		'Thank you Mario, but our princess is in another branch…',
		'Here we go! — warp pipe to prod…',
		// Doom
		'Rip and tear through the backlog…',
		'Until it is done (the refactor)…',
		'Heavy metal soundtrack for your build…',
		// God of War
		'Boy… fetch the logs…',
		'Spartan rage on merge conflicts…',
		// Metal Gear
		'Snake? Snake?! Snaaaaaake…',
		'A codec call about your deploy…',
		'Stealth push detected…',
		// Resident Evil
		'It was a merge conflict all along…',
		'Jill sandwich break…',
		// Bioshock
		'Would you kindly wait…',
		'No gods or kings, only queues…',
		// GTA
		'Ah shit, here we go again (rebase)…',
		'Wasted — respawning patience…',
		// Red Dead
		'We just need more time, Arthur…',
		'See you in Saint Denis (staging)…',
		// Cyberpunk
		'Wake up, samurai, we have a build to burn…',
		'Bugs in the chrome, fixes incoming…',
		// Witcher
		'Toss a coin to your architect…',
		'Wind\'s howling… tests pending…',
		// Among Us
		'Architect is sus (trust anyway)…',
		'Emergency meeting on line 42…',
		// WoW / Diablo
		'You are not prepared… yet…',
		'Stay a while and listen (to logs)…',
		'Looting legendary patience…',
		// Starcraft
		'You must construct additional pylons…',
		'Zerg rush on the backlog…',
		// Back to the Future
		'1.21 gigawatts of compute…',
		'Where we\'re going we don\'t need main…',
		// Alien
		'In space no one hears your console.log…',
		'Game over man, game over… (not yet)…',
		// Blade Runner
		'All those moments will be lost in cache…',
		'More human than human-readable errors…',
		// Indiana Jones
		'It belongs in a museum, not in prod…',
		'Snakes. Why did it have to be snakes…',
		// James Bond
		'Shaken, not stirred — merge queue…',
		'Bond. James Bond. Branch. Main branch…',
		// Harry Potter
		'You\'re a wizard, Harry — a code wizard…',
		'Expecto patronum for flaky tests…',
		// Inception
		'We need to go deeper (into the stack)…',
		'Is this a dream or staging…',
		// Interstellar
		'Don\'t go gentle into that timeout…',
		'Murph, the logs came through…',
		// Avengers / Marvel
		'I am inevitable… the deploy is…',
		'Avengers… assemble the pipeline…',
		'I can do this all day (loop iteration)…',
		// Pixar / Disney
		'To infinity and your pull request…',
		'Just keep swimming through CI…',
		// Shrek
		'Get out of my swamp (branch)…',
		'Layers. Onions have layers. So do bugs…',
		// Toy Story
		'You\'ve got a friend in the architect…',
		'To the deploy window and beyond…',
		// Ghostbusters
		'Who you gonna call? Stack Trace…',
		'Don\'t cross the streams (branches)…',
		// Men in Black
		'The flash is ready, memory not…',
		// Tron
		'I fight for the user (story)…',
		// Pac-Man / arcade
		'Waka waka through the ticket queue…',
		'Insert coin for more patience…',
		// Tetris
		'Line clear! — one test suite down…',
		// Street Fighter
		'Hadouken! — force-push blocked…',
		// Mortal Kombat
		'Finish him! — finish the ticket…',
		// Sonic
		'Gotta go fast — but CI says wait…',
		// Final Fantasy
		'Listening to the 5-minute victory fanfare…',
		'Limit break on technical debt…',
		// Silent Hill
		'Fog rolling in over the codebase…',
		// Assassin's Creed
		'Nothing is true, everything is logged…',
		// Overwatch
		'Heroes never die, builds sometimes do…',
		'Hanzo main blamed the latency…',
		// League of Legends
		'GG EZ — said no architect ever…',
		// Hollow Knight / Hades
		'No cost too great for green CI…',
		'Zagreus escaping the retry loop…',
		// Stardew Valley
		'Planting seeds of future features…',
		// Animal Crossing
		'Tom Nook billing your patience…',
		// Kirby
		'Poyo! — universal loading language…',
		// Metroid
		'Samus is a woman, your bug is a feature…',
		// Castlevania
		'What is a man? A miserable pile of tickets…',
		// Monkey Island
		'Fight with insults, deploy with honor…',
		// Disco Elysium
		'The build has failed you spectacularly…',
		// Baldur's Gate
		'Roll for initiative on this merge…',
		// Sekiro
		'Hesitation is defeat — hesitation is also testing…',
		// Nier Automata
		'Glory to mankind — glory to green builds…',
		// Persona
		'You\'ll never see it coming (the hotfix)…',
		// Undertale
		'Stay determined…',
		// Cuphead
		'Knockout! — round 2: integration tests…',
		// Celeste
		'Climbing the mountain of node_modules…',
		// Hollow Knight again
		'Shaw! — bonfire checkpoint saved…',
		// Films misc
		'May the Force be with your PR…',
		'Houston, we have a linter…',
		'Here\'s looking at you, CI…',
		'Frankly my dear, I give a damn about tests…',
		'I\'m gonna make him an offer he can\'t refuse: review…',
		'You talking to me? — talking to the terminal…',
		'ET phone home — architect phones executors…',
		'Winter is coming — freeze the branch…',
		'Hold the door! — hold the deploy…',
		'Why so serious? — serious mode: prod…',
		'I see dead code…',
		'Show me the money — show me green CI…',
		'Life was like a box of stderr…',
		'Keep the change, ya filthy animal — keep the patch…',
		'Roads? Where we\'re going we need roads (to prod)…',
		'Hello, my name is Inigo — you killed my build…',
		'Nobody puts Baby in a corner case…',
		'Say hello to my little friend: breakpoint…',
		'I\'m the king of the world! — king of this sprint…',
		'Here\'s Johnny! — here\'s hotfix…',
		'They call it a Royale with CI…',
		'I am serious. And don\'t call me Shirley — call me architect…',
		// Action — en train de faire quelque chose (mêmes refs)
		'Heading to the door to find Sarah Connor…',
		'Sneaking through the repo like Solid Snake…',
		'Charging the BFG on the bug backlog…',
		'Riding to Helm\'s Deep with your pull request…',
		'Picking the lock on package.json…',
		'Scanning the codebase with Predator vision…',
		'Following the white rabbit into src/…',
		'Defusing the bomb on line 42…',
		'Looting the chest in components/…',
		'Casting fireball on technical debt…',
		'Driving to Saint Denis to fetch the logs…',
		'Warping through the pipe to prod…',
		'Hacking the Gibson until CI turns green…',
		'Tracking the xenomorph through node_modules…',
		'Asking Cortana for directions to main…',
		'Revving the Warthog through the sprint…',
		'Planting C4 on the flaky test…',
		'Extracting hostages from merge hell…',
		'Cracking the vault: .drox/agent-output…',
		'Sprinting to the chopper before timeout…',
		'Infiltrating the Death Star repository…',
		'Climbing the Citadel with your diff…',
		'Checking every locker in Silent Hill src/…',
		'Throwing a Pokéball at edge case #7…',
		'Crafting a diamond pick for this refactor…',
		'Dodging the boulder in src/app…',
		'Hotwiring the CI pipeline…',
		'Escorting the payload to staging…',
		'Interrogating package.json…',
		'Dusting for prints in git blame…',
		'Cutting the blue wire on the merge…',
		'Storming the beach of open tickets…',
		'Picking up the red phone in the Matrix…',
		'Carrying the ring toward Mount Doom (prod)…',
		'Kicking down the door to components/…',
		'Sprinting across Hyrule Field to verify…',
		'Spinning up the Batmobile for night deploy…',
		'Tracking footprints to the root cause…',
		'Wheeling the barrel to the compiler…',
		'Drawing the sword of code review…',
		'Loading silver bullets for werewolf bugs…',
		'Cocking the portal gun for the next section…',
		'Peeking around the corner at node_modules…',
		'Signaling the eagles — extraction soon…',
		'Whispering sweet nothings to the linter…',
		'Shouting Leeeroy at the backlog (then apologizing)…',
		'Grabbing the Master Sword of grep…',
		'Sliding under the door Mission Impossible style…',
		'Planting a tracker on the regression…',
		'Calling in air support on duplication…',
		'Wrangling the herd of open PRs…',
		'Herding parallel executors across the map…',
		'Opening the airlock — slowly, slowly…',
		'Pumping shotgun shells into scope creep…',
		'Following the scout to the bug nest…',
		'Unsheathing the katana for refactor hour…',
		'Staking the vampire commit at dawn…',
		'Spinning webs across the dependency graph…',
		'Boarding the Black Pearl of legacy code…',
		'Polishing the shield before prod…',
		'Answering the Bat-signal on line 128…',
		'Juggling three executors and a coffee…',
		'Tiptoeing past the sleeping dragon (prod)…',
		'Hammering nails into the plan board…',
		'Sanding the rough edges of the diff…',
		'Tuning the radio to executor frequency…',
		'Strapping in for another loop iteration…',
		'Spelunking the caves of src/lib…',
		'Panning for gold in the log stream…',
		'Knocking on heaven\'s door (staging)…',
		'Docking at the space station: workspace…',
		'Flipping the breaker on stalled tests…',
		'Sharpening pencils and assertions…',
		'Rolling initiative on the next tool…',
		'Casting Scan on the repository…',
		'Marking targets on the todo board…',
		'Sending the scout to package.json…',
		'Clearing rooms one folder at a time…',
		'Breaching with delegate_executor…',
		'Holding the bridge while tests run…',
		'Manning the turret on flaky CI…',
		'Revving the chainsaw — paperwork later…',
		'Flashing the badge at the linter…',
		'Picking the lock with a well-placed regex…',
		'Riding shotgun on your sprint…',
		'Digging through the trash for that import…',
		'Sweeping the corridor of warnings…',
		'Tossing a grappling hook toward main…',
		'Charging the spirit bomb of patience…',
		'Warming up the flux capacitor…',
		'Adjusting the sights on line 42…',
		'Cracking knuckles — architect mode…',
		'Rolling up sleeves for verify phase…',
		'Peeking at the loot table: agent-output…',
		'Mapping the dungeon floor plan…',
		'Lighting the fuse on the hotfix…',
		'Walking through the wardrobe into src/…',
		'Calling John McClane on the merge…',
		'Picking up the proton pack for ghost bugs…',
		'Spinning the top — are we in prod yet…',
		'Sneaking past the guards: lint rules…',
		'Sprinting to the safe room before OOM…',
		'Handing the baton to executor t2…',
		'Tossing a smoke bomb and git stash…',
		'Setting bear traps for regressions…',
		'Laying wire across the dependency path…',
		'Patching the hull breach in CI…',
		'Tacking the mainsail toward answer phase…',
		'Raiding the fridge while Ollama thinks…',
		'Pouring coffee into the architect…',
		'Dispatching a search party to src/components…',
		'Raising the anchor on this run…',
		'Feeding the meter on context window…',
		'Crossing the streams — carefully, carefully…',
		'Training the dragon on your codebase…',
		'Bribing the gatekeeper with green CI…',
		'Tunneling under the firewall of doubt…',
		'Climbing the ladder to the answer section…',
		'Wiring the detonator on tech debt…',
		'Flipping tables — then flipping them back…',
		'Conducting the orchestra of parallel jobs…',
		'Mixing the potion: plan + scope + brief…',
		'Forging the ring of deliverables…',
		'Chasing the train on the rooftop…',
		'Docking the dropship in verify bay…',
		'Calibrating the targeting computer…',
		'Feeding data to the sorting hat of lint…',
		'Opening the airlock to executor bay…',
		'Stacking sandbags against scope creep…',
		'Painting the target on the flaky test…',
		'Dragging the sled across the Mojave of tickets…',
		'Calling down lightning on duplicate code…',
		'Setting the table for the final answer…',
		'Wrapping the wound on broken build #7…',
		'Scouting ahead with workspace_map_read…',
		'Dragging Indiana through another temple of deps…',
		'Piloting the Normandy through the asteroid field of warnings…',
		'Stacking blocks in Tetris while the GPU cooks…',
		'Feeding the meter — still thinking…',
	];
	/** Aligné moteur `MAX_PARALLEL_EXECUTORS_CAP` + `drox.orchestration.maxParallelExecutors`. */
	D.const.MAX_PARALLEL_EXECUTORS_CAP = 100;
	D.const.DEFAULT_SESSION_TAB_TITLE = 'New chat';
	D.state.openTabs = [];
	D.state.activeTabId = null;
	D.state.currentSessionId = null;
	D.state.totalIn = 0;
	D.state.totalOut = 0;
	D.state.ctxTokens = 0;
	D.state.cycleStartedAt = null;
	D.state.cycleFrozenMs = null;
	D.state.cycleTimerId = null;
	D.const.PHASE_META = {
		reasoning: { label: 'Reasoning' },
		internal_reasoning: { label: 'Native reasoning' },
		analyzing: { label: 'Analyzing repository' },
		reading: { label: 'Reading' },
		clarifying: { label: 'Clarifying' },
		planning: { label: 'Planning' },
		'next-move': { label: 'Next move' },
		acting: { label: 'Acting' },
		testing: { label: 'Testing' },
		verifying: { label: 'Verifying' },
		answering: { label: 'Answering' },
		done: { label: 'Done' },
	};
	D.const.TODO_STATUS_META = {
		pending: { label: 'To do', cls: 'todo-pending' },
		in_progress: { label: 'In progress', cls: 'todo-progress' },
		completed: { label: 'Done', cls: 'todo-done' },
		cancelled: { label: 'Cancelled', cls: 'todo-cancel' },
	};
	D.const.SESSION_TAB_ANIM_MS = 220;
})(typeof globalThis !== "undefined" ? globalThis : window);
