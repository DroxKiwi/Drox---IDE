/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import { ConfigurationTarget, IConfigurationService } from '../../../../../../platform/configuration/common/configuration.js';
import { INativeEnvironmentService } from '../../../../../../platform/environment/common/environment.js';
import { IFileService } from '../../../../../../platform/files/common/files.js';
import { ILogService } from '../../../../../../platform/log/common/log.js';
import { DroxSetting } from '../../droxConfiguration.js';
import {
	DROX_EMBED_DEFAULT_MODEL_ID,
	DROX_EMBED_DEFAULT_MODEL_LABEL,
	resolveDroxEmbedModelPathDetailed,
} from '../droxCodebaseEmbedPaths.js';
import { DroxCodebaseEmbedClient } from '../droxCodebaseEmbedClient.js';
import { createEmptyPipelineView, IDroxCodebaseCockpitSnapshot, IDroxCodebaseEmbedStats } from '../droxCodebaseTypes.js';

export async function resolveDroxCodebaseEmbedMeta(
	fileService: IFileService,
	configurationService: IConfigurationService,
	environmentService: INativeEnvironmentService,
	partial: IDroxCodebaseEmbedStats,
): Promise<IDroxCodebaseEmbedStats> {
	const customPathSetting = (configurationService.getValue<string>(DroxSetting.CodebaseEmbedModelPath) ?? '').trim();
	const resolved = await resolveDroxEmbedModelPathDetailed(fileService, {
		customPath: customPathSetting || undefined,
		modelId: DROX_EMBED_DEFAULT_MODEL_ID,
		appRoot: environmentService.appRoot,
		userDataPath: environmentService.userDataPath,
	});
	return {
		...partial,
		resolvedPath: resolved.path,
		source: resolved.source,
		customPathSetting: customPathSetting || undefined,
		modelId: partial.modelId ?? (resolved.path ? DROX_EMBED_DEFAULT_MODEL_LABEL : undefined),
	};
}

export async function probeDroxCodebaseEmbedAlerts(
	embedClient: DroxCodebaseEmbedClient,
	fileService: IFileService,
	configurationService: IConfigurationService,
	environmentService: INativeEnvironmentService,
): Promise<IDroxCodebaseCockpitSnapshot['alerts']> {
	try {
		const st = await embedClient.status();
		if (!st.built) {
			return [{
				id: 'embed-not-built',
				severity: 'info',
				code: 'EMBED_NOT_BUILT',
				message: 'Embed runtime not in this drox.exe — rebuild with --features embed (CB2).',
				at: Date.now(),
			}];
		}
		const resolved = await resolveDroxEmbedModelPathDetailed(fileService, {
			customPath: (configurationService.getValue<string>(DroxSetting.CodebaseEmbedModelPath) ?? '').trim() || undefined,
			appRoot: environmentService.appRoot,
			userDataPath: environmentService.userDataPath,
		});
		if (!resolved.path) {
			return [{
				id: 'embed-no-model-file',
				severity: 'warn',
				code: 'EMBED_MODEL_MISSING',
				message: `Default MiniLM GGUF not found (expected under resources/drox/models/${DROX_EMBED_DEFAULT_MODEL_ID}). Package the model with the app or set a custom path.`,
				at: Date.now(),
			}];
		}
		if (!st.modelLoaded) {
			return [{
				id: 'embed-no-model',
				severity: 'warn',
				code: 'EMBED_NO_MODEL',
				message: `GGUF found (${resolved.source}) but failed to load — check the path or click Reindex.`,
				at: Date.now(),
			}];
		}
	} catch {
		return [{
			id: 'embed-unreachable',
			severity: 'warn',
			code: 'EMBED_UNREACHABLE',
			message: 'Could not query embed.status on drox.exe.',
			at: Date.now(),
		}];
	}
	return [];
}

export function applyDroxCodebaseEmbedToSnapshot(
	snapshot: IDroxCodebaseCockpitSnapshot,
	embed: IDroxCodebaseEmbedStats,
	mode: IDroxCodebaseCockpitSnapshot['mode'],
	embedAlerts: IDroxCodebaseCockpitSnapshot['alerts'],
): IDroxCodebaseCockpitSnapshot {
	const nonEmbedAlerts = snapshot.alerts.filter(a => !a.id.startsWith('embed-'));
	return {
		...snapshot,
		embed,
		mode,
		alerts: [...nonEmbedAlerts, ...embedAlerts],
		pipelineView: snapshot.pipelineView ?? createEmptyPipelineView(),
	};
}

export async function refreshDroxCodebaseEmbedStatus(opts: {
	readonly embedClient: DroxCodebaseEmbedClient;
	readonly fileService: IFileService;
	readonly configurationService: IConfigurationService;
	readonly environmentService: INativeEnvironmentService;
	readonly logService: ILogService;
	readonly snapshot: IDroxCodebaseCockpitSnapshot;
	readonly apply: (embed: IDroxCodebaseEmbedStats, mode: IDroxCodebaseCockpitSnapshot['mode']) => Promise<void>;
}): Promise<void> {
	try {
		const st = await opts.embedClient.status();
		const hasVectors = opts.snapshot.storage.vectors > 0;
		const embed = await resolveDroxCodebaseEmbedMeta(opts.fileService, opts.configurationService, opts.environmentService, {
			loaded: st.modelLoaded,
			modelId: st.modelPath ?? (st.built ? `${DROX_EMBED_DEFAULT_MODEL_LABEL} · ${st.backend}` : undefined),
			dimensions: st.dimensions,
			backend: st.backend,
			built: st.built,
			rssBytes: undefined,
			lastProbeMs: undefined,
		});
		if (st.built && !st.modelLoaded && embed.resolvedPath) {
			try {
				await opts.embedClient.load(embed.resolvedPath);
				const after = await opts.embedClient.status();
				const loadedEmbed = await resolveDroxCodebaseEmbedMeta(opts.fileService, opts.configurationService, opts.environmentService, {
					loaded: after.modelLoaded,
					modelId: after.modelPath ?? DROX_EMBED_DEFAULT_MODEL_LABEL,
					dimensions: after.dimensions,
					backend: after.backend,
					built: after.built,
				});
				await opts.apply(loadedEmbed, after.modelLoaded && hasVectors ? 'hybrid' : 'lexical');
				return;
			} catch (loadErr) {
				opts.logService.trace(`[drox-codebase] auto embed.load failed: ${loadErr}`);
			}
		}
		await opts.apply(embed, (st.built && st.modelLoaded && hasVectors) ? 'hybrid' : 'lexical');
	} catch (err) {
		opts.logService.trace(`[drox-codebase] embed.status failed: ${err}`);
	}
}

export async function setDroxCodebaseEmbedModelPath(opts: {
	readonly embedClient: DroxCodebaseEmbedClient;
	readonly configurationService: IConfigurationService;
	readonly logService: ILogService;
	readonly path: string;
	readonly refresh: () => Promise<void>;
}): Promise<void> {
	const trimmed = opts.path.trim();
	await opts.configurationService.updateValue(DroxSetting.CodebaseEmbedModelPath, trimmed, ConfigurationTarget.USER);
	if (trimmed) {
		try {
			await opts.embedClient.load(trimmed);
		} catch (err) {
			opts.logService.warn(`[drox-codebase] embed.load custom path failed: ${err}`);
		}
	}
	await opts.refresh();
}

export async function resetDroxCodebaseEmbedDefaults(opts: {
	readonly embedClient: DroxCodebaseEmbedClient;
	readonly fileService: IFileService;
	readonly configurationService: IConfigurationService;
	readonly environmentService: INativeEnvironmentService;
	readonly logService: ILogService;
	readonly refresh: () => Promise<void>;
}): Promise<void> {
	await opts.configurationService.updateValue(DroxSetting.CodebaseEmbedModelPath, '', ConfigurationTarget.USER);
	const resolved = await resolveDroxEmbedModelPathDetailed(opts.fileService, {
		customPath: undefined,
		modelId: DROX_EMBED_DEFAULT_MODEL_ID,
		appRoot: opts.environmentService.appRoot,
		userDataPath: opts.environmentService.userDataPath,
	});
	if (resolved.path) {
		try {
			await opts.embedClient.load(resolved.path);
		} catch (err) {
			opts.logService.warn(`[drox-codebase] embed.load default failed: ${err}`);
		}
	}
	await opts.refresh();
}
