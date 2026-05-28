/**
 * Embeddings locaux (mémoire longue §2.16) via Transformers.js.
 * Chargement **lazy** au premier appel ; en cas d'échec (réseau, WASM),
 * retourne `null` plutôt que de bloquer l'indexation texte.
 */

type FeaturePipeline = (text: string, opts: { pooling: string; normalize: boolean }) => Promise<{ data: Float32Array }>;

let pipelineFactory: typeof import("@xenova/transformers").pipeline | undefined;
let cachedPipe: FeaturePipeline | undefined;

async function getPipeline(): Promise<FeaturePipeline | undefined> {
  if (cachedPipe) {
    return cachedPipe;
  }
  try {
    const mod = await import("@xenova/transformers");
    pipelineFactory = mod.pipeline;
    const env = mod.env;
    env.allowLocalModels = false;
    env.useBrowserCache = true;
    const pipe = (await pipelineFactory(
      "feature-extraction",
      "Xenova/all-MiniLM-L6-v2",
    )) as FeaturePipeline;
    cachedPipe = pipe;
    return cachedPipe;
  } catch (e) {
    console.warn("[drox] embeddings: impossible de charger @xenova/transformers", e);
    return undefined;
  }
}

/**
 * Calcule un vecteur dense (384 dims pour all-MiniLM-L6-v2), normalisé.
 * Tronque le texte pour limiter le coût.
 */
export async function embedText(text: string): Promise<number[] | null> {
  const trimmed = text.trim().slice(0, 8000);
  if (!trimmed) {
    return null;
  }
  const pipe = await getPipeline();
  if (!pipe) {
    return null;
  }
  try {
    const out = await pipe(trimmed, { pooling: "mean", normalize: true });
    return Array.from(out.data);
  } catch (e) {
    console.warn("[drox] embeddings: échec du calcul de vecteur", e);
    return null;
  }
}
