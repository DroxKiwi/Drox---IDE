/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import assert from 'assert';
import { ensureNoDisposablesAreLeakedInTestSuite } from '../../../../../../base/test/common/utils.js';
import { diffDroxSdtcmText, focusDroxSdtcmMap } from '../../../common/sdtcm/droxSdtcmDiff.js';
import { droxSdtcmPathIgnored, parseDroxSdtcmIgnore } from '../../../common/sdtcm/droxSdtcmIgnore.js';
import { emptyDroxSdtcmMap, IDroxSdtcmBrick, listDroxSdtcmRows, parseDroxSdtcmMap } from '../../../common/sdtcm/droxSdtcmMap.js';
import { acceptDroxSdtcmData, acceptDroxSdtcmTrace } from '../../../common/sdtcm/data/droxSdtcmData.js';
import { buildDroxSdtcmGraph } from '../../../common/sdtcm/droxSdtcmGraph.js';
import { mostLinkedDroxSdtcmFolderId } from '../../../common/sdtcm/placement/droxSdtcmFolderLinks.js';
import { placeDroxSdtcmGraph, stepDroxSdtcmLinkPull } from '../../../common/sdtcm/placement/droxSdtcmPlacement.js';
import { markDroxSdtcmFocus } from '../../../common/sdtcm/focus/droxSdtcmFocus.js';
import { acceptDroxSdtcmFile, acceptDroxSdtcmLinks, buildDroxSdtcmTurn, completeDroxSdtcmLinks, readDroxSdtcmFileDraft, readDroxSdtcmRead } from '../../../common/sdtcm/droxSdtcmRole.js';

suite('Drox SDTCM map', () => {
	ensureNoDisposablesAreLeakedInTestSuite();

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
		assert.deepStrictEqual(accepted.map.bricks[0].files, ['src/components/HeroSection.tsx']);
		const wrong = readDroxSdtcmFileDraft('{"file":"src/lib/engine-docs.ts","items":[{"kind":"operation","form":"declare","name":"getEngineDocMeta","line":1,"quote":"export interface EngineDocMeta {","links":[]}]}', 'src/lib/engine-docs.ts');
		assert.strictEqual(wrong.ok, true);
		if (!wrong.ok) {
			return;
		}
		const refused = acceptDroxSdtcmFile(emptyDroxSdtcmMap(), 'src/lib/engine-docs.ts', wrong.items, 'export interface EngineDocMeta {\n', new Set(['src/lib/engine-docs.ts']));
		assert.strictEqual(refused.ok, false);
		if (refused.ok) {
			return;
		}
		assert.ok(refused.errors.some(error => error.includes('getEngineDocMeta')));
		const turn = buildDroxSdtcmTurn({
			mode: 'build',
			path: 'main.py',
			files: ['main.py'],
			text: 'def main():\n',
			reads: [],
			focus: [],
		});
		assert.ok(turn.includes('1|def main():'));
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
				quote: 'def main():',
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
		const outside = acceptDroxSdtcmLinks(map, [{ from: 'b2', to: 'b1' }]);
		assert.strictEqual(outside.ok, false);
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
		};
		const graph = buildDroxSdtcmGraph(map);
		assert.strictEqual(graph.nodes.filter(node => node.kind === 'folder').length, 2);
		assert.strictEqual(graph.nodes.filter(node => node.kind === 'file').length, 2);
		assert.strictEqual(graph.nodes.filter(node => node.kind === 'brick').length, 2);
		assert.strictEqual(graph.edges.length, 1);
		assert.strictEqual(graph.edges[0].from, 'b1');
		assert.strictEqual(graph.edges[0].to, 'b2');
		const file = graph.nodes.find(node => node.id === 'file:a/main.py');
		const brick = graph.nodes.find(node => node.id === 'b1');
		assert.ok(file && brick);
		assert.ok(brick.x > file.x && brick.y > file.y);
		assert.ok(brick.x + brick.w < file.x + file.w);
		const skeleton = buildDroxSdtcmGraph(emptyDroxSdtcmMap(), ['src/main.py', 'vendor/skip.py']);
		assert.strictEqual(skeleton.nodes.filter(node => node.kind === 'file').length, 2);
		assert.strictEqual(skeleton.edges.length, 0);
	});

	test('free view lays folders in a row and weight view pulls the busiest folder to the middle', () => {
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
		};
		const built = buildDroxSdtcmGraph(map);
		const free = placeDroxSdtcmGraph(built, 'free');
		const left = free.nodes.find(node => node.id === 'folder:a');
		const right = free.nodes.find(node => node.id === 'folder:b');
		assert.ok(left && right);
		assert.ok(right.x >= left.x + left.w);
		const weight = placeDroxSdtcmGraph(built, 'weight');
		const center = (id: string) => {
			const node = weight.nodes.find(item => item.id === id);
			assert.ok(node);
			return { x: node.x + node.w / 2, y: node.y + node.h / 2 };
		};
		const hub = center('folder:a');
		const near = center('folder:b');
		const far = center('folder:c');
		const distance = (from: { x: number; y: number }, to: { x: number; y: number }) => Math.hypot(to.x - from.x, to.y - from.y);
		assert.ok(distance(hub, near) < distance(hub, far));
		assert.strictEqual(mostLinkedDroxSdtcmFolderId(built), 'folder:a');
		const apart = new Map<string, { x: number; y: number }>([['folder:a', { x: 0, y: 0 }], ['folder:b', { x: 5000, y: 0 }]]);
		assert.strictEqual(stepDroxSdtcmLinkPull(apart, built, 1, 'folder:a'), true);
		assert.strictEqual(apart.get('folder:a')?.x, 0);
		assert.ok((apart.get('folder:b')?.x ?? 5000) < 5000);
		const close = new Map<string, { x: number; y: number }>([['folder:a', { x: 0, y: 0 }], ['folder:b', { x: 40, y: 0 }]]);
		assert.strictEqual(stepDroxSdtcmLinkPull(close, built, 0, undefined), true);
		assert.ok((close.get('folder:b')?.x ?? 0) > 40);
	});

	test('focus keeps the grabbed folder and highlights only the linked bricks', () => {
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
		});
		const marks = markDroxSdtcmFocus(graph, new Set(['folder:a']));
		assert.ok(marks);
		assert.strictEqual(marks.nodes.get('folder:a'), 'primary');
		assert.strictEqual(marks.nodes.get('folder:b'), 'related');
		assert.strictEqual(marks.nodes.get('b2'), 'involved');
		assert.strictEqual(marks.nodes.get('file:b/b.py'), 'involved');
		assert.strictEqual(marks.nodes.get('b3'), 'dim');
		assert.strictEqual(marks.nodes.get('folder:c'), 'dim');
		assert.strictEqual(marks.edges.get('b1->b2'), 'linked');
		assert.strictEqual(markDroxSdtcmFocus(graph, new Set()), undefined);
	});

	test('a map written before data still opens', () => {
		const map = parseDroxSdtcmMap('{"version":1,"entry":null,"bricks":[]}');
		assert.deepStrictEqual(map.data, []);
	});

	test('a birth is kept, a duplicate is refused, and a transform needs a parent', () => {
		const text = 'const user = new User()\nconst account = user\n';
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'src/app.ts', 1, 'const user = new User()', 'user', []),
				brick('b2', 'src/app.ts', 2, 'const account = user', 'account', []),
			],
		};
		const born = acceptDroxSdtcmData(map, 'src/app.ts', [{
			name: 'user', birth: 'introduce', brick: 'b1', line: 1, quote: 'const user = new User()', parents: [],
		}], text);
		assert.strictEqual(born.ok, true);
		if (!born.ok) {
			return;
		}
		assert.strictEqual(born.map.data[0].id, 'd1');
		assert.strictEqual(born.map.data[0].steps[0].span, 1);
		const duplicate = acceptDroxSdtcmData(map, 'src/app.ts', [
			{ name: 'user', birth: 'introduce', brick: 'b1', line: 1, quote: 'const user = new User()', parents: [] },
			{ name: 'user', birth: 'introduce', brick: 'b1', line: 1, quote: 'const user = new User()', parents: [] },
		], text);
		assert.strictEqual(duplicate.ok, false);
		const orphan = acceptDroxSdtcmData(map, 'src/app.ts', [{
			name: 'account', birth: 'transform', brick: 'b2', line: 2, quote: 'const account = user', parents: [],
		}], text);
		assert.strictEqual(orphan.ok, false);
	});

	test('a trace stays in the file or follows a brick link, and a loop is one repeat step', () => {
		const app = 'const user = new User()\nfor (const row of rows) {\n';
		const other = 'save(account)\n';
		const map = {
			...emptyDroxSdtcmMap(),
			bricks: [
				brick('b1', 'src/app.ts', 1, 'const user = new User()', 'user', []),
				brick('b2', 'src/app.ts', 2, 'for (const row of rows) {', 'row', ['b3']),
				brick('b3', 'src/other.ts', 1, 'save(account)', 'account', []),
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
		const blocked = acceptDroxSdtcmTrace(born.map, 'src/app.ts', [{
			data: 'd1', brick: 'b3', name: 'account', line: 1, quote: 'save(account)', span: 1,
		}], texts);
		assert.strictEqual(blocked.ok, false);
		const traced = acceptDroxSdtcmTrace(born.map, 'src/app.ts', [{
			data: 'd1', brick: 'b2', name: 'row', line: 2, quote: 'for (const row of rows) {', span: 'repeat',
		}, {
			data: 'd1', brick: 'b3', name: 'account', line: 1, quote: 'save(account)', span: 1,
		}], texts);
		assert.strictEqual(traced.ok, true);
		if (!traced.ok) {
			return;
		}
		assert.deepStrictEqual(traced.map.data[0].steps.map(step => step.span), [1, 'repeat', 1]);
		const graph = buildDroxSdtcmGraph(traced.map);
		const frame = graph.nodes.find(node => node.id === 'b1');
		const data = graph.nodes.find(node => node.id === 'd1');
		const file = graph.nodes.find(node => node.id === 'file:src/app.ts');
		assert.ok(frame && data && file);
		assert.strictEqual(data.kind, 'data');
		assert.ok(data.x >= frame.x && data.y >= frame.y);
		assert.ok(data.x + data.w <= frame.x + frame.w);
		assert.ok(data.y + data.h <= frame.y + frame.h);
		const loose = acceptDroxSdtcmData(map, 'src/app.ts', [{
			name: 'rows', birth: 'introduce', brick: null, line: 2, quote: 'for (const row of rows) {', parents: [],
		}], app);
		assert.strictEqual(loose.ok, false);
		const outside = acceptDroxSdtcmData(born.map, 'src/app.ts', [{
			name: 'note', birth: 'introduce', brick: null, line: 3, quote: 'note', parents: [],
		}], `${app}note\n`);
		assert.strictEqual(outside.ok, true);
		if (!outside.ok) {
			return;
		}
		const placed = buildDroxSdtcmGraph(outside.map);
		const fileData = placed.nodes.find(node => node.id === 'd2');
		const fileBox = placed.nodes.find(node => node.id === 'file:src/app.ts');
		const brickBox = placed.nodes.find(node => node.id === 'b1');
		assert.ok(fileData && fileBox && brickBox);
		assert.ok(fileData.y + fileData.h <= fileBox.y + fileBox.h);
		assert.ok(fileData.y + fileData.h <= brickBox.y || fileData.y >= brickBox.y + brickBox.h);
	});
});

function brick(id: string, file: string, line: number, quote: string, name: string, links: string[]): IDroxSdtcmBrick {
	return { id, file, line, quote, name, kind: 'value', form: 'declare', files: [], links };
}
