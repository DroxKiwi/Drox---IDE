#!/usr/bin/env node
/**
 * Merge product.gallery.json (Open VSX) into a packaged product.json.
 * OSS product.json must not contain extensionsGallery (build/hygiene).
 *
 * Usage:
 *   node scripts/lib/merge-product-gallery.mjs <packaged-dir>
 *   node scripts/lib/merge-product-gallery.mjs <path/to/product.json>
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(__dirname, '..', '..');
const GALLERY_PATH = path.join(REPO_ROOT, 'product.gallery.json');

function resolveProductJsonPath(input) {
	const resolved = path.resolve(input);
	if (resolved.endsWith(`${path.sep}product.json`)) {
		return resolved;
	}
	if (fs.existsSync(resolved) && fs.statSync(resolved).isFile()) {
		return resolved;
	}
	return path.join(resolved, 'resources', 'app', 'product.json');
}

function mergeGalleryIntoProduct(product, gallery) {
	const merged = { ...product, ...gallery };

	if (Array.isArray(gallery.linkProtectionTrustedDomains)) {
		const existing = Array.isArray(product.linkProtectionTrustedDomains)
			? product.linkProtectionTrustedDomains
			: [];
		merged.linkProtectionTrustedDomains = [
			...new Set([...existing, ...gallery.linkProtectionTrustedDomains]),
		];
	}

	return merged;
}

function main() {
	const targetArg = process.argv[2];
	if (!targetArg) {
		console.error('[merge-product-gallery] Usage: node merge-product-gallery.mjs <packaged-dir|product.json>');
		process.exit(1);
	}

	if (!fs.existsSync(GALLERY_PATH)) {
		console.error(`[merge-product-gallery] Missing ${GALLERY_PATH}`);
		process.exit(1);
	}

	const productJsonPath = resolveProductJsonPath(targetArg);
	if (!fs.existsSync(productJsonPath)) {
		console.error(`[merge-product-gallery] product.json not found: ${productJsonPath}`);
		process.exit(1);
	}

	const gallery = JSON.parse(fs.readFileSync(GALLERY_PATH, 'utf8'));
	const product = JSON.parse(fs.readFileSync(productJsonPath, 'utf8'));
	const merged = mergeGalleryIntoProduct(product, gallery);

	fs.writeFileSync(productJsonPath, `${JSON.stringify(merged, null, '\t')}\n`, 'utf8');

	const serviceUrl = merged.extensionsGallery?.serviceUrl ?? '(none)';
	console.log(`[merge-product-gallery] OK ${productJsonPath}`);
	console.log(`[merge-product-gallery] extensionsGallery.serviceUrl = ${serviceUrl}`);
}

main();
