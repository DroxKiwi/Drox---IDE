/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { diffDroxSdtcmText, focusDroxSdtcmMap } from '../../../common/sdtcm/droxSdtcmDiff.js';
import { droxSdtcmPathIgnored, parseDroxSdtcmIgnore } from '../../../common/sdtcm/droxSdtcmIgnore.js';
import { expandDroxSdtcmPhases, seedDroxSdtcmProbe, summarizeDroxSdtcmConsistency } from '../../../common/sdtcm/droxSdtcmConsistency.js';
import { parseDroxSdtcmDisplay, savedDroxSdtcmDisplay } from '../../../common/sdtcm/droxSdtcmDisplay.js';
import { emptyDroxSdtcmMap, IDroxSdtcmBrick, listDroxSdtcmRows, parseDroxSdtcmMap } from '../../../common/sdtcm/droxSdtcmMap.js';
import { acceptDroxSdtcmData, acceptDroxSdtcmTrace, buildDroxSdtcmDataTurn } from '../../../common/sdtcm/data/droxSdtcmData.js';
import { traceDroxSdtcmSelection } from '../../../common/sdtcm/data/droxSdtcmPath.js';
import { frameDroxSdtcmGraph } from '../../../common/sdtcm/droxSdtcmFrame.js';
import { buildDroxSdtcmGraph, IDroxSdtcmGraphNode } from '../../../common/sdtcm/droxSdtcmGraph.js';
import { mostLinkedDroxSdtcmFolderId } from '../../../common/sdtcm/placement/droxSdtcmFolderLinks.js';
import { emptyDroxSdtcmMoveHistory, redoDroxSdtcmMove, rememberDroxSdtcmMove, undoDroxSdtcmMove } from '../../../common/sdtcm/placement/droxSdtcmMoveHistory.js';
import { placeDroxSdtcmGraph } from '../../../common/sdtcm/placement/droxSdtcmPlacement.js';
import { droxSdtcmAddedFocus, keepDroxSdtcmFocusVisible, markDroxSdtcmDataPath, markDroxSdtcmFocus, markDroxSdtcmKept } from '../../../common/sdtcm/focus/droxSdtcmFocus.js';
import { droxSdtcmSystemPrompt } from '../../../common/sdtcm/droxSdtcmPrompt.js';
import { droxSdtcmPathInMapRoot, normalizeDroxSdtcmMapRoot, tallyDroxSdtcmFolders } from '../../../common/sdtcm/droxSdtcmMapRoot.js';
import { droxSdtcmFilesFrom, droxSdtcmPhaseAction, parseDroxSdtcmPause } from '../../../common/sdtcm/droxSdtcmPause.js';
import { acceptDroxSdtcmFile, acceptDroxSdtcmFolderTags, acceptDroxSdtcmLinks, acceptDroxSdtcmTags, buildDroxSdtcmTagTurn, buildDroxSdtcmTurn, completeDroxSdtcmLinks, droxSdtcmFreshBricks, droxSdtcmNewTag, ensureDroxSdtcmNewTag, formatDroxSdtcmMapIndex, IDroxSdtcmTag, parseDroxSdtcmTags, pickDroxSdtcmAnswer, readDroxSdtcmFileDraft, readDroxSdtcmRead } from '../../../common/sdtcm/droxSdtcmRole.js';

suite('Drox SDTCM map', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

	test('pause keeps the file in progress and skips earlier phases', () => {
		const pause = parseDroxSdtcmPause(JSON.stringify({
			mode: 'build',
			phase: 'data',
			file: 'src/b.ts',
			phases: ['build', 'data', 'trace'],
		}));
		assert.ok(pause);
		assert.strictEqual(droxSdtcmPhaseAction(pause, 'build'), 'skip');
		assert.strictEqual(droxSdtcmPhaseAction(pause, 'data'), 'from');
		assert.strictEqual(droxSdtcmPhaseAction(pause, 'trace'), 'all');
		assert.deepStrictEqual(droxSdtcmFilesFrom(['src/a.ts', 'src/b.ts', 'src/c.ts'], 'src/b.ts'), ['src/b.ts', 'src/c.ts']);
		assert.deepStrictEqual(droxSdtcmFilesFrom(['src/a.ts'], 'missing.ts'), ['src/a.ts']);
		assert.strictEqual(parseDroxSdtcmPause('{"mode":"build"}'), undefined);
		assert.strictEqual(droxSdtcmPhaseAction(undefined, 'build'), 'all');
	});

	test('diff keeps the shared edges and reports the middle', () => {
		const hunk = diffDroxSdtcmText('a\nb\nc\n', 'a\nB\nc\n');
		assert.ok(hunk);
		assert.strictEqual(hunk.startLine, 2);
		assert.strictEqual(hunk.currentExcerpt, 'B');
		assert.strictEqual(hunk.baselineExcerpt, 'b');
	});

	test('focus ignores an untouched file and a quote that still matches', () => {
		const map = {
			...emptyDroxSdtcmMap(),
			entry: { file: 'main.py', line: 1, quote: 'def main():', name: 'main' },
			bricks: [{
				id: 'b1',
				file: 'other.py',
				line: 1,
				quote: 'x = 1',
				name: 'x',
				kind: 'value' as const,
				form: 'declare' as const,
				files: [],
				links: [],
			}],
		};
		const focus = focusDroxSdtcmMap(
			map,
			{ 'main.py': 'def main():\n    pass\n', 'other.py': 'x = 1\n' },
			{ 'main.py': 'def main():\n    return 1\n', 'other.py': 'x = 1\n' },
		);
		assert.strictEqual(focus.length, 1);
		assert.strictEqual(focus[0].path, 'main.py');
		assert.strictEqual(focus[0].stale.length, 0);
	});

	test('a moved quote is stale and a missing file drops its bricks', () => {
		const map = {
			...emptyDroxSdtcmMap(),
			entry: { file: 'main.py', line: 1, quote: 'def main():', name: 'main' },
			bricks: [{
				id: 'b1',
				file: 'gone.py',
				line: 2,
				quote: 'token = create()',
				name: 'token',
				kind: 'operation' as const,
				form: 'apply' as const,
				files: ['gone.py'],
				links: [],
			}],
		};
		const focus = focusDroxSdtcmMap(
			map,
			{ 'main.py': 'def main():\n', 'gone.py': 'a\ntoken = create()\n' },
			{ 'main.py': '\ndef main():\n', 'gone.py': undefined },
		);
		const main = focus.find(item => item.path === 'main.py');
		const gone = focus.find(item => item.path === 'gone.py');
		assert.strictEqual(main?.stale[0]?.reason, 'moved');
		assert.strictEqual(main?.stale[0]?.foundLine, 2);
		assert.strictEqual(gone?.stale[0]?.reason, 'gone');
	});

	test('braces in the preamble do not hide the JSON object', () => {
		const raw = 'globals.css\n.a { color: red; }\n{"file":"src/app/globals.css","items":[{"kind":"value","form":"declare","name":"ink","line":1,"quote":"--ink: red;","links":[]}]}';
		const draft = readDroxSdtcmFileDraft(raw, 'src/app/globals.css');
		assert.strictEqual(draft.ok, true);
		const read = readDroxSdtcmRead('note { not json }\n{"read":"src/app/page.tsx"}');
		assert.strictEqual(read?.ok, true);
		if (read?.ok) {
			assert.strictEqual(read.path, 'src/app/page.tsx');
		}
		const visible = '{"file":"a.ts","items":[{"kind":"value","form":"declare","name":"n","line":1,"quote":"const n = 1","links":[]}]}';
		assert.strictEqual(pickDroxSdtcmAnswer(visible, '{"read":"other.ts"}'), visible);
		assert.ok(pickDroxSdtcmAnswer('no object here', visible).includes('"file"'));
	});

	test('a valid file is accepted and a bad quote is returned to the model', () => {
		const raw = '{"file":"main.py","items":[{"kind":"operation","form":"declare","name":"main","line":1,"quote":"def main():","links":[]}]}';
		const draft = readDroxSdtcmFileDraft(raw, 'main.py');
		assert.strictEqual(draft.ok, true);
		if (!draft.ok) {
			return;
		}
		const previous = {
			...emptyDroxSdtcmMap(),
			bricks: [{
				id: 'b9',
				file: 'other.py',
				line: 1,
				quote: 'x = 1',
				name: 'x',
				kind: 'value' as const,
				form: 'declare' as const,
				files: [],
				links: [],
			}],
		};
		const accepted = acceptDroxSdtcmFile(previous, 'main.py', draft.items, 'def main():\n', new Set(['main.py', 'other.py']));
		assert.strictEqual(accepted.ok, true);
		if (!accepted.ok) {
			return;
		}
		assert.strictEqual(accepted.map.bricks.length, 2);
		assert.strictEqual(listDroxSdtcmRows(accepted.map).find(row => row.file === 'main.py')?.role, 'operation · declare');
		const shifted = readDroxSdtcmFileDraft(raw.replace('"line":1', '"line":4'), 'main.py');
		assert.strictEqual(shifted.ok, true);
		if (!shifted.ok) {
			return;
		}
		const shiftedMap = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'main.py', shifted.items, '\ndef main():\n', new Set(['main.py']));
		assert.strictEqual(shiftedMap.ok, true);
		if (!shiftedMap.ok) {
			return;
		}
		assert.strictEqual(shiftedMap.map.bricks[0].line, 2);
		const missing = readDroxSdtcmFileDraft(raw.replace('"quote":"def main():"', '"quote":"missing"'), 'main.py');
		assert.strictEqual(missing.ok, true);
		if (!missing.ok) {
			return;
		}
		const refused = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'main.py', missing.items, 'def main():\n', new Set(['main.py']));
		assert.strictEqual(refused.ok, false);
	});

	test('a name missing from the line is refused and a relative link is kept', () => {
		const named = readDroxSdtcmFileDraft('{"file":"src/app/page.tsx","items":[{"kind":"operation","form":"declare","name":"Page","line":1,"quote":"export default function Page() {","links":["../components/HeroSection","react"]}]}', 'src/app/page.tsx');
		assert.strictEqual(named.ok, true);
		if (!named.ok) {
			return;
		}
		const known = new Set(['src/app/page.tsx', 'src/components/HeroSection.tsx']);
		const accepted = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'src/app/page.tsx', named.items, 'export default function Page() {\n', known);
		assert.strictEqual(accepted.ok, true);
		if (!accepted.ok) {
			return;
		}
		assert.deepStrictEqual(accepted.map.bricks[0].files, []);
		const linked = readDroxSdtcmFileDraft('{"file":"src/app/page.tsx","items":[{"kind":"source","form":"declare","name":"HeroSection","line":1,"quote":"import HeroSection from \\"../components/HeroSection\\"","links":["../components/HeroSection"]}]}', 'src/app/page.tsx');
		assert.strictEqual(linked.ok, true);
		if (!linked.ok) {
			return;
		}
		const keptLink = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'src/app/page.tsx', linked.items, 'import HeroSection from "../components/HeroSection"\n', known);
		assert.strictEqual(keptLink.ok, true);
		if (keptLink.ok) {
			assert.deepStrictEqual(keptLink.map.bricks[0].files, ['src/components/HeroSection.tsx']);
		}
		assert.strictEqual(accepted.map.bricks[0].name, 'Page');
		const renamed = readDroxSdtcmFileDraft('{"file":"src/lib/engine-docs.ts","items":[{"kind":"type","form":"declare","name":"getEngineDocMeta","line":1,"quote":"export interface EngineDocMeta {","links":[]}]}', 'src/lib/engine-docs.ts');
		assert.strictEqual(renamed.ok, true);
		if (!renamed.ok) {
			return;
		}
		const fixed = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'src/lib/engine-docs.ts', renamed.items, 'export interface EngineDocMeta {\n', new Set(['src/lib/engine-docs.ts']));
		assert.strictEqual(fixed.ok, true);
		if (!fixed.ok) {
			return;
		}
		assert.strictEqual(fixed.map.bricks[0].name, 'EngineDocMeta');
		const imported = readDroxSdtcmFileDraft('{"file":"src/a.ts","items":[{"kind":"source","form":"declare","name":"node:fs","line":1,"quote":"import fs from \\"node:fs\\";","links":[]},{"kind":"source","form":"declare","name":"react","line":2,"quote":"import { useState, useEffect as effect } from \\"react\\";","links":[]}]}', 'src/a.ts');
		assert.strictEqual(imported.ok, true);
		if (!imported.ok) {
			return;
		}
		const bindings = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'src/a.ts', imported.items, 'import fs from "node:fs";\nimport { useState, useEffect as effect } from "react";\n', new Set(['src/a.ts']));
		assert.strictEqual(bindings.ok, false);
		if (bindings.ok) {
			return;
		}
		assert.ok(bindings.errors.some(error => error.includes('useState')));
		const kept = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'src/a.ts', [imported.items[0]], 'import fs from "node:fs";\n', new Set(['src/a.ts']));
		assert.strictEqual(kept.ok, true);
		if (kept.ok) {
			assert.strictEqual(kept.map.bricks[0].name, 'fs');
		}
		const pathName = readDroxSdtcmFileDraft('{"file":"next-env.d.ts","items":[{"kind":"source","form":"declare","name":"./.next/types/routes.d.ts","line":1,"quote":"/// <reference path=\\"./.next/types/routes.d.ts\\" />","links":[]}]}', 'next-env.d.ts');
		assert.strictEqual(pathName.ok, true);
		if (!pathName.ok) {
			return;
		}
		const refused = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'next-env.d.ts', pathName.items, '/// <reference path="./.next/types/routes.d.ts" />\n', new Set(['next-env.d.ts']));
		assert.strictEqual(refused.ok, false);
		const turn = buildDroxSdtcmTurn({
			mode: 'build',
			path: 'main.py',
			files: ['main.py'],
			text: 'def main():\n',
			reads: [],
			focus: [],
		});
		assert.ok(turn.includes('1|def main():'));
		assert.ok(!turn.includes('links lists only'));
		const buildPrompt = droxSdtcmSystemPrompt('build');
		const dataPrompt = droxSdtcmSystemPrompt('data');
		assert.ok(buildPrompt.includes('MODE build'));
		assert.ok(!buildPrompt.includes('MODE data'));
		assert.ok(dataPrompt.includes('MODE data'));
		assert.ok(!dataPrompt.includes('MODE build'));
		const dataTurn = buildDroxSdtcmDataTurn({
			path: 'src/b.ts',
			text: 'const next = user\n',
			map: {
				...emptyDroxSdtcmMap(),
				data: [{
					id: 'd1', name: 'user', birth: 'introduce', file: 'src/a.ts', brick: 'b1', line: 1, quote: 'const user = 1', parents: [],
					steps: [{ brick: 'b1', name: 'user', line: 1, quote: 'const user = 1', span: 1 }],
				}],
			},
			reads: [],
		});
		assert.ok(dataTurn.includes('"id":"d1"'));
		assert.ok(dataTurn.includes('"file":"src/a.ts"'));
		assert.ok(!dataTurn.includes('const user = 1'));
		assert.ok(!dataTurn.includes('A parameter'));
	});

	test('a syntax error lists the field and does not accept the file', () => {
		const draft = readDroxSdtcmFileDraft('{"file":"main.py","items":[{"kind":"operation","form":"declare","name":"main","line":"1","quote":"def main():","links":[]}]}', 'main.py');
		assert.strictEqual(draft.ok, false);
		if (draft.ok) {
			return;
		}
		assert.ok(draft.errors.some(error => error.includes('items[0].line')));
	});

	test('an empty file is refused and a read request is a tool call', () => {
		const empty = readDroxSdtcmFileDraft('{"file":"main.py","items":[]}', 'main.py');
		assert.strictEqual(empty.ok, false);
		if (empty.ok) {
			return;
		}
		assert.ok(empty.errors.some(error => error.includes('at least one')));
		const read = readDroxSdtcmRead('{"read":"src/lib.ts"}');
		assert.strictEqual(read?.ok, true);
		if (!read?.ok) {
			return;
		}
		assert.strictEqual(read.path, 'src/lib.ts');
	});

	test('a file link becomes a brick link only inside that file', () => {
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [{
				id: 'b1',
				file: 'a/main.py',
				line: 1,
				quote: 'bot()',
				name: 'main',
				kind: 'operation' as const,
				form: 'declare' as const,
				files: ['b/util.py'],
				links: [],
			}, {
				id: 'b2',
				file: 'b/util.py',
				line: 4,
				quote: 'Bot()',
				name: 'bot',
				kind: 'type' as const,
				form: 'apply' as const,
				files: [],
				links: [],
			}],
		};
		const accepted = acceptDroxSdtcmLinks(map, [{ from: 'b1', to: 'b2' }]);
		assert.strictEqual(accepted.ok, true);
		if (!accepted.ok) {
			return;
		}
		assert.deepStrictEqual(accepted.map.bricks[0].links, ['b2']);
		const missed = acceptDroxSdtcmLinks(map, [], 'a/main.py');
		assert.strictEqual(missed.ok, false);
		const filled = completeDroxSdtcmLinks(map, 'a/main.py');
		assert.deepStrictEqual(filled.bricks[0].links, ['b2']);
		const unnamed = completeDroxSdtcmLinks({
			...map,
			bricks: [{ ...map.bricks[0], quote: 'def main():' }, map.bricks[1]],
		}, 'a/main.py');
		assert.deepStrictEqual(unnamed.bricks[0].links, []);
		const outside = acceptDroxSdtcmLinks(map, [{ from: 'b2', to: 'b1' }]);
		assert.strictEqual(outside.ok, false);
		const sameName = acceptDroxSdtcmLinks({
			...map,
			bricks: [
				{ ...map.bricks[0], name: 'save', files: [] },
				{ ...map.bricks[1], name: 'save', form: 'declare' },
			],
		}, [{ from: 'b1', to: 'b2' }]);
		assert.strictEqual(sameName.ok, true);
		const imports = acceptDroxSdtcmLinks({
			...map,
			bricks: [
				{ ...map.bricks[0], name: 'Link', kind: 'source', files: [] },
				{ ...map.bricks[1], name: 'Link', kind: 'source' },
			],
		}, [{ from: 'b1', to: 'b2' }]);
		assert.strictEqual(imports.ok, false);
	});

	test('a bare name ignores a segment anywhere and a path starts at the root', () => {
		const patterns = parseDroxSdtcmIgnore('# note\n\nnode_modules\n.env.*\nsrc/generated\n');
		assert.strictEqual(droxSdtcmPathIgnored('pkg/node_modules/left.py', patterns), true);
		assert.strictEqual(droxSdtcmPathIgnored('.env.local', patterns), true);
		assert.strictEqual(droxSdtcmPathIgnored('src/generated/out.py', patterns), true);
		assert.strictEqual(droxSdtcmPathIgnored('src/app.py', patterns), false);
		assert.strictEqual(droxSdtcmPathIgnored('other/src/generated/out.py', patterns), false);
	});

	test('folders contain files and files contain bricks', () => {
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [{
				id: 'b1',
				file: 'a/main.py',
				line: 1,
				quote: 'def main():',
				name: 'main',
				kind: 'operation' as const,
				form: 'declare' as const,
				files: ['b/util.py'],
				links: ['b2'],
			}, {
				id: 'b2',
				file: 'b/util.py',
				line: 4,
				quote: 'Bot()',
				name: 'bot',
				kind: 'type' as const,
				form: 'apply' as const,
				files: [],
				links: [],
			}],
			data: [
				born('d1', 'main', 'a/main.py', 'b1', []),
				born('d2', 'bot', 'b/util.py', 'b2', ['d1']),
			],
		};
		const graph = buildDroxSdtcmGraph(map);
		assert.strictEqual(graph.nodes.filter(node => node.kind === 'folder').length, 2);
		assert.strictEqual(graph.nodes.filter(node => node.kind === 'file').length, 2);
		assert.strictEqual(graph.nodes.filter(node => node.kind === 'brick').length, 2);
		assert.strictEqual(graph.edges.length, 2);
		assert.ok(graph.edges.some(edge => edge.from === 'b1' && edge.to === 'b2'));
		assert.ok(graph.edges.some(edge => edge.from === 'd1' && edge.to === 'd2'));
		const file = graph.nodes.find(node => node.id === 'file:a/main.py');
		const brick = graph.nodes.find(node => node.id === 'b1');
		assert.ok(file && brick);
		assert.ok(brick.x > file.x && brick.y > file.y);
		assert.ok(brick.x + brick.w < file.x + file.w);
		const skeleton = buildDroxSdtcmGraph(emptyDroxSdtcmMap(), ['src/main.py', 'vendor/skip.py']);
		assert.strictEqual(skeleton.nodes.filter(node => node.kind === 'file').length, 2);
		assert.strictEqual(skeleton.edges.length, 0);
	});

	test('a folder sits inside the folder that contains it', () => {
		const brick = (id: string, file: string) => ({
			id, file, line: 1, quote: 'x', name: id, kind: 'value' as const, form: 'declare' as const, files: [], links: id === 'b1' ? ['b2'] : [],
		});
		const graph = buildDroxSdtcmGraph({
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'src/app/page.tsx'),
				brick('b2', 'src/components/landing/Hero.tsx'),
			],
		});
		const src = graph.nodes.find(node => node.id === 'folder:src');
		const app = graph.nodes.find(node => node.id === 'folder:src/app');
		const components = graph.nodes.find(node => node.id === 'folder:src/components');
		const landing = graph.nodes.find(node => node.id === 'folder:src/components/landing');
		const hero = graph.nodes.find(node => node.id === 'b2');
		const heroFile = graph.nodes.find(node => node.id === 'file:src/components/landing/Hero.tsx');
		assert.ok(src && app && components && landing && hero && heroFile);
		assert.ok(contains(src, app) && contains(src, components) && contains(components, landing));
		assert.ok(contains(landing, heroFile) && contains(heroFile, hero));
		assert.ok(graph.edges.some(edge => edge.from === 'b1' && edge.to === 'b2'));
		const placed = placeDroxSdtcmGraph(graph);
		const placedSrc = placed.nodes.find(node => node.id === 'folder:src');
		const placedLanding = placed.nodes.find(node => node.id === 'folder:src/components/landing');
		assert.ok(placedSrc && placedLanding && contains(placedSrc, placedLanding));
		const row = buildDroxSdtcmGraph({
			...emptyDroxSdtcmMap(),
			bricks: ['a', 'b', 'c', 'd'].map(name => brick(name, `src/${name}.ts`)),
		});
		const files = row.nodes.filter(node => node.kind === 'file');
		assert.strictEqual(files.length, 4);
		assert.ok(files.some((file, index) => files.some((other, otherIndex) => otherIndex !== index && Math.abs(file.y - other.y) < 2)));
		const folder = row.nodes.find(node => node.id === 'folder:src');
		assert.ok(folder);
		assert.ok(folder.w / folder.h < 4 && folder.h / folder.w < 4);
	});

	test('free view lays folders in a row', () => {
		const brick = (id: string, file: string, links: string[]) => ({
			id,
			file,
			line: 1,
			quote: 'x',
			name: 'x',
			kind: 'value' as const,
			form: 'declare' as const,
			files: [],
			links,
		});
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'a/a.py', ['b2', 'b3', 'b4', 'b5']),
				brick('b2', 'b/b.py', []),
				brick('b3', 'b/b.py', []),
				brick('b4', 'b/b.py', []),
				brick('b5', 'c/c.py', []),
			],
			data: [
				born('d1', 'a', 'a/a.py', 'b1', []),
				born('d2', 'b', 'b/b.py', 'b2', ['d1']),
				born('d3', 'c', 'b/b.py', 'b3', ['d1']),
				born('d4', 'd', 'b/b.py', 'b4', ['d1']),
				born('d5', 'e', 'c/c.py', 'b5', ['d1']),
			],
		};
		const built = buildDroxSdtcmGraph(map);
		const free = placeDroxSdtcmGraph(built);
		const left = free.nodes.find(node => node.id === 'folder:a');
		const right = free.nodes.find(node => node.id === 'folder:b');
		assert.ok(left && right);
		assert.ok(right.x >= left.x + left.w);
		assert.strictEqual(mostLinkedDroxSdtcmFolderId(built), 'folder:a');
	});

	test('a consistency run starts from the same map and names what diverges', () => {
		const birth = born('d1', 'main', 'src/a.ts', 'b1', []);
		const live = {
			...emptyDroxSdtcmMap(),
			bricks: [brick('b1', 'src/a.ts', 1, 'def main():', 'main', [])],
			data: [{ ...birth, steps: [...birth.steps, { ...birth.steps[0], line: 4 }] }],
		};
		const seeded = seedDroxSdtcmProbe(live, new Set(['link', 'trace']));
		assert.deepStrictEqual(seeded.bricks[0].links, []);
		assert.strictEqual(seeded.data[0].steps.length, 1);
		assert.strictEqual(seedDroxSdtcmProbe(live, new Set(['build'])).bricks.length, 0);
		const again = {
			...live,
			bricks: [{ ...live.bricks[0], links: ['b2'] }, brick('b2', 'src/b.ts', 4, 'def bot():', 'bot', [])],
		};
		const summary = summarizeDroxSdtcmConsistency([live, again], ['link']);
		assert.ok(summary.includes('Turns: 2.'));
		assert.ok(summary.includes('turns 2:'));
		assert.ok(summary.includes('src/b.ts'));
	});

	test('an earlier phase keeps the phases that follow from it', () => {
		assert.deepStrictEqual(expandDroxSdtcmPhases(['tag']), ['tag']);
		assert.deepStrictEqual(expandDroxSdtcmPhases(['data']), ['data', 'trace']);
		assert.deepStrictEqual(expandDroxSdtcmPhases(['build']), ['build', 'data', 'trace', 'link', 'tag']);
		assert.deepStrictEqual(expandDroxSdtcmPhases(['link', 'tag']), ['link', 'tag']);
		assert.deepStrictEqual(expandDroxSdtcmPhases([]), []);
	});

	test('a sidebar choice is kept for the folder and an unknown tag is dropped', () => {
		const saved = parseDroxSdtcmDisplay('{"move":false,"links":false,"kinds":["type","nope"],"forms":[],"focus":["folder:src"],"visibleTags":["front","gone"]}');
		assert.ok(saved);
		if (!saved) {
			return;
		}
		assert.strictEqual(saved.move, false);
		assert.deepStrictEqual(saved.kinds, ['type']);
		assert.deepStrictEqual(saved.forms, []);
		const kept = savedDroxSdtcmDisplay(saved, ['front', 'back']);
		assert.deepStrictEqual(kept.visibleTags, ['front']);
		assert.strictEqual(parseDroxSdtcmDisplay('{'), undefined);
	});

	test('a tag sticks to a brick only when the user declared it', () => {
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [brick('b1', 'src/a.ts', 1, 'def main():', 'main', [])],
			data: [born('d1', 'main', 'src/a.ts', 'b1', [])],
		};
		const front = tag('front', 'brick');
		const back = tag('back', 'brick');
		const page = tag('page', 'file');
		const value = tag('value', 'data');
		const area = tag('area', 'folder');
		const accepted = acceptDroxSdtcmTags(map, 'src/a.ts', [
			{ scope: 'brick', id: 'b1', tag: 'front', reason: 'shown' },
			{ scope: 'brick', id: 'b1', tag: 'back', reason: 'stored' },
		], [front, back]);
		assert.strictEqual(accepted.ok, true);
		if (accepted.ok) {
			assert.deepStrictEqual(accepted.map.bricks[0].tags, [{ name: 'front', reason: 'shown' }, { name: 'back', reason: 'stored' }]);
		}
		assert.strictEqual(acceptDroxSdtcmTags(map, 'src/a.ts', [{ scope: 'brick', id: 'b1', tag: 'back', reason: 'stored' }], [front]).ok, false);
		const wrongScope = acceptDroxSdtcmTags(map, 'src/a.ts', [{ scope: 'brick', id: 'b1', tag: 'page', reason: 'shown' }], [page]);
		assert.strictEqual(wrongScope.ok, false);
		if (!wrongScope.ok) {
			assert.ok(wrongScope.errors[0].includes('You wrote scope brick.'));
			assert.ok(wrongScope.errors[0].includes('{"scope":"file","tag":"page","reason":"…"}. Do not include id.'));
		}
		const withId = acceptDroxSdtcmTags(map, 'src/a.ts', [{ scope: 'file', id: 'b1', tag: 'page', reason: 'shown' }], [page]);
		assert.strictEqual(withId.ok, false);
		if (!withId.ok) {
			assert.ok(withId.errors[0].includes('Drop the id.'));
		}
		assert.strictEqual(acceptDroxSdtcmTags(map, 'src/a.ts', [{ scope: 'brick', id: 'b1', tag: 'front', reason: 'x'.repeat(120) }], [front]).ok, true);
		assert.strictEqual(acceptDroxSdtcmTags(map, 'src/a.ts', [{ scope: 'brick', id: 'b1', tag: 'front', reason: 'x'.repeat(121) }], [front]).ok, false);
		assert.strictEqual(acceptDroxSdtcmTags(map, 'src/a.ts', [{ scope: 'data', id: 'd1', tag: 'front', reason: 'shown' }], [front]).ok, false);
		const placed = acceptDroxSdtcmTags(map, 'src/a.ts', [
			{ scope: 'file', id: '', tag: 'page', reason: 'client page' },
			{ scope: 'data', id: 'd1', tag: 'value', reason: 'born here' },
		], [page, value]);
		assert.strictEqual(placed.ok, true);
		if (placed.ok) {
			const graph = buildDroxSdtcmGraph(placed.map);
			assert.deepStrictEqual(graph.nodes.find(node => node.id === 'file:src/a.ts')?.marks, [{ scope: 'file', on: 'src/a.ts', name: 'page', reason: 'client page' }]);
			assert.deepStrictEqual(graph.nodes.find(node => node.id === 'd1')?.marks, [{ name: 'value', reason: 'born here' }]);
		}
		const folder = acceptDroxSdtcmFolderTags(map, 'src', [{ scope: 'folder', id: '', tag: 'area', reason: 'pages' }], [area]);
		assert.strictEqual(folder.ok, true);
		if (folder.ok) {
			const graph = buildDroxSdtcmGraph(folder.map);
			assert.deepStrictEqual(graph.nodes.find(node => node.id === 'folder:src')?.marks, [{ scope: 'folder', on: 'src', name: 'area', reason: 'pages' }]);
		}
		const turn = buildDroxSdtcmTagTurn({ map, file: 'src/a.ts', text: 'def main():\n', tags: [front] });
		assert.ok(turn.includes('1|def main():'));
		assert.ok(!turn.includes('READ '));
		const parsed = parseDroxSdtcmTags('[{"name":"front","description":"what the user sees","color":"#c4a574"}]');
		assert.deepStrictEqual(parsed.map(item => item.name), ['front']);
		const ensured = ensureDroxSdtcmNewTag(parsed);
		assert.strictEqual(ensured[0].name, 'new');
		assert.strictEqual(ensured[0].scope, 'brick');
		assert.strictEqual(ensured[0].locked, true);
		assert.ok(ensured[0].description.includes('NEW'));
		assert.deepStrictEqual(ensureDroxSdtcmNewTag([droxSdtcmNewTag(false)]).map(tag => tag.enabled), [false]);
		const fresh = droxSdtcmFreshBricks(
			[{ file: 'src/a.ts', name: 'main', kind: 'operation', form: 'declare' }],
			[
				{ id: 'b9', file: 'src/a.ts', name: 'main', kind: 'operation', form: 'declare' },
				{ id: 'b10', file: 'src/a.ts', name: 'extra', kind: 'operation', form: 'declare' },
			],
		);
		assert.deepStrictEqual([...fresh], ['b10']);
		const marked = buildDroxSdtcmTagTurn({ map, file: 'src/a.ts', text: 'def main():\n', tags: [droxSdtcmNewTag()], fresh: ['b1'] });
		assert.ok(marked.includes('NEW b1'));
		assert.strictEqual(parsed[0].scope, 'brick');
		const hidden = buildDroxSdtcmGraph({
			...map,
			bricks: [{ ...map.bricks[0], tags: [{ name: 'front', reason: 'shown' }] }],
		}, [], {
			kinds: new Set(['type', 'operation', 'value', 'source']),
			forms: new Set(['declare', 'apply']),
			links: true,
			tags: new Set<string>(),
			tagColors: new Map([['front', '#c4a574']]),
		});
		assert.strictEqual(hidden.nodes.filter(node => node.kind === 'brick').length, 0);
		const seeded = seedDroxSdtcmProbe({
			...map,
			bricks: [{ ...map.bricks[0], tags: [{ name: 'front', reason: 'shown' }] }],
			placed: [{ scope: 'file', on: 'src/a.ts', name: 'page', reason: 'client page' }],
		}, new Set(['tag']));
		assert.deepStrictEqual(seeded.bricks[0].tags, []);
		assert.deepStrictEqual(seeded.data[0].tags, []);
		assert.deepStrictEqual(seeded.placed, []);
		const legacy = parseDroxSdtcmMap(JSON.stringify({
			version: 1,
			entry: null,
			bricks: [{ ...map.bricks[0], tags: ['front'] }],
			data: [],
		}));
		assert.deepStrictEqual(legacy.bricks[0].tags, [{ name: 'front', reason: '' }]);
	});

	test('ctrl+z puts a folder back and ctrl+y moves it again', () => {
		let history = rememberDroxSdtcmMove(emptyDroxSdtcmMoveHistory(), {
			id: 'folder:src',
			before: { x: 0, y: 0 },
			after: { x: 40, y: 12 },
		});
		const undone = undoDroxSdtcmMove(history);
		assert.ok(undone);
		assert.deepStrictEqual(undone.move.before, { x: 0, y: 0 });
		const redone = redoDroxSdtcmMove(undone.history);
		assert.ok(redone);
		assert.deepStrictEqual(redone.move.after, { x: 40, y: 12 });
		history = rememberDroxSdtcmMove(undone.history, {
			id: 'folder:src',
			before: { x: 0, y: 0 },
			after: { x: 8, y: 8 },
		});
		assert.strictEqual(history.redo.length, 0);
	});

	test('focus keeps the grabbed folder and highlights only the linked data', () => {
		const brick = (id: string, file: string, links: string[]) => ({
			id,
			file,
			line: 1,
			quote: 'x',
			name: 'x',
			kind: 'value' as const,
			form: 'declare' as const,
			files: [],
			links,
		});
		const graph = buildDroxSdtcmGraph({
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'a/a.py', ['b2']),
				brick('b2', 'b/b.py', []),
				brick('b3', 'b/other.py', []),
				brick('b4', 'c/c.py', []),
			],
			data: [
				born('d1', 'a', 'a/a.py', 'b1', []),
				born('d2', 'b', 'b/b.py', 'b2', ['d1']),
			],
		});
		const marks = markDroxSdtcmFocus(graph, new Set(['folder:a']));
		assert.ok(marks);
		assert.strictEqual(marks.nodes.get('folder:a'), 'primary');
		assert.strictEqual(marks.nodes.get('folder:b'), 'related');
		assert.strictEqual(marks.nodes.get('d2'), 'involved');
		assert.strictEqual(marks.nodes.get('file:b/b.py'), 'involved');
		assert.strictEqual(marks.nodes.get('b3'), 'dim');
		assert.strictEqual(marks.nodes.get('folder:c'), 'dim');
		assert.strictEqual(marks.edges.get('d1->d2'), 'linked');
		assert.strictEqual(markDroxSdtcmFocus(graph, new Set()), undefined);
		const selected = markDroxSdtcmDataPath(graph, { nodes: new Set(['d1', 'folder:a']), edges: new Set() });
		const lifted = keepDroxSdtcmFocusVisible(selected, new Set(['b4', 'd2']));
		assert.strictEqual(selected.nodes.get('b4'), 'dim');
		assert.strictEqual(lifted.nodes.get('b4'), 'primary');
		assert.strictEqual(lifted.nodes.get('d2'), 'primary');
		assert.strictEqual(lifted.nodes.get('folder:c'), 'dim');
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'a/a.py', ['b2']),
				brick('b2', 'b/b.py', []),
				brick('b4', 'c/c.py', []),
			],
			data: [
				born('d1', 'a', 'a/a.py', 'b1', []),
				born('d2', 'b', 'b/b.py', 'b2', ['d1']),
			],
		};
		const several = markDroxSdtcmKept(graph, map, new Set(['d1', 'b4']));
		assert.ok(several);
		assert.notStrictEqual(several.nodes.get('d1'), 'dim');
		assert.notStrictEqual(several.nodes.get('b4'), 'dim');
		assert.strictEqual(several.nodes.get('b3'), 'dim');
	});

	test('a map written before data still opens', () => {
		const map = parseDroxSdtcmMap('{"version":1,"entry":null,"bricks":[]}');
		assert.deepStrictEqual(map.data, []);
	});

	test('a birth is kept, a duplicate is refused, and a transform needs a parent', () => {
		const text = 'const user = new User()\nconst account = user\nimport Link from "next/link"\n';
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'src/app.ts', 1, 'const user = new User()', 'user', []),
				brick('b2', 'src/app.ts', 2, 'const account = user', 'account', []),
				{ ...brick('b3', 'src/app.ts', 3, 'import Link from "next/link"', 'Link', []), kind: 'source' as const },
			],
		};
		const born = acceptDroxSdtcmData(map, 'src/app.ts', [
			{ name: 'someone', birth: 'introduce', brick: 'b1', line: 9, quote: 'nope', parents: [] },
			{ name: 'Link', birth: 'introduce', brick: 'b3', line: 3, quote: 'import Link from "next/link"', parents: [] },
			{ name: 'account', birth: 'introduce', brick: 'b2', line: 2, quote: 'const account = user', parents: [] },
		], text);
		assert.strictEqual(born.ok, true);
		if (!born.ok) {
			return;
		}
		assert.deepStrictEqual(born.map.data.map(item => item.name), ['user', 'account']);
		assert.strictEqual(born.map.data[0].line, 1);
		const duplicate = acceptDroxSdtcmData(map, 'src/app.ts', [
			{ name: 'user', birth: 'introduce', brick: 'b1', line: 1, quote: 'const user = new User()', parents: [] },
			{ name: 'user', birth: 'introduce', brick: 'b1', line: 1, quote: 'const user = new User()', parents: [] },
			{ name: 'account', birth: 'introduce', brick: 'b2', line: 2, quote: 'const account = user', parents: [] },
		], text);
		assert.strictEqual(duplicate.ok, false);
		const orphan = acceptDroxSdtcmData(map, 'src/app.ts', [{
			name: 'account', birth: 'transform', brick: 'b2', line: 2, quote: 'const account = user', parents: [],
		}], text);
		assert.strictEqual(orphan.ok, false);
		if (orphan.ok) {
			return;
		}
		assert.ok(orphan.errors.some(error => error.includes('user')));
	});

	test('a trace follows an apply of the same name, and a loop is one repeat step', () => {
		const app = 'const user = new User()\nuser()\nfor (const user of rows) {\n';
		const other = 'save(user)\naccount()\n';
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'src/app.ts', 1, 'const user = new User()', 'user', []),
				{ ...brick('b2', 'src/app.ts', 2, 'user()', 'user', []), form: 'apply' as const, files: ['src/other.ts'] },
				{ ...brick('b5', 'src/app.ts', 3, 'for (const user of rows) {', 'user', []), form: 'apply' as const, files: ['src/other.ts'] },
				{ ...brick('b3', 'src/other.ts', 1, 'save(user)', 'user', []), form: 'apply' as const },
				{ ...brick('b4', 'src/other.ts', 2, 'account()', 'account', []), form: 'apply' as const },
			],
		};
		const born = acceptDroxSdtcmData(map, 'src/app.ts', [{
			name: 'user', birth: 'introduce', brick: 'b1', line: 1, quote: 'const user = new User()', parents: [],
		}], app);
		assert.strictEqual(born.ok, true);
		if (!born.ok) {
			return;
		}
		const texts = new Map([['src/app.ts', app], ['src/other.ts', other]]);
		const traced = acceptDroxSdtcmTrace(born.map, 'src/app.ts', [{
			data: 'd1', brick: 'b4', name: 'account', line: 2, quote: 'account()', span: 1,
		}, {
			data: 'd1', brick: 'b2', name: 'row', line: 2, quote: 'user()', span: 'repeat',
		}, {
			data: 'd1', brick: 'b5', name: 'user', line: 3, quote: 'for (const user of rows) {', span: 1,
		}, {
			data: 'd1', brick: 'b3', name: 'user', line: 1, quote: 'save(user)', span: 1,
		}], texts);
		assert.strictEqual(traced.ok, true);
		if (!traced.ok) {
			return;
		}
		assert.deepStrictEqual(traced.map.data[0].steps.map(step => step.name), ['user', 'user', 'user', 'user']);
		assert.deepStrictEqual(traced.map.data[0].steps.map(step => step.span), [1, 1, 'repeat', 1]);
		assert.deepStrictEqual(traced.map.data[0].steps.map(step => step.brick), ['b1', 'b2', 'b5', 'b3']);
		const graph = buildDroxSdtcmGraph(traced.map);
		const frame = graph.nodes.find(node => node.id === 'b1');
		const data = graph.nodes.find(node => node.id === 'd1');
		const file = graph.nodes.find(node => node.id === 'file:src/app.ts');
		assert.ok(frame && data && file);
		assert.strictEqual(data.kind, 'data');
		assert.ok(data.x >= frame.x && data.y >= frame.y);
		assert.ok(data.x + data.w <= frame.x + frame.w);
		assert.ok(data.y + data.h <= frame.y + frame.h);
	});

	test('a data click keeps the whole path, from the start through a middle point', () => {
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'src/a.ts', 1, 'user', 'user', []),
				brick('b2', 'src/b.ts', 4, 'left', 'left', []),
				brick('b3', 'src/c.ts', 8, 'end', 'end', []),
			],
			data: [{
				id: 'd1', name: 'user', birth: 'introduce' as const, file: 'src/a.ts', brick: 'b1', line: 1, quote: 'user', parents: [],
				steps: [{ brick: 'b1', name: 'user', line: 1, quote: 'user', span: 1 as const }],
			}, {
				id: 'd2', name: 'left', birth: 'transform' as const, file: 'src/b.ts', brick: 'b2', line: 4, quote: 'left', parents: ['d1'],
				steps: [{ brick: 'b2', name: 'left', line: 4, quote: 'left', span: 1 as const }],
			}, {
				id: 'd3', name: 'end', birth: 'transform' as const, file: 'src/c.ts', brick: 'b3', line: 8, quote: 'end', parents: ['d2'],
				steps: [{ brick: 'b3', name: 'end', line: 8, quote: 'end', span: 1 as const }],
			}],
		};
		const path = traceDroxSdtcmSelection(map, 'data', 'd2');
		assert.ok(path);
		assert.ok(path.nodes.has('d1') && path.nodes.has('d2') && path.nodes.has('d3'));
		assert.ok(path.edges.has('d1->d2') && path.edges.has('d2->d3'));
		const hero = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'src/Hero.tsx', 1, 'export function Hero()', 'Hero', []),
				brick('b2', 'src/page.tsx', 4, '<Hero />', 'Home', ['b1', 'b9']),
				brick('b9', 'src/other.tsx', 2, 'Other', 'Other', []),
			],
			data: [{
				id: 'd1', name: 'Hero', birth: 'introduce' as const, file: 'src/Hero.tsx', brick: 'b1', line: 1, quote: 'export function Hero()', parents: [],
				steps: [{ brick: 'b1', name: 'Hero', line: 1, quote: 'export function Hero()', span: 1 as const }],
			}],
		};
		const used = traceDroxSdtcmSelection(hero, 'brick', 'b1');
		assert.ok(used);
		assert.ok(used.edges.has('b2->b1'));
		assert.ok(used.nodes.has('b1') && used.nodes.has('b2'));
		assert.strictEqual(used.nodes.has('b9'), false);
		const alone = traceDroxSdtcmSelection({
			...emptyDroxSdtcmMap(),
			bricks: [brick('b1', 'src/a.ts', 1, 'alone', 'alone', [])],
		}, 'brick', 'b1');
		assert.ok(alone);
		assert.strictEqual(alone.edges.size, 0);
		assert.ok(alone.nodes.has('b1'));
	});

	test('a new folder, file, brick, and data are kept in focus', () => {
		const before = {
			...emptyDroxSdtcmMap(),
			bricks: [brick('b1', 'src/a.ts', 1, 'old', 'Old', [])],
			data: [born('d1', 'Old', 'src/a.ts', 'b1', [])],
		};
		const after = {
			...before,
			bricks: [
				brick('b9', 'src/a.ts', 1, 'old', 'Old', []),
				brick('b2', 'src/ui/Button.tsx', 4, 'export function Button', 'Button', []),
			],
			data: [
				born('d9', 'Old', 'src/a.ts', 'b9', []),
				born('d2', 'Button', 'src/ui/Button.tsx', 'b2', []),
			],
		};
		assert.deepStrictEqual(
			droxSdtcmAddedFocus(before, after, ['src/a.ts'], ['src/a.ts', 'src/ui/Button.tsx']),
			['folder:src/ui', 'file:src/ui/Button.tsx', 'b2', 'd2'],
		);
	});

	test('an align index lists the other files and skips the file being rebuilt', () => {
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'src/app/page.tsx', 1, 'export default function Home()', 'Home', []),
				{ ...brick('b42', 'src/components/landing/SiteFooter.tsx', 1, 'export function SiteFooter()', 'SiteFooter', []), kind: 'operation' as const },
			],
			data: [
				born('d1', 'SiteFooter', 'src/components/landing/SiteFooter.tsx', 'b42', []),
				born('d2', 'Home', 'src/app/page.tsx', 'b1', []),
			],
		};
		const index = formatDroxSdtcmMapIndex(map, 'src/app/page.tsx');
		assert.ok(index.startsWith('MAP\n'));
		assert.ok(index.includes('"id":"b42"'));
		assert.ok(index.includes('"name":"SiteFooter"'));
		assert.ok(index.includes('"id":"d1"'));
		assert.ok(!index.includes('b1'));
		assert.ok(!index.includes('d2'));
		assert.ok(!index.includes('export function'));
		const turn = buildDroxSdtcmTurn({
			mode: 'align',
			path: 'src/app/page.tsx',
			files: ['src/app/page.tsx'],
			text: 'export default function Home() {}\n',
			reads: [],
			focus: [],
			mapIndex: index,
		});
		assert.ok(turn.includes('Already built, outside this file.'));
		assert.ok(turn.includes('MODE realign'));
	});

	test('the frame keeps the large folders and the files under the camera', () => {
		const folder = box('folder:src', 'folder', 0, 0, 4000, 3000);
		const near = box('file:src/a.ts', 'file', 20, 40, 168, 46);
		const far = box('file:src/z.ts', 'file', 50000, 40, 168, 46);
		const graph = { nodes: [folder, near, far], edges: [{ from: 'file:src/a.ts', to: 'file:src/z.ts' }] };
		const wide = frameDroxSdtcmGraph(graph, { panX: 0, panY: 0, zoom: 0.01, viewWidth: 800, viewHeight: 600 });
		assert.deepStrictEqual(wide.nodes.map(node => node.id), ['folder:src']);
		assert.strictEqual(wide.edges.length, 0);
		const close = frameDroxSdtcmGraph(graph, { panX: -10, panY: -10, zoom: 1, viewWidth: 400, viewHeight: 400 });
		assert.ok(close.nodes.some(node => node.id === 'file:src/a.ts'));
		assert.ok(!close.nodes.some(node => node.id === 'file:src/z.ts'));
		const many = Array.from({ length: 600 }, (_value, index) => box(`folder:f${index}`, 'folder', index * 10, 0, 200, 200));
		const budget = frameDroxSdtcmGraph({ nodes: many, edges: [] }, { panX: 0, panY: 0, zoom: 1, viewWidth: 8000, viewHeight: 800 });
		assert.ok(budget.nodes.length <= 480);
	});

	test('map root stays inside the folder', () => {
		assert.strictEqual(normalizeDroxSdtcmMapRoot(''), '');
		assert.strictEqual(normalizeDroxSdtcmMapRoot('  ./src/app/ '), 'src/app');
		assert.strictEqual(normalizeDroxSdtcmMapRoot('src\\app\\'), 'src/app');
		assert.strictEqual(normalizeDroxSdtcmMapRoot('..'), undefined);
		assert.strictEqual(normalizeDroxSdtcmMapRoot('src/../app'), undefined);
		assert.strictEqual(normalizeDroxSdtcmMapRoot('C:/repo'), undefined);
		const files = Array.from({ length: 121 }, (_value, index) => `src/f${index}.ts`);
		const turn = buildDroxSdtcmTurn({ mode: 'build', path: files[120]!, files, text: 'x', reads: [], focus: [] });
		assert.ok(turn.includes('src/f120.ts'));
		const folders = tallyDroxSdtcmFolders(['src/app/a.ts', 'src/app/b.ts', 'src/c.ts', 'top.ts']);
		assert.deepStrictEqual(folders, [
			{ path: '', files: 4 },
			{ path: 'src', files: 3 },
			{ path: 'src/app', files: 2 },
		]);
		assert.strictEqual(droxSdtcmPathInMapRoot('src/app/a.ts', 'src/app'), true);
		assert.strictEqual(droxSdtcmPathInMapRoot('src', 'src/app'), false);
		assert.strictEqual(droxSdtcmPathInMapRoot('src/app', ''), true);
		assert.strictEqual(droxSdtcmPathInMapRoot('docs/a.md', ['src', 'docs']), true);
		assert.strictEqual(droxSdtcmPathInMapRoot('lib/a.ts', ['src', 'docs']), false);
		assert.strictEqual(droxSdtcmPathInMapRoot('src/a.ts', []), true);
	});
});

function box(id: string, kind: IDroxSdtcmGraphNode['kind'], x: number, y: number, w: number, h: number): IDroxSdtcmGraphNode {
	return { id, label: id, kind, x, y, w, h, lines: [] };
}

function contains(outer: { x: number; y: number; w: number; h: number }, inner: { x: number; y: number; w: number; h: number }): boolean {
	return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

function tag(name: string, scope: IDroxSdtcmTag['scope']): IDroxSdtcmTag {
	return { name, description: 'where it belongs', color: '#c4a574', scope };
}

function brick(id: string, file: string, line: number, quote: string, name: string, links: string[]): IDroxSdtcmBrick {
	return { id, file, line, quote, name, kind: 'value', form: 'declare', files: [], links };
}

function born(id: string, name: string, file: string, brickId: string, parents: string[]) {
	return {
		id, name, birth: 'introduce' as const, file, brick: brickId, line: 1, quote: 'x', parents,
		steps: [{ brick: brickId, name, line: 1, quote: 'x', span: 1 as const }],
	};
}
