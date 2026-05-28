/**
 * Extraction heuristique de l'objectif verrouillé d'un run (§2.25).
 * Pas de LLM : troncature du premier paragraphe utilisateur.
 */

const RUN_OBJECTIVE_MAX_CHARS = 220;
const MIN_OBJECTIVE_LEN = 8;

/**
 * Retire les blocs injectés par l'extension (références, etc.).
 */
function stripInjectedBlocks(prompt: string): string {
  const refIdx = prompt.indexOf("[Références utilisateur]");
  if (refIdx >= 0) {
    return prompt.slice(0, refIdx).trim();
  }
  return prompt.trim();
}

/**
 * Dérive l'objectif du run à partir du texte utilisateur (avant envoi).
 * Retourne `undefined` si le texte est trop court ou vide.
 */
export function extractRunObjective(prompt: string): string | undefined {
  const stripped = stripInjectedBlocks(prompt);
  if (!stripped) {
    return undefined;
  }
  const firstPara = (stripped.split(/\n\n+/)[0] ?? stripped).trim();
  const oneLine = firstPara.replace(/\s+/g, " ").trim();
  if (oneLine.length < MIN_OBJECTIVE_LEN) {
    return undefined;
  }
  if (oneLine.length <= RUN_OBJECTIVE_MAX_CHARS) {
    return oneLine;
  }
  return `${oneLine.slice(0, RUN_OBJECTIVE_MAX_CHARS - 1)}…`;
}
