/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { URI } from '../../../../base/common/uri.js';
import { IFileService } from '../../../../platform/files/common/files.js';

export interface IDroxReferencePayload {
	readonly uri: string;
}

export interface IResolvedDroxReference {
	readonly uri: string;
	readonly rel: string;
	readonly abs: string;
	readonly kind: 'file' | 'directory';
	readonly inWorkspace: boolean;
}

/** Référence fichier affichée dans le fil utilisateur (webview). */
export interface IDroxUserMessageReferenceWire {
	readonly uri: string;
	readonly rel: string;
	readonly abs: string;
	readonly kind: 'file' | 'directory';
	/** Libellé court pour retrouver `@label` dans le texte sérialisé. */
	readonly label: string;
}

/** Même forme courte que le webview (`parent/fichier` ou `fichier`). */
export function referenceDisplayLabel(rel: string): string {
	const norm = rel.replace(/^\.\//, '').replaceAll('\\', '/');
	const parts = norm.split('/').filter(Boolean);
	if (parts.length === 0) {
		return rel;
	}
	if (parts.length === 1) {
		return parts[0];
	}
	return `${parts[parts.length - 2]}/${parts[parts.length - 1]}`;
}

export function toUserMessageReferenceWire(r: IResolvedDroxReference): IDroxUserMessageReferenceWire {
	return {
		uri: r.uri,
		rel: r.rel,
		abs: r.abs,
		kind: r.kind,
		label: referenceDisplayLabel(r.rel),
	};
}

/**
 * Resolves file/folder references (Explorer URIs) to absolute paths for the prompt block.
 */
export async function resolveDroxReferences(
	fileService: IFileService,
	workspaceRoot: string,
	refs: readonly IDroxReferencePayload[],
): Promise<IResolvedDroxReference[]> {
	const out: IResolvedDroxReference[] = [];
	const seen = new Set<string>();

	for (const ref of refs) {
		const raw = typeof ref.uri === 'string' ? ref.uri.trim() : '';
		if (!raw) {
			continue;
		}

		let uri: URI;
		try {
			uri = raw.startsWith('file://') || raw.includes('://')
				? URI.parse(raw)
				: URI.file(raw);
		} catch {
			continue;
		}

		const fsPath = uri.fsPath;
		if (seen.has(fsPath)) {
			continue;
		}
		seen.add(fsPath);

		let kind: 'file' | 'directory' = 'file';
		try {
			const stat = await fileService.stat(uri);
			kind = stat.isDirectory ? 'directory' : 'file';
		} catch {
			continue;
		}

		const normalizedWs = workspaceRoot.replaceAll('\\', '/');
		const normalizedPath = fsPath.replaceAll('\\', '/');
		let rel: string;
		let inWorkspace = false;
		if (normalizedPath === normalizedWs || normalizedPath.startsWith(normalizedWs + '/')) {
			const inside = normalizedPath.slice(normalizedWs.length).replace(/^\/+/, '');
			rel = inside.length > 0 ? `./${inside}` : './';
			inWorkspace = true;
		} else {
			rel = normalizedPath;
		}

		out.push({ uri: raw, rel, abs: fsPath, kind, inWorkspace });
	}

	return out;
}

const MENTION_FILE_CAP = 6;
const MENTION_FILE_CHARS = 24_000;
const MENTION_DIR_ENTRIES = 40;

/** Chemins écrits `@relatif` dans le texte. Le glisser-déposer reste un autre canal. */
export function extractAtMentionPaths(prompt: string): string[] {
	const out: string[] = [];
	const seen = new Set<string>();
	const re = /(?:^|\s)@([^\s@]+)/g;
	for (const match of prompt.matchAll(re)) {
		let raw = (match[1] ?? '').replace(/[),.;:]+$/, '');
		raw = raw.replace(/^\.\//, '').replaceAll('\\', '/');
		if (!raw || raw === '.' || seen.has(raw)) {
			continue;
		}
		seen.add(raw);
		out.push(raw);
	}
	return out;
}

/**
 * Injecte le contenu des `@fichier` et la liste des `@dossier` dans le prompt moteur.
 * Les chemins déjà présents comme références (puces) ne sont pas relus.
 */
export async function formatAtMentionContext(
	fileService: IFileService,
	workspaceRoot: string,
	prompt: string,
	already: readonly IResolvedDroxReference[] = [],
): Promise<string> {
	const paths = extractAtMentionPaths(prompt);
	if (paths.length === 0) {
		return '';
	}
	const taken = new Set(already.map(r => r.rel.replace(/^\.\//, '').replaceAll('\\', '/')));
	const blocks: string[] = [];
	let files = 0;
	for (const rel of paths) {
		if (taken.has(rel) || files >= MENTION_FILE_CAP) {
			continue;
		}
		const uri = URI.joinPath(URI.file(workspaceRoot), ...rel.split('/').filter(Boolean));
		let stat;
		try {
			stat = await fileService.stat(uri);
		} catch {
			continue;
		}
		files++;
		try {
			if (stat.isDirectory) {
				const children = await fileService.resolve(uri);
				const names = (children.children ?? [])
					.slice(0, MENTION_DIR_ENTRIES)
					.map(c => c.name + (c.isDirectory ? '/' : ''));
				const more = (children.children?.length ?? 0) > names.length ? '\n…' : '';
				blocks.push(`[@folder ${rel}]\n${names.join('\n')}${more}`);
			} else {
				const raw = await fileService.readFile(uri);
				let text = raw.value.toString();
				if (text.includes('\u0000')) {
					blocks.push(`[@file ${rel}]\n(binaire, contenu non injecté)`);
					continue;
				}
				let clipped = '';
				if (text.length > MENTION_FILE_CHARS) {
					text = text.slice(0, MENTION_FILE_CHARS);
					clipped = '\n…';
				}
				blocks.push(`[@file ${rel}]\n${text}${clipped}`);
			}
		} catch {
			continue;
		}
	}
	return blocks.length > 0 ? blocks.join('\n\n') : '';
}

export function formatReferencesPromptBlock(workspaceRoot: string, resolved: readonly IResolvedDroxReference[]): string {
	const list = resolved
		.map(r => {
			const kindLabel = r.kind === 'directory' ? 'folder' : 'file';
			const where = r.inWorkspace ? ` (relative to workspace: \`${r.rel}\`)` : '';
			return `- ${kindLabel} : \`${r.abs}\`${where}`;
		})
		.join('\n');
	return (
		`[User references]\n` +
		`Workspace root: \`${workspaceRoot}\`\n` +
		`${list}\n` +
		`Note: use these **absolute** paths in your tools ` +
		`(file_read, glob, bash). Avoid \`./\` which depends on the shell cwd.`
	);
}
