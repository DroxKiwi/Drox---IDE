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
