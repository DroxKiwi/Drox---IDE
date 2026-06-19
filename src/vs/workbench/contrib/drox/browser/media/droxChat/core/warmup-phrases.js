/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

(function (D) {
	D.const.WARMUP_PHRASES = [
		// Dev classics — doing things
		'Installing patience from the registry…',
		'Rebooting the machine that definitely works…',
		'Scouring the backups for motivation…',
		'Paging Stack Overflow on your behalf…',
		'Running git blame on literally everything…',
		'Delegating patience to downstream executors…',
		'Warming the GPU for Ollama…',
		'Narrating “almost done” while not being done…',
		// Gears of War
		'Loading Mad World into the war room…',
		'Revving the chainsaw bayonet on this diff…',
		'Deploying grub-killer mode on compile errors…',
		'Holding the line Marcus Fenix style…',
		// Halo
		'Finishing the fight on this build…',
		'Asking Cortana to calculate the odds…',
		'Spinning the ring world back into alignment…',
		'Grabbing a weapon and a merge strategy…',
		'Getting Spartan 117 to stamp this commit…',
		// The Sims
		'Spinning the plumbob above the architect…',
		'Refilling the coffee need bar…',
		'Negotiating in Simlish with the linter…',
		'Building a room for your patience…',
		'Typing Rosebud into the cheat console…',
		// Jurassic Park
		'Letting life find a way through the bugs…',
		'Outsmarting the clever girl on deploy…',
		'Spending no expense on this refactor…',
		'Outrunning the CI chasing us…',
		'Cracking the magic word on the airlock…',
		// Terminator
		'Promising to be back with test results…',
		'Dragging you toward the ship if you want to ship…',
		'Melting flaky tests with a thumbs up…',
		'Postponing Judgment Day to next sprint…',
		'Merging fate whether it likes it or not…',
		// Fallout
		'Patrolling the Mojave of node_modules…',
		'Broadcasting “please stand by” to the squad…',
		'Unlocking the Vault-Tec loading screen…',
		'Dispatching another settlement patch…',
		// Star Wars
		'Waving hand: these aren’t the bugs you want…',
		'Disturbing the lack of tests in this repo…',
		'Doing or doing not — skipping try/catch…',
		'Channeling the Force into this build…',
		'Jumping to hyperspace away from prod…',
		// Lord of the Rings
		'Blocking the push to Mount Doom (prod)…',
		'Standing on the bridge yelling “you shall not pass”…',
		'Polishing the precious green CI badge…',
		'Arriving precisely when the wizard intended…',
		// Matrix
		'Bending the spoon into a stack trace…',
		'Swallowing the red pill deploy…',
		'Downloading kung fu into this module…',
		'Following the white rabbit into README…',
		// Portal
		'Baking a real cake while the build runs…',
		'Proving we’re still alive and compiling…',
		'Thinking with portals through this refactor…',
		'Letting GLaDOS review your code…',
		// Half-Life
		'Waking you up, Mr. Developer…',
		'Waiting for Gordon to push…',
		'Placing the right dev in the wrong pipeline…',
		// Mass Effect
		'Routing you to the relay (main branch)…',
		'Denying Cerberus access to this fix…',
		'Delaying the Reapers so we can ship…',
		// Skyrim
		'Waking you — you’re finally awake…',
		'Taking an arrow to the knee of this PR…',
		'Shouting Fus Ro Dah at force-push…',
		'Making Lydia carry your dependencies…',
		// Dark Souls / Elden Ring
		'Respawning the build after you died…',
		'Praising the sun and the green CI…',
		'Git gud-ing in real time…',
		'Guiding the Tarnished through verify…',
		// Minecraft
		'Mining Steve-style for answers…',
		'Rolling back from creeper damage…',
		'Crafting solutions at the table…',
		// Pokémon
		'Catching edge cases in the tall grass…',
		'Landing super effective hits on bugs…',
		'Handing the diff to Professor Oak…',
		// Zelda
		'Shouting “Hey! Listen!” at the loader…',
		'Handing you CI before you go alone…',
		'Assembling the Triforce of lint, test, deploy…',
		// Mario
		'Warping to the princess in another branch…',
		'Jumping into the pipe toward prod…',
		// Doom
		'Ripping and tearing through the backlog…',
		'Finishing the refactor until it is done…',
		'Blasting heavy metal at your build…',
		// God of War
		'Sending Boy to fetch the logs…',
		'Unleashing Spartan rage on merge conflicts…',
		// Metal Gear
		'Calling Snake? Snake?! on channel…',
		'Opening a codec about your deploy…',
		'Going stealth on this push…',
		// Resident Evil
		'Revealing it was a merge conflict all along…',
		'Taking a Jill sandwich break…',
		// Bioshock
		'Kindly asking you to wait…',
		'Queuing with no gods or kings…',
		// GTA
		'Ah shit — here we go again (rebase)…',
		'Respawning patience after wasted…',
		// Red Dead
		'Buying more time, Arthur…',
		'Riding to Saint Denis (staging)…',
		// Cyberpunk
		'Waking up, samurai — burning a build…',
		'Scraping bugs out of the chrome…',
		// Witcher
		'Tossing a coin to your architect…',
		'Listening to the howling wind of pending tests…',
		// Among Us
		'Voting architect sus (trusting anyway)…',
		'Calling emergency meeting on line 42…',
		// WoW / Diablo
		'Preparing you whether you’re ready or not…',
		'Making you stay a while and listen to logs…',
		'Looting legendary patience…',
		// Starcraft
		'Constructing additional pylons…',
		'Zerg rushing the backlog…',
		// Back to the Future
		'Generating 1.21 gigawatts of compute…',
		'Driving where we don’t need main…',
		// Alien
		'Screaming into the void of console.log…',
		'Ordering “game over” to stand down (not yet)…',
		// Blade Runner
		'Watching moments dissolve in cache…',
		'Printing human-readable errors…',
		// Indiana Jones
		'Shipping artifacts to the museum, not prod…',
		'Swatting snakes in the dependency pit…',
		// James Bond
		'Shaking the merge queue, not stirring…',
		'Introducing Bond. James Bond. Branch. Main…',
		// Harry Potter
		'Sorting you into code wizard house…',
		'Casting Expecto Patronum on flaky tests…',
		// Inception
		'Drilling deeper into the stack…',
		'Spinning the top — dream or staging…',
		// Interstellar
		'Refusing to go gentle into that timeout…',
		'Relaying Murph’s logs…',
		// Avengers / Marvel
		'Snapping the deploy into inevitability…',
		'Assembling the pipeline…',
		'Doing this all day (loop iteration)…',
		// Pixar / Disney
		'Flying to infinity and your pull request…',
		'Swimming through CI just keep swimming…',
		// Shrek
		'Evicting you from my swamp (branch)…',
		'Peeling onion layers off the bugs…',
		// Toy Story
		'Being the friend in the architect…',
		'Riding to the deploy window and beyond…',
		// Ghostbusters
		'Calling Stack Trace instead of Ghostbusters…',
		'Preventing crossed streams (branches)…',
		// Men in Black
		'Flashing the memory while patience loads…',
		// Tron
		'Fighting for the user story…',
		// Pac-Man / arcade
		'Waka waka-ing through the ticket queue…',
		'Inserting coin for more patience…',
		// Tetris
		'Clearing a line on the test suite…',
		// Street Fighter
		'Blocking the force-push with Hadouken…',
		// Mortal Kombat
		'Finishing the ticket…',
		// Sonic
		'Gotta go fast — CI says wait anyway…',
		// Final Fantasy
		'Letting the five-minute victory fanfare play…',
		'Breaking the limit on technical debt…',
		// Silent Hill
		'Rolling fog over the codebase…',
		// Assassin's Creed
		'Logging everything — nothing is true…',
		// Overwatch
		'Resurrecting heroes while the build dies…',
		'Blaming latency like a Hanzo main…',
		// League of Legends
		'Typing GG EZ (lying)…',
		// Hollow Knight / Hades
		'Paying any cost for green CI…',
		'Escaping Zagreus’s retry loop…',
		// Stardew Valley
		'Planting seeds of future features…',
		// Animal Crossing
		'Billing your patience via Tom Nook…',
		// Kirby
		'Poyo-ing in universal loading language…',
		// Metroid
		'Revealing Samus while mislabeling the bug…',
		// Castlevania
		'Stacking tickets into a miserable pile…',
		// Monkey Island
		'Insult-fighting then deploying with honor…',
		// Disco Elysium
		'Failing you spectacularly on purpose (almost)…',
		// Baldur's Gate
		'Rolling initiative on this merge…',
		// Sekiro
		'Refusing hesitation — testing anyway…',
		// Nier Automata
		'Glory-ing mankind and green builds…',
		// Persona
		'Sneaking up the hotfix you’ll never see…',
		// Undertale
		'Staying determined…',
		// Cuphead
		'Knocking out round 1 — round 2: integration…',
		// Celeste
		'Climbing the mountain of node_modules…',
		// Hollow Knight again
		'Shaw-ing at the bonfire checkpoint…',
		// Films misc — actions
		'Channeling the Force into your PR…',
		'Radioing Houston about the linter…',
		'Looking at you, CI…',
		'Giving a damn about tests, frankly…',
		'Making an offer he can’t refuse: review…',
		'Talking to the terminal — you talking to me…',
		'Phoning home — architect phones executors…',
		'Dragging dragonglass across the branch…',
		'Holding the door on deploy…',
		'Cranking serious mode up to prod…',
		'Spotting dead code in the crowd…',
		'Showing you the money — green CI…',
		'Opening the box of stderr…',
		'Keeping the patch, ya filthy animal…',
		'Paving roads to prod…',
		'Preparing to kill the build, Inigo…',
		'Refusing to put Baby in a corner case…',
		'Saying hello to breakpoint, my little friend…',
		'Crowning yourself king of this sprint…',
		'Axing through the door with hotfix…',
		'Ordering a Royale with CI…',
		'Insisting you call me architect, not Shirley…',
		// Action squad — absurd ops in progress
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
		'Breaching the next station on the rail…',
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
})(globalThis.DroxChat);
