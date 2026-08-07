/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

import { Schemas } from '../../../../../base/common/network.js';
import { URI } from '../../../../../base/common/uri.js';
import { localize } from '../../../../../nls.js';
import { EditorInputCapabilities, IUntypedEditorInput } from '../../../../common/editor.js';
import { EditorInput } from '../../../../common/editor/editorInput.js';

export const DROX_GIT_GRAPH_EDITOR_ID = 'workbench.editor.droxGitGraph';
export const DROX_GIT_GRAPH_INPUT_TYPE_ID = 'workbench.input.droxGitGraph';
export const DROX_GIT_GRAPH_SCHEME = 'drox-git-graph';

export function createDroxGitGraphResource(folder: URI): URI {
	return URI.from({
		scheme: DROX_GIT_GRAPH_SCHEME,
		path: folder.path,
		query: folder.scheme === Schemas.file ? undefined : `scheme=${encodeURIComponent(folder.scheme)}`,
		fragment: folder.authority || undefined,
	});
}

export function folderFromDroxGitGraphResource(resource: URI): URI {
	const scheme = new URLSearchParams(resource.query).get('scheme') ?? Schemas.file;
	return URI.from({
		scheme,
		authority: resource.fragment || undefined,
		path: resource.path,
	});
}

export class DroxGitGraphInput extends EditorInput {

	static readonly TypeID = DROX_GIT_GRAPH_INPUT_TYPE_ID;

	override get typeId(): string {
		return DroxGitGraphInput.TypeID;
	}

	override get editorId(): string | undefined {
		return DROX_GIT_GRAPH_EDITOR_ID;
	}

	override get capabilities(): EditorInputCapabilities {
		return EditorInputCapabilities.Readonly | EditorInputCapabilities.Singleton;
	}

	readonly resource: URI;

	constructor(
		readonly folder: URI,
	) {
		super();
		this.resource = createDroxGitGraphResource(folder);
	}

	override getName(): string {
		const name = this.folder.path.split('/').filter(Boolean).pop()
			?? this.folder.fsPath.split(/[\\/]/).filter(Boolean).pop()
			?? 'repo';
		return localize('drox.gitGraph.inputName', "Git Graph: {0}", name);
	}

	override matches(other: EditorInput | IUntypedEditorInput): boolean {
		if (super.matches(other)) {
			return true;
		}
		if (other instanceof DroxGitGraphInput) {
			return this.resource.toString() === other.resource.toString();
		}
		return false;
	}
}
