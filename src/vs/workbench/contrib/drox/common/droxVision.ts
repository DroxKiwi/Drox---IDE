/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See License.txt in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

// allow-any-unicode-comment-file

/** Retire un éventuel préfixe `data:...;base64,` avant envoi au moteur (Ollama attend du base64 brut). */
export function normalizeImageBase64Payload(data: string): string {
	const t = data.trim();
	const m = /^data:[^,]+,(.+)$/is.exec(t);
	return (m ? m[1] : t).replace(/\s+/g, '');
}

/** Heuristique : le modèle *semble* multimodal (on tente quand même l'envoi si inconnu). */
export function modelLikelySupportsVision(model: string): boolean | undefined {
	const m = model.trim().toLowerCase();
	if (!m) {
		return undefined;
	}
	const likely = [
		'vision', '-vl', 'vl-', 'llava', 'bakllava', 'moondream', 'minicpm-v', 'cogvlm',
		'pixtral', 'gemma3', 'llama3.2-vision', 'llama4', 'qwen2-vl', 'qwen-vl', 'qvq',
		'internvl', 'phi-3-vision', 'phi3-vision', 'granite-vision', 'smolvlm', 'fuyu',
	];
	const textOnly = [
		'codellama', 'deepseek-coder', 'starcoder', 'wizardcoder', 'phind-',
	];
	if (textOnly.some(p => m.includes(p))) {
		return false;
	}
	if (likely.some(p => m.includes(p))) {
		return true;
	}
	return undefined;
}

/** Erreurs API typiques quand le modèle ne gère pas les images. */
export function isVisionRelatedLlmError(message: string): boolean {
	const lower = message.toLowerCase();
	return (
		lower.includes('image')
		|| lower.includes('vision')
		|| lower.includes('multimodal')
		|| lower.includes('does not support')
		|| lower.includes('not support')
		|| lower.includes('unsupported')
		|| lower.includes('invalid image')
		|| lower.includes('expected image')
	);
}

export function formatVisionChatError(model: string, rawError: string): string {
	const hint = modelLikelySupportsVision(model) === false && model
		? ` Le modèle « ${model} » ne semble pas prendre en charge les images.`
		: '';
	return (
		`Le modèle n'a pas pu lire l'image jointe.${hint} ` +
		`Choisissez un modèle vision (ex. llava, gemma3, qwen2-vl) ou retirez l'image. ` +
		`Détail : ${rawError}`
	);
}
