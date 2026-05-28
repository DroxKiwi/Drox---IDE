// @ts-check
(function () {
  const vscode = acquireVsCodeApi();

  /** Remonte un message vers le canal Sortie « Drox (UI) » côté extension. */
  function diag(text) {
    const line = String(text);
    console.log("[drox chat]", line);
    try {
      vscode.postMessage({ type: "diagLog", text: line });
    } catch (e) {
      console.error("[drox chat] diagLog failed", e);
    }
  }

  diag("chat.js chargé");

  let webviewReadyPosted = false;
  function postWebviewReadyOnce() {
    if (webviewReadyPosted) {
      return;
    }
    webviewReadyPosted = true;
    diag("postWebviewReady");
    vscode.postMessage({ type: "webviewReady" });
  }

  /** @param {string} label @param {() => void} fn */
  function safeInit(label, fn) {
    try {
      fn();
      diag(`init OK: ${label}`);
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      diag(`init FAIL: ${label} — ${msg}`);
      console.error(`[drox chat] init FAIL ${label}`, e);
    }
  }

  /** @type {{ mode: string }} */
  const initialState = vscode.getState() ?? { mode: "acceptEdits" };

  const logEl = /** @type {HTMLDivElement} */ (document.getElementById("log"));
  const promptEl = /** @type {HTMLTextAreaElement} */ (
    document.getElementById("prompt")
  );
  const suggestionsEl = /** @type {HTMLDivElement | null} */ (
    document.getElementById("prompt-suggestions")
  );
  const sendBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("send")
  );
  const modeSelect = /** @type {HTMLSelectElement} */ (
    document.getElementById("mode")
  );
  const fileInput = /** @type {HTMLInputElement} */ (
    document.getElementById("file-input")
  );
  const attachBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("attach")
  );
  const addRefsBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("add-refs")
  );
  const attachmentsEl = /** @type {HTMLDivElement} */ (
    document.getElementById("attachments")
  );
  const refsEl = /** @type {HTMLDivElement} */ (
    document.getElementById("refs")
  );
  const pendingPromptsEl = /** @type {HTMLDivElement} */ (
    document.getElementById("pending-prompts")
  );
  const stopRunBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("stop-run")
  );
  const sendQueueBadge = /** @type {HTMLSpanElement} */ (
    document.getElementById("send-queue-badge")
  );
  const userAskEl = /** @type {HTMLDivElement} */ (
    document.getElementById("user-ask")
  );
  const composerEl = /** @type {HTMLDivElement} */ (
    document.getElementById("composer")
  );
  const statTokensIn = /** @type {HTMLSpanElement} */ (
    document.getElementById("tok-in")
  );
  const statTokensOut = /** @type {HTMLSpanElement} */ (
    document.getElementById("tok-out")
  );
  const statCtx = /** @type {HTMLSpanElement} */ (
    document.getElementById("ctx")
  );
  const newChatBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("new-chat")
  );
  const historyToggleBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("history-toggle")
  );
  const openSettingsBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("open-settings")
  );
  const historyCloseBtn = /** @type {HTMLButtonElement} */ (
    document.getElementById("history-close")
  );
  const historyPanel = /** @type {HTMLDivElement} */ (
    document.getElementById("history-panel")
  );
  const historyList = /** @type {HTMLDivElement} */ (
    document.getElementById("history-list")
  );
  const progressEl = /** @type {HTMLDivElement} */ (
    document.getElementById("progress")
  );
  const statusStateEl = /** @type {HTMLSpanElement} */ (
    document.getElementById("status-state")
  );
  const statusStateText = /** @type {HTMLSpanElement} */ (
    document.getElementById("status-state-text")
  );

  /** Bloc assistant en cours d'écriture (streaming). `null` quand rien en cours. */
  /** @type {HTMLDivElement | null} */
  let assistantEl = null;
  /** Loader ("…") affiché tant que rien n'a encore été écrit. */
  /** @type {HTMLDivElement | null} */
  let loaderEl = null;
  /** Références fichier/dossier glissées depuis l'Explorateur VS Code. */
  /** @type {Array<{ id: string, uri: string, label: string }>} */
  let references = [];
  /**
   * Sprint Smart paste (§2.9) — chips « smart paste » en attente d'envoi.
   * Une chip représente un texte collé que la webview a reconnu comme issu
   * d'une sélection d'éditeur récente (matching FNV-1a sur le presse-papier).
   * Le contenu (`text`) reste côté webview jusqu'au `doSend()` qui l'envoie
   * à l'extension pour qu'elle l'attache au prompt côté moteur.
   *
   * @type {Array<{
   *   id: string,
   *   token: string,
   *   kind: "editor" | "terminal",
   *   absPath: string,
   *   relPath: string | null,
   *   languageId: string,
   *   startLine: number,
   *   endLine: number,
   *   lineCount: number,
   *   text: string
   * }>}
   */
  let pasteAttachments = [];
  /**
   * Catalogue des candidats poussés par l'extension (éditeur + terminal),
   * keyé par `token` FNV-1a.
   *
   * @type {Map<string, {
   *   id: string,
   *   token: string,
   *   kind: "editor" | "terminal",
   *   absPath: string,
   *   relPath: string | null,
   *   languageId: string,
   *   startLine: number,
   *   endLine: number,
   *   lineCount: number,
   *   text: string
   * }>}
   */
  const pasteCandidates = new Map();

  /** Libellé court `L12` ou `L12-34` pour chips / tooltips. */
  function pasteLineRef(startLine, endLine) {
    const s = Math.max(1, Math.floor(startLine || 1));
    const e = Math.max(s, Math.floor(endLine || s));
    return s === e ? `L${s}` : `L${s}-${e}`;
  }
  let busy = false;
  /**
   * Sprint §2.14 — messages « write ahead » pendant un run (FIFO, webview only).
   * @type {Array<{
   *   id: string,
   *   prompt: string,
   *   mode: string,
   *   attachments: Array<{ name: string, mime: string, dataUrl: string }>,
   *   references: Array<{ id: string, uri: string, label: string }>,
   *   pastes: Array<{
   *     id: string,
   *     token: string,
   *     kind: "editor" | "terminal",
   *     absPath: string,
   *     relPath: string | null,
   *     languageId: string,
   *     startLine: number,
   *     endLine: number,
   *     lineCount: number,
   *     text: string
   *   }>
   * }>}
   */
  let pendingPrompts = [];
  /** Longueur max du snippet visible au-dessus du textarea. */
  const PENDING_SNIPPET_MAX = 96;
  /** @type {Array<{ id: string, name: string, dataUrl: string, mime: string }>} */
  let attachments = [];
  let totalIn = 0;
  let totalOut = 0;
  let ctxTokens = 0;
  /** Historique des prompts envoyés (récent → ancien). */
  /** @type {string[]} */
  let history = [];
  /** Index de navigation dans l'historique. -1 = pas de navigation. */
  let historyIdx = -1;
  /** Brouillon en cours quand on commence à naviguer l'historique. */
  let historyDraft = "";
  /** Id de session courant (null tant que pas créé). */
  let currentSessionId = null;
  /** Replay transcript historique ; file d'attente UI pour messages non prioritaires. */
  let replayingHistory = false;
  /** Diffs fichier rejoués après le texte (voir `drox.replayTranscriptFileDiffs`). */
  let replayFileDiffs = false;
  /** @type {unknown[]} */
  let replayMessageQueue = [];
  let replayDrainScheduled = false;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let replaySafetyTimer = null;

  function endReplayMode() {
    replayingHistory = false;
    replayFileDiffs = false;
    if (replaySafetyTimer != null) {
      clearTimeout(replaySafetyTimer);
      replaySafetyTimer = null;
    }
    if (replayMessageQueue.length > 0) {
      scheduleReplayDrain();
    }
  }

  function startReplayMode(fileDiffs) {
    replayingHistory = true;
    replayFileDiffs = Boolean(fileDiffs);
    replayMessageQueue = [];
    if (replaySafetyTimer != null) {
      clearTimeout(replaySafetyTimer);
    }
    // Filet de sécurité si `replay: { active: false }` ne parvient jamais.
    replaySafetyTimer = setTimeout(() => {
      replaySafetyTimer = null;
      if (replayingHistory) {
        console.warn("[drox chat] replay safety timeout — déblocage UI");
        endReplayMode();
      }
    }, 120_000);
  }
  /** Map id de tool → nom du tool, tant qu'il est en cours d'exécution. */
  /** @type {Map<string, string>} */
  const activeToolNames = new Map();
  /**
   * Bloc DOM unique de la to-do list courante (sortie de `todo_write`). On
   * l'update en place à chaque tour pour éviter d'en créer un nouveau à
   * chaque appel. Reset à `null` sur `chatReset`.
   */
  /** @type {HTMLDivElement | null} */
  let currentTodoBlockEl = null;
  /** @type {HTMLDivElement | null} */
  let currentCoursePlanBlockEl = null;

  /** Identifiants DOM stables pour citations `[Réf. @dm…]` (reset sur `clearLog`). */
  let msgDomSeq = 0;
  function nextMsgDomId() {
    msgDomSeq += 1;
    return `dm${msgDomSeq}`;
  }
  /**
   * État du protocole de phases (Sprint A 2026-05-13).
   *
   * Le moteur Rust émet des `phase_enter` (`internal_reasoning`, `reading`,
   * `planning`, `acting`, `verifying`, `clarifying`, `answering`, `done`) que la webview
   * matérialise comme blocs collapsibles type Cursor « Thought for 1s ».
   * Toutes les sorties (texte streaming, tool blocks) qui suivent un
   * `phase_enter` non-done sont insérées **à l'intérieur** du bloc de phase
   * courant ; un `phase_enter: done` ferme la phase active et bascule la
   * suite dans le rendu standard (bulle assistant principale).
   */
  let currentPhase = null;
  /** @type {HTMLDetailsElement | null} */
  let currentPhaseEl = null;
  /** Corps cible (`<div class="phase-body">`) pour le rendu courant. */
  let currentPhaseBodyEl = null;
  /** Élément sticky compact au-dessus du composer. */
  const stickyTodoEl = /** @type {HTMLDivElement} */ (
    document.getElementById("todo-sticky")
  );
  const stickyCoursePlanEl = /** @type {HTMLDivElement} */ (
    document.getElementById("course-plan-sticky")
  );
  const stickyUserPromptEl = /** @type {HTMLDivElement} */ (
    document.getElementById("user-prompt-sticky")
  );
  const stickyRunObjectiveEl = /** @type {HTMLDivElement} */ (
    document.getElementById("run-objective-sticky")
  );
  const scopeParkingEl = /** @type {HTMLDivElement} */ (
    document.getElementById("scope-parking")
  );
  const scopeParkingToggleEl = /** @type {HTMLButtonElement} */ (
    document.getElementById("scope-parking-toggle")
  );
  const scopeParkingListEl = /** @type {HTMLUListElement} */ (
    document.getElementById("scope-parking-list")
  );
  const courseCycleBannerEl = /** @type {HTMLDivElement} */ (
    document.getElementById("course-cycle-banner")
  );
  const professorGuardBannerEl = /** @type {HTMLDivElement} */ (
    document.getElementById("professor-guard-banner")
  );
  /** Plan de cours reçu dans le run / la session courante (mode Professeur). */
  let hasCoursePlanInRun = false;

  /**
   * Sprint Questions bloquantes (§2.13) — `user/ask` actif côté UI.
   * Tant que ce champ est non-null, le bouton Send est désactivé pour
   * forcer l'utilisateur à répondre (ou skipper) la carte avant d'envoyer
   * un nouveau message. La file 1/N est navigable via Précédent/Suivant.
   *
   * @type {null | {
   *   askId: string,
   *   title: string | null,
   *   questions: Array<{
   *     id: string,
   *     prompt: string,
   *     options: Array<{ id: string, label: string }>,
   *     allowMultiple: boolean,
   *     allowFreeText: boolean
   *   }>,
   *   currentIndex: number,
   *   answers: Map<string, { optionIds: Set<string>, freeText: string, skipped: boolean }>
   * }}
   */
  let pendingUserAsk = null;

  if (modeSelect) {
    modeSelect.value = initialState.mode;
  } else {
    diag("DOM manquant: #mode — mode par défaut acceptEdits");
  }
  function isProfessorMode() {
    return modeSelect ? modeSelect.value === "professor" : false;
  }

  /** Masque toute la chrome réservée au mode Professeur (plans de cours, cycles). */
  function syncProfessorOnlyChrome() {
    if (isProfessorMode()) {
      return;
    }
    hideCoursePlanSticky();
    renderCourseCycleBanner({ active: false });
    if (professorGuardBannerEl) {
      professorGuardBannerEl.hidden = true;
      professorGuardBannerEl.textContent = "";
    }
  }

  if (modeSelect) {
    modeSelect.addEventListener("change", () => {
      vscode.setState({ mode: modeSelect.value });
      updateProfessorGuardBanner();
      syncProfessorOnlyChrome();
    });
  }

  function updateProfessorGuardBanner() {
    if (!professorGuardBannerEl) return;
    const show = isProfessorMode() && !hasCoursePlanInRun;
    professorGuardBannerEl.hidden = !show;
    if (show) {
      professorGuardBannerEl.textContent =
        "Mode Professeur — l’agent doit d’abord établir un plan de cours (course_plan_write). " +
        "Les modifications du dépôt ne sont possibles que pendant un exercice actif. " +
        "Pour exécuter sans tutorat : passez en Accept edits.";
    } else {
      professorGuardBannerEl.textContent = "";
    }
  }
  safeInit("professorChrome", () => {
    updateProfessorGuardBanner();
    syncProfessorOnlyChrome();
  });
  diag("checkpoint A");

  // --- Placeholder contextuel + complétion `@chemin` (§2.8) ---
  const DEFAULT_PROMPT_PLACEHOLDER =
    "Demander à Drox… (@ fichier · /help · Entrée = envoyer)";
  let hasSentPrompt = false;
  let pathCompleteSeq = 0;
  /** @type {string | null} */
  let pathCompletePendingId = null;
  /** @type {ReturnType<typeof setTimeout> | null} */
  let pathCompleteTimer = null;
  /**
   * @type {{
   *   items: Array<{ label: string, insertText: string, kind: string, description?: string }>,
   *   selected: number,
   *   replaceStart: number,
   *   replaceEnd: number
   * } | null}
   */
  let pathSuggestions = null;

  function updatePromptPlaceholder() {
    if (promptEl.value.trim().length > 0) {
      promptEl.placeholder = DEFAULT_PROMPT_PLACEHOLDER;
      return;
    }
    if (pendingPrompts.length > 0) {
      promptEl.placeholder =
        "↑ pour éditer les messages en file · Entrée = mettre en file";
      return;
    }
    if (!hasSentPrompt && history.length === 0) {
      promptEl.placeholder =
        "Première question… tape @ pour citer un fichier du workspace";
      return;
    }
    if (references.length > 0) {
      promptEl.placeholder = `${references.length} référence(s) — @ chemin ou envoyer`;
      return;
    }
    promptEl.placeholder = DEFAULT_PROMPT_PLACEHOLDER;
  }

  /**
   * @param {string} value
   * @param {number} cursor
   */
  function findAtCompletionContext(value, cursor) {
    const before = value.slice(0, cursor);
    const match = before.match(/(?:^|\s)@([^\s@]*)$/);
    if (!match) {
      return null;
    }
    const query = match[1] ?? "";
    const replaceStart = before.length - query.length - 1;
    return { query, replaceStart, replaceEnd: cursor };
  }

  function hidePathSuggestions() {
    pathSuggestions = null;
    if (pathCompleteTimer) {
      clearTimeout(pathCompleteTimer);
      pathCompleteTimer = null;
    }
    if (suggestionsEl) {
      suggestionsEl.setAttribute("hidden", "");
      suggestionsEl.replaceChildren();
    }
  }

  function renderPathSuggestions() {
    if (!suggestionsEl || !pathSuggestions || pathSuggestions.items.length === 0) {
      if (suggestionsEl) {
        suggestionsEl.setAttribute("hidden", "");
        suggestionsEl.replaceChildren();
      }
      return;
    }
    suggestionsEl.removeAttribute("hidden");
    suggestionsEl.replaceChildren();
    pathSuggestions.items.forEach((item, idx) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "prompt-suggestion-item";
      if (idx === pathSuggestions.selected) {
        btn.classList.add("selected");
      }
      btn.setAttribute("role", "option");
      btn.setAttribute("aria-selected", idx === pathSuggestions.selected ? "true" : "false");
      const label = document.createElement("span");
      label.className = "prompt-suggestion-label";
      label.textContent = item.label;
      const meta = document.createElement("span");
      meta.className = "prompt-suggestion-meta";
      meta.textContent = item.description || item.kind;
      btn.appendChild(label);
      btn.appendChild(meta);
      btn.addEventListener("mousedown", (e) => {
        e.preventDefault();
        applyPathSuggestion(item);
      });
      suggestionsEl.appendChild(btn);
    });
  }

  /**
   * @param {{ insertText: string }} item
   */
  function applyPathSuggestion(item) {
    if (!pathSuggestions) {
      return;
    }
    const ctx = findAtCompletionContext(
      promptEl.value,
      promptEl.selectionStart ?? 0,
    );
    if (!ctx) {
      hidePathSuggestions();
      return;
    }
    const pathPart = item.insertText.replace(/^\.\//, "");
    const insert = `@${pathPart}`;
    const before = promptEl.value.slice(0, ctx.replaceStart);
    const after = promptEl.value.slice(ctx.replaceEnd);
    promptEl.value = before + insert + after;
    const pos = before.length + insert.length;
    promptEl.setSelectionRange(pos, pos);
    hidePathSuggestions();
    autoresize();
    updatePromptPlaceholder();
    promptEl.focus();
  }

  function schedulePathComplete() {
    if (pathCompleteTimer) {
      clearTimeout(pathCompleteTimer);
    }
    const cursor = promptEl.selectionStart ?? 0;
    const ctx = findAtCompletionContext(promptEl.value, cursor);
    if (!ctx) {
      hidePathSuggestions();
      return;
    }
    pathCompleteTimer = setTimeout(() => {
      pathCompleteTimer = null;
      const reqId = `pc_${++pathCompleteSeq}`;
      pathCompletePendingId = reqId;
      pathSuggestions = {
        items: [],
        selected: 0,
        replaceStart: ctx.replaceStart,
        replaceEnd: ctx.replaceEnd,
      };
      vscode.postMessage({
        type: "pathComplete",
        requestId: reqId,
        query: ctx.query,
      });
    }, 120);
  }

  function pathSuggestionsOpen() {
    return Boolean(
      pathSuggestions &&
        pathSuggestions.items &&
        pathSuggestions.items.length > 0 &&
        suggestionsEl &&
        !suggestionsEl.hasAttribute("hidden"),
    );
  }

  // --- Auto-resize textarea ---
  function autoresize() {
    promptEl.style.height = "auto";
    promptEl.style.height = Math.min(promptEl.scrollHeight, 240) + "px";
  }
  if (promptEl) {
    promptEl.addEventListener("input", () => {
      autoresize();
      updatePromptPlaceholder();
      schedulePathComplete();
    });
    updatePromptPlaceholder();
  } else {
    diag("DOM manquant: #prompt");
  }
  diag("checkpoint B");

  // --- Helpers de rendu ---

  /** True si l'utilisateur est (à peu près) collé au bas du log. */
  function isAtBottom() {
    const gap = logEl.scrollHeight - logEl.scrollTop - logEl.clientHeight;
    return gap < 40;
  }

  function maybeScroll(force) {
    if (force || isAtBottom()) {
      logEl.scrollTop = logEl.scrollHeight;
    }
  }

  // --- Mini-renderer markdown (streaming-friendly, CSP-safe) ---
  //
  // Pas de dépendance externe : tous les noeuds sont créés via
  // `document.createElement` + `textContent`, ce qui rend l'arbre résultant
  // intrinsèquement XSS-safe. Seuls les `href` de liens sont insérés via
  // `setAttribute`, après vérification du schéma.
  //
  // Supporte :
  //   - titres `#`..`######`
  //   - blocs de code ```lang ... ```
  //   - listes `-`, `*`, `+`, ou ordonnées `1.`
  //   - blockquotes `>`
  //   - règles horizontales `---`, `***`
  //   - paragraphes (sauts de ligne préservés via `white-space: pre-wrap`)
  //   - inline : `code`, **gras**, __gras__, *italique*, _italique_,
  //     ~~barré~~, [texte](url), <https://url>
  //
  // Streaming : pendant un stream, la dernière code fence peut être ouverte
  // sans fence fermante. Dans ce cas on consomme jusqu'à la fin, ce qui
  // évite d'interpréter le contenu du code comme du markdown.
  const MD_INLINE_RX =
    /(`+)([\s\S]+?)\1|\*\*([\s\S]+?)\*\*|__([\s\S]+?)__|~~([\s\S]+?)~~|\*([^\s*][\s\S]*?[^\s*]|[^\s*])\*|_([^\s_][\s\S]*?[^\s_]|[^\s_])_|\[([^\]]+?)\]\(([^)\s]+)\)|<(https?:\/\/[^>\s]+)>/g;

  function isSafeHref(url) {
    return /^(https?:|file:|mailto:|#|\/|\.\/|\.\.\/)/i.test(url);
  }

  function renderInline(text, target) {
    let last = 0;
    let m;
    MD_INLINE_RX.lastIndex = 0;
    while ((m = MD_INLINE_RX.exec(text)) !== null) {
      if (m.index > last) {
        target.appendChild(document.createTextNode(text.slice(last, m.index)));
      }
      if (m[1]) {
        const c = document.createElement("code");
        c.textContent = m[2];
        target.appendChild(c);
      } else if (m[3] || m[4]) {
        const b = document.createElement("strong");
        b.textContent = m[3] || m[4];
        target.appendChild(b);
      } else if (m[5]) {
        const s = document.createElement("del");
        s.textContent = m[5];
        target.appendChild(s);
      } else if (m[6] || m[7]) {
        const i = document.createElement("em");
        i.textContent = m[6] || m[7];
        target.appendChild(i);
      } else if (m[8] && m[9] && isSafeHref(m[9])) {
        const a = document.createElement("a");
        a.setAttribute("href", m[9]);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        a.textContent = m[8];
        target.appendChild(a);
      } else if (m[10] && isSafeHref(m[10])) {
        const a = document.createElement("a");
        a.setAttribute("href", m[10]);
        a.setAttribute("target", "_blank");
        a.setAttribute("rel", "noopener noreferrer");
        a.textContent = m[10];
        target.appendChild(a);
      } else {
        target.appendChild(document.createTextNode(m[0]));
      }
      last = m.index + m[0].length;
    }
    if (last < text.length) {
      target.appendChild(document.createTextNode(text.slice(last)));
    }
  }

  function isBlockStart(line) {
    return (
      /^#{1,6}\s+/.test(line) ||
      /^```/.test(line) ||
      /^\s*([-*+]|\d+\.)\s+/.test(line) ||
      /^>\s?/.test(line) ||
      /^(-{3,}|\*{3,})\s*$/.test(line.trim())
    );
  }

  function renderMarkdown(source) {
    const frag = document.createDocumentFragment();
    const lines = source.split(/\r?\n/);
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];

      const fenceMatch = /^```(.*)$/.exec(line);
      if (fenceMatch) {
        const lang = fenceMatch[1].trim();
        const codeLines = [];
        i++;
        while (i < lines.length && !/^```\s*$/.test(lines[i])) {
          codeLines.push(lines[i]);
          i++;
        }
        if (i < lines.length) i++;
        const pre = document.createElement("pre");
        pre.className = "md-code";
        const code = document.createElement("code");
        if (lang) code.className = "language-" + lang.replace(/[^a-zA-Z0-9_-]/g, "");
        code.textContent = codeLines.join("\n");
        pre.appendChild(code);
        frag.appendChild(pre);
        continue;
      }

      const headMatch = /^(#{1,6})\s+(.+?)\s*#*\s*$/.exec(line);
      if (headMatch) {
        const level = headMatch[1].length;
        const h = document.createElement("h" + level);
        renderInline(headMatch[2], h);
        frag.appendChild(h);
        i++;
        continue;
      }

      if (/^(-{3,}|\*{3,})\s*$/.test(line.trim())) {
        frag.appendChild(document.createElement("hr"));
        i++;
        continue;
      }

      if (/^>\s?/.test(line)) {
        const bq = document.createElement("blockquote");
        const buf = [];
        while (i < lines.length && /^>\s?/.test(lines[i])) {
          buf.push(lines[i].replace(/^>\s?/, ""));
          i++;
        }
        renderInline(buf.join("\n"), bq);
        frag.appendChild(bq);
        continue;
      }

      if (/^\s*([-*+]|\d+\.)\s+/.test(line)) {
        const ordered = /^\s*\d+\.\s+/.test(line);
        const list = document.createElement(ordered ? "ol" : "ul");
        while (i < lines.length && /^\s*([-*+]|\d+\.)\s+/.test(lines[i])) {
          const itemText = lines[i].replace(/^\s*([-*+]|\d+\.)\s+/, "");
          const li = document.createElement("li");
          renderInline(itemText, li);
          list.appendChild(li);
          i++;
        }
        frag.appendChild(list);
        continue;
      }

      if (line.trim() === "") {
        i++;
        continue;
      }

      const paraBuf = [line];
      i++;
      while (
        i < lines.length &&
        lines[i].trim() !== "" &&
        !isBlockStart(lines[i])
      ) {
        paraBuf.push(lines[i]);
        i++;
      }
      const p = document.createElement("p");
      renderInline(paraBuf.join("\n"), p);
      frag.appendChild(p);
    }
    return frag;
  }

  function appendBlock(className, text) {
    const stick = isAtBottom();
    const div = document.createElement("div");
    div.className = className;
    if (className === "msg-assistant") {
      div.classList.add("markdown");
      div.appendChild(renderMarkdown(text || ""));
    } else {
      div.textContent = text;
    }
    logEl.appendChild(div);
    maybeScroll(stick);
    return div;
  }

  /**
   * @param {"user" | "assistant"} role
   * @param {string} text
   * @returns {HTMLDivElement}
   */
  function appendChatBubble(role, text) {
    const stick = isAtBottom();
    const raw = text ?? "";
    const row = document.createElement("div");
    row.className = `msg-row msg-row-${role}`;
    row.dataset.msgId = nextMsgDomId();
    if (role === "user") {
      row.dataset.userPlain = raw;
    }

    const body = document.createElement("div");
    body.className =
      role === "assistant" ? "msg-assistant markdown" : "msg-user";

    if (role === "user") {
      const pref = document.createElement("span");
      pref.className = "msg-user-prefix";
      pref.textContent = "▸ ";
      const span = document.createElement("span");
      span.className = "msg-user-body";
      span.textContent = raw;
      body.appendChild(pref);
      body.appendChild(span);
    } else {
      body.dataset.raw = raw;
      body.appendChild(renderMarkdown(raw || ""));
    }

    row.appendChild(body);
    row.appendChild(buildMessageFooter(role, body, row));
    appendLogBeforeLoader(row);
    maybeScroll(stick);
    return row;
  }

  /**
   * Enveloppe une bulle assistant terminée (hors `.msg-row`) pour ajouter le footer.
   * @param {HTMLDivElement} bubbleEl
   */
  function promoteAssistantToRow(bubbleEl) {
    if (!bubbleEl || !bubbleEl.parentElement) {
      return;
    }
    const existingRow = bubbleEl.closest(".msg-row");
    if (existingRow) {
      if (!existingRow.querySelector(".msg-footer")) {
        existingRow.appendChild(
          buildMessageFooter(
            "assistant",
            bubbleEl,
            /** @type {HTMLDivElement} */ (existingRow),
          ),
        );
      }
      return;
    }
    const row = document.createElement("div");
    row.className = "msg-row msg-row-assistant";
    row.dataset.msgId = nextMsgDomId();
    const parent = bubbleEl.parentElement;
    parent.insertBefore(row, bubbleEl);
    row.appendChild(bubbleEl);
    row.appendChild(buildMessageFooter("assistant", bubbleEl, row));
  }

  /**
   * @param {"user" | "assistant"} role
   * @param {HTMLElement} bodyEl
   * @param {HTMLDivElement} rowEl
   */
  function buildMessageFooter(role, bodyEl, rowEl) {
    const footer = document.createElement("div");
    footer.className = "msg-footer";
    footer.setAttribute("role", "toolbar");
    footer.setAttribute("aria-label", "Actions sur le message");

    /**
     * @param {string} icon
     * @param {string} label
     * @param {() => void} onClick
     */
    function iconBtn(icon, label, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "msg-footer-btn";
      b.textContent = icon;
      b.title = label;
      b.setAttribute("aria-label", label);
      b.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        onClick();
      });
      return b;
    }

    footer.appendChild(
      iconBtn("📋", "Copier le texte", () => {
        void copyPlainMessage(role, bodyEl, rowEl);
      }),
    );

    footer.appendChild(
      iconBtn("↩", "Citer dans le composer", () => {
        insertQuoteIntoComposer(rowEl, role, bodyEl);
      }),
    );

    if (role === "user") {
      footer.appendChild(
        iconBtn("🔁", "Relancer dans le composer", () => {
          fillComposerFromUserRow(rowEl);
        }),
      );
    } else {
      footer.appendChild(
        iconBtn("❮", "Réutiliser la question précédente", () => {
          fillComposerFromPreviousUser(rowEl);
        }),
      );
    }

    const details = document.createElement("details");
    details.className = "msg-footer-details";
    const summary = document.createElement("summary");
    summary.className = "msg-footer-btn msg-footer-summary";
    summary.textContent = "⋯";
    summary.title = "Plus d’actions";
    summary.setAttribute("aria-label", "Plus d’actions sur le message");
    details.appendChild(summary);

    const menu = document.createElement("div");
    menu.className = "msg-footer-menu";
    menu.addEventListener("click", (e) => e.stopPropagation());

    const closeMenu = () => {
      details.open = false;
    };

    /**
     * @param {string} label
     * @param {() => void} onClick
     */
    function menuBtn(label, onClick) {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "msg-footer-menu-item";
      b.textContent = label;
      b.addEventListener("click", (e) => {
        e.preventDefault();
        onClick();
      });
      return b;
    }

    if (role === "assistant") {
      menu.appendChild(
        menuBtn("Copier le Markdown source", () => {
          void copyAssistantMarkdownSource(bodyEl);
          closeMenu();
        }),
      );
      menu.appendChild(
        menuBtn("Copier les blocs de code", () => {
          void copyAssistantCodeBlocks(bodyEl);
          closeMenu();
        }),
      );
    }

    menu.appendChild(
      menuBtn("Insérer dans le composer (sans envoyer)", () => {
        insertPlainIntoComposer(role, bodyEl, rowEl);
        closeMenu();
      }),
    );

    details.appendChild(menu);
    footer.appendChild(details);
    return footer;
  }

  /**
   * @param {"user" | "assistant"} role
   * @param {HTMLElement} bodyEl
   * @param {HTMLDivElement} rowEl
   */
  async function copyPlainMessage(role, bodyEl, rowEl) {
    let t = "";
    if (role === "user") {
      t = (rowEl.dataset.userPlain || "").trim();
      if (!t) {
        const span = bodyEl.querySelector(".msg-user-body");
        t = (span?.textContent || bodyEl.textContent || "").trim();
      }
    } else {
      t = (bodyEl.innerText || "").trim();
    }
    if (!t) {
      return;
    }
    try {
      await navigator.clipboard.writeText(t);
    } catch {
      /* webview sans clipboard */
    }
  }

  /** @param {HTMLElement} bodyEl */
  async function copyAssistantMarkdownSource(bodyEl) {
    const raw = (bodyEl.dataset.raw || "").trim();
    if (!raw) {
      return;
    }
    try {
      await navigator.clipboard.writeText(raw);
    } catch {
      /* ignore */
    }
  }

  /** @param {HTMLElement} bodyEl */
  async function copyAssistantCodeBlocks(bodyEl) {
    const raw = (bodyEl.dataset.raw || "").trim();
    if (!raw) {
      return;
    }
    const re = /```[^\n]*\n([\s\S]*?)```/g;
    const parts = [];
    let m;
    while ((m = re.exec(raw)) !== null) {
      parts.push(m[1].trimEnd());
    }
    const out = parts.join("\n\n---\n\n");
    if (!out) {
      return;
    }
    try {
      await navigator.clipboard.writeText(out);
    } catch {
      /* ignore */
    }
  }

  /**
   * @param {"user" | "assistant"} role
   * @param {HTMLElement} bodyEl
   * @param {HTMLDivElement} rowEl
   */
  function insertQuoteIntoComposer(rowEl, role, bodyEl) {
    const id = rowEl.dataset.msgId || "?";
    let plain = "";
    if (role === "user") {
      plain = (rowEl.dataset.userPlain || "").trim();
      if (!plain) {
        const span = bodyEl.querySelector(".msg-user-body");
        plain = (span?.textContent || "").trim();
      }
    } else {
      plain = (bodyEl.dataset.raw || bodyEl.innerText || "").trim();
    }
    if (!plain) {
      return;
    }
    const lines = plain.split(/\r?\n/);
    const quoted = lines.map((l) => "> " + l).join("\n");
    const block = `[Réf. @${id}]\n${quoted}\n\n`;
    insertAtCursor(promptEl, block);
    promptEl.focus();
    autoresize();
  }

  /**
   * @param {"user" | "assistant"} role
   * @param {HTMLElement} bodyEl
   * @param {HTMLDivElement} rowEl
   */
  function insertPlainIntoComposer(role, bodyEl, rowEl) {
    let plain = "";
    if (role === "user") {
      plain = (rowEl.dataset.userPlain || "").trim();
      if (!plain) {
        const span = bodyEl.querySelector(".msg-user-body");
        plain = (span?.textContent || "").trim();
      }
    } else {
      plain = (bodyEl.dataset.raw || bodyEl.innerText || "").trim();
    }
    if (!plain) {
      return;
    }
    const v = promptEl.value;
    const prefix =
      v.length > 0 && !v.endsWith("\n") && !v.endsWith("\n\n") ? "\n\n" : "";
    insertAtCursor(promptEl, prefix + plain + "\n");
    promptEl.focus();
    autoresize();
  }

  /** @param {HTMLTextAreaElement} ta @param {string} text */
  function insertAtCursor(ta, text) {
    const start = ta.selectionStart ?? ta.value.length;
    const end = ta.selectionEnd ?? ta.value.length;
    const v = ta.value;
    ta.value = v.slice(0, start) + text + v.slice(end);
    const newPos = start + text.length;
    ta.setSelectionRange(newPos, newPos);
  }

  /**
   * Préremplit le composer sans envoyer (§2.19 — diagnostic éditeur).
   * @param {string} text
   * @param {{ replace?: boolean }} [opts]
   */
  function prefillComposer(text, opts = {}) {
    const t = (text || "").trim();
    if (!t) {
      return;
    }
    if (opts.replace) {
      promptEl.value = t;
      placeCaretAtEnd();
    } else {
      const v = promptEl.value;
      const prefix =
        v.length > 0 && !v.endsWith("\n") && !v.endsWith("\n\n") ? "\n\n" : "";
      const suffix = t.endsWith("\n") ? "" : "\n";
      insertAtCursor(promptEl, prefix + t + suffix);
    }
    promptEl.focus();
    autoresize();
    updateComposerChrome();
  }

  /** @param {HTMLDivElement} rowEl */
  function fillComposerFromUserRow(rowEl) {
    const t = (rowEl.dataset.userPlain || "").trim();
    if (!t) {
      return;
    }
    promptEl.value = t;
    placeCaretAtEnd();
    autoresize();
    promptEl.focus();
  }

  /** @param {HTMLDivElement} fromRow */
  function fillComposerFromPreviousUser(fromRow) {
    const t = findPreviousUserPlain(fromRow).trim();
    if (!t) {
      return;
    }
    promptEl.value = t;
    placeCaretAtEnd();
    autoresize();
    promptEl.focus();
  }

  /** @param {HTMLDivElement} fromRow */
  function findPreviousUserPlain(fromRow) {
    let n = fromRow.previousElementSibling;
    while (n) {
      if (
        n instanceof HTMLElement &&
        n.classList.contains("msg-row-user")
      ) {
        const body = n.querySelector(".msg-user-body");
        return body ? body.textContent || "" : n.textContent || "";
      }
      n = n.previousElementSibling;
    }
    return "";
  }

  // Sprint M1 — chip discret « Session archivée » émis à la fin d'un run
  // non trivial. Cliquable : ouvre le .md via la commande VS Code standard
  // (revealed dans l'éditeur). Le slug + l'objectif courts sont affichés
  // pour donner du contexte sans noyer le fil.
  function appendMemoryChip(payload) {
    const stick = isAtBottom();
    const div = document.createElement("div");
    div.className = "msg-memory-chip";

    const icon = document.createElement("span");
    icon.className = "memory-chip-icon";
    icon.textContent = "◌";
    div.appendChild(icon);

    const label = document.createElement("span");
    label.className = "memory-chip-label";
    label.textContent = "Session archivée";
    div.appendChild(label);

    const slug = String(payload?.slug ?? "");
    const objective = String(payload?.objective ?? "").trim();
    const path = String(payload?.path ?? "");
    const summary = objective ? `${slug} — ${objective}` : slug;

    const text = document.createElement("span");
    text.className = "memory-chip-text";
    text.textContent = summary;
    div.appendChild(text);

    if (path) {
      const link = document.createElement("a");
      link.className = "memory-chip-link";
      link.textContent = "ouvrir";
      link.href = "#";
      link.title = path;
      link.addEventListener("click", (e) => {
        e.preventDefault();
        // `openFile` accepte déjà un chemin absolu côté chatView.ts
        // (cf. openWorkspaceFile) — pas besoin d'un nouveau handler.
        vscode.postMessage({ type: "openFile", filePath: path });
      });
      div.appendChild(link);
    }
    logEl.appendChild(div);
    maybeScroll(stick);
    return div;
  }

  // --- Protocole de phases (Sprint A) ----------------------------------------

  /**
   * Métadonnées d'affichage pour chaque phase. L'icône est volontairement
   * unicode (pas de SVG) pour rester cohérent avec le ton sobre du chat.
   */
  const PHASE_META = {
    reasoning: { label: "Reasoning", icon: "🧠" },
    internal_reasoning: { label: "Raisonnement natif", icon: "🧠" },
    analyzing: { label: "Analyse du dépôt", icon: "🗺️" },
    reading: { label: "Reading", icon: "📖" },
    clarifying: { label: "Clarifying", icon: "❓" },
    planning: { label: "Planning", icon: "🗺" },
    "next-move": { label: "Next move", icon: "▸" },
    acting: { label: "Acting", icon: "⚙" },
    testing: { label: "Testing", icon: "🧪" },
    verifying: { label: "Verifying", icon: "✓" },
    answering: { label: "Answering", icon: "💬" },
    done: { label: "Done", icon: "✅" },
  };

  /** Insère un nœud à la fin du log mais avant le loader « … » si présent. */
  function appendLogBeforeLoader(node) {
    if (loaderEl && loaderEl.parentElement === logEl) {
      logEl.insertBefore(node, loaderEl);
    } else {
      logEl.appendChild(node);
    }
  }

  /**
   * Termine la phase active. On retire le `streaming` (plus de point
   * pulsant) mais on **garde le `<details>` ouvert** pour que l'utilisateur
   * voie le contenu intégral des étapes précédentes dans le fil de
   * discussion (il peut toujours cliquer le summary pour replier).
   *
   * Cas particulier : si la phase n'a **rien** reçu (marqueur annoncé
   * mais aucun texte ni outil derrière), on retire purement et simplement
   * le bloc du DOM — un cadre vide qui ne dit rien parasite le fil.
   *
   * N'altère pas la bulle assistant principale.
   */
  function closeCurrentPhase() {
    if (currentPhaseEl) {
      currentPhaseEl.classList.remove("streaming");
      const body = currentPhaseBodyEl;
      const isEmpty =
        body !== null &&
        body.childElementCount === 0 &&
        body.textContent.trim() === "";
      if (isEmpty && currentPhaseEl.parentElement) {
        currentPhaseEl.remove();
      } else if (currentPhase === "reading" || currentPhase === "analyzing") {
        // Anti-régression « verdict final écrit dans `[phase: reading]`
        // puis répété dans `[phase: answering]` » : le prompt promet au
        // modèle que `reading` est une **trace repliée** que l'utilisateur
        // ne lit pas, et le moteur (`MISSING_ANSWERING_PROMPT`) le force
        // à re-rédiger dans `answering` si la première version atterrit
        // dans `reading`. Si on laisse le bloc déplié à la clôture,
        // l'utilisateur voit la réponse en double. On replie donc
        // automatiquement `reading` quand on en sort (un clic suffit
        // pour relire le contenu si besoin, c'est le comportement
        // historique pré-A.5).
        currentPhaseEl.open = false;
      }
      currentPhaseEl = null;
      currentPhaseBodyEl = null;
    }
    currentPhase = null;
  }

  /**
   * Ouvre un nouveau bloc collapsible pour une phase non-done.
   *
   * Toutes les phases internes (`planning` / `verifying` / `reading` /
   * `acting` / `clarifying`) sont
   * des **frères** sur `logEl` : plus de conteneur parent « Réflexion » qui
   * les imbriquait visuellement.
   *
   * @param {string} phase
   * @returns {HTMLElement} corps du bloc (où injecter texte/tools)
   */
  function openPhaseBlock(phase) {
    const stick = isAtBottom();
    const meta = PHASE_META[phase] ?? { label: phase, icon: "•" };
    const details = document.createElement("details");
    details.className = `phase-block phase-${phase} streaming`;
    // Ouvert pendant le streaming **et** une fois la phase terminée : on
    // garde la phase visible dans le fil de discussion pour que l'utilisateur
    // puisse lire le raisonnement / les actions a posteriori. Replier la
    // phase reste possible d'un clic sur le summary.
    details.open = true;
    const summary = document.createElement("summary");
    summary.className = "phase-summary";
    const ic = document.createElement("span");
    ic.className = "phase-icon";
    ic.textContent = meta.icon;
    const lab = document.createElement("span");
    lab.className = "phase-label";
    lab.textContent = meta.label;
    summary.appendChild(ic);
    summary.appendChild(lab);
    details.appendChild(summary);
    const body = document.createElement("div");
    body.className = "phase-body";
    details.appendChild(body);
    appendLogBeforeLoader(details);
    maybeScroll(stick);
    currentPhase = phase;
    currentPhaseEl = details;
    currentPhaseBodyEl = body;
    return body;
  }

  /**
   * Reçoit un `phase_enter` du moteur. Stratégie (Sprint A.2) :
   *
   * - `done` : silent close — on ferme la phase courante. Aucun bloc
   *   « ✅ Done » visible. C'est le moteur qui s'arrête.
   * - `answering` : pivot UI — la suite des deltas va dans une bulle
   *   assistant standard (Markdown plein).
   * - autre : on ferme l'éventuelle phase ouverte et on en ouvre une
   *   nouvelle sur `logEl` (toutes les phases sont des blocs frères).
   *
   * @param {string} phase
   */
  function enterPhase(phase) {
    // Garde-fou : si le moteur émet deux fois la même phase à la suite
    // (cas Devstral / Gemma qui ponctuent leur prose avec `[phase: X]`),
    // on garde le bloc actif au lieu d'en créer un nouveau quasi-vide. La
    // dedup est aussi faite côté moteur (`consume_stream`), c'est de la
    // défense en profondeur.
    if (phase === currentPhase && currentPhaseEl) {
      return;
    }
    finalizeAssistant();
    hideLoader();
    if (phase === "done" || phase === "answering") {
      // Done = fin silencieuse. Answering = bascule en réponse finale,
      // contenu suivant en bulle assistant standard (hors trace).
      // `closeCurrentPhase()` remet `currentPhase` / `currentPhaseEl` /
      // `currentPhaseBodyEl` à null, donc `currentContainer()` retombera
      // automatiquement sur `logEl`.
      closeCurrentPhase();
      return;
    }
    closeCurrentPhase();
    openPhaseBlock(phase);
  }

  /**
   * Container cible courant pour le texte ou les outils.
   * Hors d'une phase non-done → `logEl` (comportement historique).
   */
  function currentContainer() {
    return currentPhaseBodyEl ?? logEl;
  }

  function showLoader() {
    if (loaderEl) return;
    const stick = isAtBottom();
    loaderEl = document.createElement("div");
    loaderEl.className = "msg-loader";
    loaderEl.setAttribute("aria-label", "Drox réfléchit");
    const dots = document.createElement("span");
    dots.className = "dots";
    dots.innerHTML = "<span></span><span></span><span></span>";
    loaderEl.appendChild(dots);
    logEl.appendChild(loaderEl);
    maybeScroll(stick);
  }

  function hideLoader() {
    if (loaderEl) {
      loaderEl.remove();
      loaderEl = null;
    }
  }

  /** Affiche / met à jour le texte d'état dans la status bar. */
  function setStatusState(text) {
    if (!text) {
      statusStateEl.setAttribute("hidden", "");
      statusStateText.textContent = "";
      return;
    }
    statusStateEl.removeAttribute("hidden");
    statusStateText.textContent = text;
  }

  /** Active / désactive les indicateurs globaux de run en cours. */
  function setRunActive(active) {
    if (progressEl) {
      if (active) {
        progressEl.removeAttribute("hidden");
      } else {
        progressEl.setAttribute("hidden", "");
      }
    }
    if (active) {
      refreshStatusState();
    } else {
      activeToolNames.clear();
      setStatusState("");
    }
  }

  /** Recalcule le libellé d'état en fonction des outils en cours. */
  function refreshStatusState() {
    if (!busy) {
      setStatusState("");
      return;
    }
    if (activeToolNames.size > 0) {
      const names = Array.from(activeToolNames.values());
      const main = names[names.length - 1];
      const more = names.length > 1 ? ` (+${names.length - 1})` : "";
      setStatusState(`Drox utilise ${main}${more}…`);
    } else {
      setStatusState("Drox réfléchit…");
    }
  }

  /**
   * Crée (si besoin) le bloc assistant streaming, accumule le texte brut
   * dans `dataset.raw`, puis re-rend le markdown complet. Re-rendre à chaque
   * delta est plus simple et plus correct qu'un parser incrémental (un
   * pattern markdown peut chevaucher deux deltas).
   */
  function appendDelta(text) {
    if (!text) return;
    hideLoader();
    const stick = isAtBottom();
    const container = currentContainer();
    if (!assistantEl || assistantEl.parentElement !== container) {
      assistantEl = document.createElement("div");
      assistantEl.className = "msg-assistant streaming markdown";
      assistantEl.dataset.raw = "";
      container.appendChild(assistantEl);
    }
    assistantEl.dataset.raw = (assistantEl.dataset.raw || "") + text;
    while (assistantEl.firstChild) {
      assistantEl.removeChild(assistantEl.firstChild);
    }
    assistantEl.appendChild(renderMarkdown(assistantEl.dataset.raw));
    // Si on est dans la phase de réflexion (cadre à hauteur fixée par CSS),
    // on auto-scroll le corps vers le bas pour que les nouvelles pensées
    // restent visibles, comme Cursor.
    if (
      currentPhaseBodyEl &&
      currentPhaseEl &&
      currentPhaseEl.classList.contains("streaming") &&
      (currentPhase === "reasoning" ||
        currentPhase === "internal_reasoning" ||
        currentPhase === "planning" ||
        currentPhase === "verifying")
    ) {
      currentPhaseBodyEl.scrollTop = currentPhaseBodyEl.scrollHeight;
    }
    maybeScroll(stick);
  }

  /** Termine le bloc assistant en cours (retire le caret de streaming). */
  function finalizeAssistant() {
    if (assistantEl) {
      assistantEl.classList.remove("streaming");
      promoteAssistantToRow(assistantEl);
      assistantEl = null;
    }
  }

  /** Map id de tool → DOM <details> existant (pour fusionner start + finish). */
  const toolBlocks = new Map();

  /**
   * Construit le DOM des lignes de diff (style "Cursor") à partir d'une
   * diff unifiée. Si pas de diff (file_write d'un fichier neuf), on rend
   * `content` comme tout-ajouté.
   *
   * @param {string} diff
   * @param {string} content
   * @returns {DocumentFragment}
   */
  function renderDiffLines(diff, content) {
    const frag = document.createDocumentFragment();

    if (diff && diff.length > 0) {
      const lines = diff.split(/\r?\n/);
      for (const raw of lines) {
        // On ignore les en-têtes générés par la lib `diff` côté Rust/TS.
        if (
          raw.startsWith("--- ") ||
          raw.startsWith("+++ ") ||
          raw.startsWith("Index: ") ||
          raw.startsWith("==========")
        ) {
          continue;
        }
        const line = document.createElement("div");
        if (raw.startsWith("@@")) {
          line.className = "diff-line diff-hunk";
          line.textContent = raw;
        } else if (raw.startsWith("+") && !raw.startsWith("++")) {
          line.className = "diff-line diff-add";
          line.textContent = raw;
        } else if (raw.startsWith("-") && !raw.startsWith("--")) {
          line.className = "diff-line diff-rem";
          line.textContent = raw;
        } else if (raw.length === 0) {
          line.className = "diff-line diff-ctx";
          line.textContent = " ";
        } else {
          line.className = "diff-line diff-ctx";
          line.textContent = raw;
        }
        frag.appendChild(line);
      }
      return frag;
    }

    if (content && content.length > 0) {
      // file_write : pas de diff disponible — on affiche le nouveau contenu
      // comme entièrement ajouté.
      for (const raw of content.split(/\r?\n/)) {
        const line = document.createElement("div");
        line.className = "diff-line diff-add";
        line.textContent = "+" + raw;
        frag.appendChild(line);
      }
      return frag;
    }

    const empty = document.createElement("div");
    empty.className = "diff-line diff-ctx";
    empty.textContent = "(aucun changement visible)";
    frag.appendChild(empty);
    return frag;
  }

  function appendFileChange(payload) {
    if (replayingHistory) {
      return;
    }
    const stick = isAtBottom();
    const filePath = String(payload.path ?? "");
    const relPath = String(payload.relPath ?? payload.path ?? "?");
    const op = payload.op === "write" ? "écrit" : "édité";
    const added = Number(payload.added ?? 0);
    const removed = Number(payload.removed ?? 0);
    const language = String(payload.language ?? "plaintext");

    const details = document.createElement("details");
    details.className = "msg-file-change";
    details.open = true;
    details.dataset.path = filePath;

    const summary = document.createElement("summary");
    summary.className = "fc-summary";

    const icon = document.createElement("span");
    icon.className = "fc-icon";
    icon.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6"></path>' +
      '<path d="M9 2v4h4"></path></svg>';

    const opLabel = document.createElement("span");
    opLabel.className = "fc-op";
    opLabel.textContent = op;

    const name = document.createElement("span");
    name.className = "fc-path";
    name.textContent = relPath;
    name.title = filePath;

    const stats = document.createElement("span");
    stats.className = "fc-stats";
    if (added > 0) {
      const a = document.createElement("span");
      a.className = "fc-add";
      a.textContent = `+${added}`;
      stats.appendChild(a);
    }
    if (removed > 0) {
      const r = document.createElement("span");
      r.className = "fc-rem";
      r.textContent = `-${removed}`;
      stats.appendChild(r);
    }

    const spacer = document.createElement("span");
    spacer.className = "fc-spacer";

    const openBtn = document.createElement("button");
    openBtn.type = "button";
    openBtn.className = "fc-open";
    openBtn.title = "Ouvrir dans l'éditeur";
    openBtn.innerHTML =
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M5 11l6-6"></path>' +
      '<path d="M6 5h5v5"></path></svg>';
    openBtn.addEventListener("click", (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
      if (filePath) {
        vscode.postMessage({ type: "openFile", filePath });
      }
    });

    summary.appendChild(icon);
    summary.appendChild(opLabel);
    summary.appendChild(name);
    if (stats.childElementCount > 0) {
      summary.appendChild(stats);
    }
    summary.appendChild(spacer);
    summary.appendChild(openBtn);
    details.appendChild(summary);

    const body = document.createElement("div");
    body.className = "fc-body";
    const pre = document.createElement("pre");
    pre.className = `fc-diff lang-${language}`;
    pre.appendChild(
      renderDiffLines(
        typeof payload.diff === "string" ? payload.diff : "",
        typeof payload.content === "string" ? payload.content : "",
      ),
    );
    body.appendChild(pre);
    details.appendChild(body);

    logEl.appendChild(details);
    maybeScroll(stick);
  }

  // --- Bloc to-do list (output du tool `todo_write`) ---

  /**
   * Mappe un statut Drox vers une icône texte / classe CSS dédiée.
   * Pas de SVG : on garde le bloc léger et toujours lisible.
   */
  const TODO_STATUS_META = {
    pending: { icon: "○", label: "À faire", cls: "todo-pending" },
    in_progress: { icon: "◐", label: "En cours", cls: "todo-progress" },
    completed: { icon: "✓", label: "Terminé", cls: "todo-done" },
    cancelled: { icon: "⊘", label: "Annulé", cls: "todo-cancel" },
  };

  /** Compte les items par statut. */
  function countTodos(items) {
    const c = { pending: 0, in_progress: 0, completed: 0, cancelled: 0 };
    for (const t of items) {
      if (c[t.status] != null) c[t.status]++;
    }
    return c;
  }

  /**
   * Crée (ou réutilise) le bloc to-do dans le log et le remplit avec les
   * items reçus. Un seul bloc par conversation : c'est l'UX "carte qui
   * s'update" inspirée de Cursor. Met aussi à jour le sticky compact.
   */
  function renderTodos(items) {
    if (!Array.isArray(items) || items.length === 0) {
      hideTodoSticky();
      return;
    }
    finalizeAssistant();
    hideLoader();
    const stick = isAtBottom();

    let block = currentTodoBlockEl;
    if (!block || !block.isConnected) {
      block = document.createElement("div");
      block.className = "msg-todos";
      const head = document.createElement("div");
      head.className = "todos-head";
      const title = document.createElement("span");
      title.className = "todos-title";
      title.textContent = "Plan de la tâche";
      head.appendChild(title);
      const counter = document.createElement("span");
      counter.className = "todos-counter";
      head.appendChild(counter);
      block.appendChild(head);
      const list = document.createElement("ul");
      list.className = "todos-list";
      block.appendChild(list);
      logEl.appendChild(block);
      currentTodoBlockEl = block;
    }

    const counter = block.querySelector(".todos-counter");
    const list = block.querySelector(".todos-list");
    const counts = countTodos(items);
    const done = counts.completed + counts.cancelled;
    if (counter) {
      counter.textContent = `${done} / ${items.length}`;
    }
    if (list) {
      list.innerHTML = "";
      for (const t of items) {
        const meta = TODO_STATUS_META[t.status] || TODO_STATUS_META.pending;
        const li = document.createElement("li");
        li.className = `todo-item ${meta.cls}`;
        li.setAttribute("data-id", t.id);
        const ic = document.createElement("span");
        ic.className = "todo-ic";
        ic.textContent = meta.icon;
        ic.setAttribute("title", meta.label);
        const txt = document.createElement("span");
        txt.className = "todo-text";
        txt.textContent = t.content;
        li.appendChild(ic);
        li.appendChild(txt);
        list.appendChild(li);
      }
    }

    maybeScroll(stick);
    updateTodoSticky(items, counts);
  }

  /**
   * Sprint Plan UI — le sticky reste **toujours visible** dès qu'au moins
   * un `todo_write` a été reçu dans le run courant (même quand 100 % des
   * items sont `completed`). Deux modes :
   * - **compact** (par défaut) : étape `in_progress` courante OU
   *   « Plan terminé » + compteur done/total ;
   * - **expanded** : mini-liste complète des items (id + statut + content)
   *   directement dans le sticky.
   * Clic = bascule entre les deux modes (toggle).
   */
  let stickyExpanded = false;
  /** @type {{items: any[], counts: any} | null} */
  let stickySnapshot = null;

  function updateTodoSticky(items, counts) {
    if (!stickyTodoEl) return;
    stickySnapshot = { items, counts };
    renderTodoSticky();
  }

  function renderTodoSticky() {
    if (!stickyTodoEl || !stickySnapshot) return;
    const { items, counts } = stickySnapshot;
    if (!items || items.length === 0) {
      hideTodoSticky();
      return;
    }
    stickyTodoEl.innerHTML = "";
    stickyTodoEl.classList.toggle("expanded", stickyExpanded);
    stickyTodoEl.classList.toggle("compact", !stickyExpanded);
    if (stickyExpanded) {
      renderStickyExpanded(items, counts);
    } else {
      renderStickyCompact(items, counts);
    }
    stickyTodoEl.hidden = false;
    stickyTodoEl.setAttribute("aria-expanded", stickyExpanded ? "true" : "false");
  }

  function renderStickyCompact(items, counts) {
    const inProgress = items.find((t) => t.status === "in_progress");
    const active = counts.pending + counts.in_progress;
    const done = counts.completed + counts.cancelled;
    const allDone = active === 0;
    const label = inProgress
      ? inProgress.content
      : allDone
        ? "Plan terminé"
        : `${counts.pending} étape${counts.pending > 1 ? "s" : ""} à faire`;
    const ic = document.createElement("span");
    ic.className = "sticky-ic";
    ic.textContent = inProgress ? "◐" : allDone ? "✓" : "○";
    const txt = document.createElement("span");
    txt.className = "sticky-text";
    txt.textContent = label;
    const ctr = document.createElement("span");
    ctr.className = "sticky-counter";
    ctr.textContent = `${done}/${items.length}`;
    const chev = document.createElement("span");
    chev.className = "sticky-chevron";
    chev.textContent = "▾";
    chev.title = "Déplier le plan";
    stickyTodoEl.appendChild(ic);
    stickyTodoEl.appendChild(txt);
    stickyTodoEl.appendChild(ctr);
    stickyTodoEl.appendChild(chev);
  }

  function renderStickyExpanded(items, counts) {
    const header = document.createElement("div");
    header.className = "sticky-expanded-header";
    const title = document.createElement("span");
    title.className = "sticky-text";
    const allDone = counts.pending + counts.in_progress === 0;
    title.textContent = allDone ? "Plan terminé" : "Plan en cours";
    const done = counts.completed + counts.cancelled;
    const ctr = document.createElement("span");
    ctr.className = "sticky-counter";
    ctr.textContent = `${done}/${items.length}`;
    const chev = document.createElement("span");
    chev.className = "sticky-chevron";
    chev.textContent = "▴";
    chev.title = "Réduire à l'étape courante";
    header.appendChild(title);
    header.appendChild(ctr);
    header.appendChild(chev);
    stickyTodoEl.appendChild(header);

    const list = document.createElement("ol");
    list.className = "sticky-list";
    for (const item of items) {
      const li = document.createElement("li");
      li.className = `sticky-li sticky-li-${item.status}`;
      const ic = document.createElement("span");
      ic.className = "sticky-li-ic";
      ic.textContent =
        item.status === "completed"
          ? "✓"
          : item.status === "in_progress"
            ? "◐"
            : item.status === "cancelled"
              ? "⊘"
              : "○";
      const tx = document.createElement("span");
      tx.className = "sticky-li-text";
      tx.textContent = item.content;
      li.appendChild(ic);
      li.appendChild(tx);
      list.appendChild(li);
    }
    stickyTodoEl.appendChild(list);
  }

  function hideTodoSticky() {
    if (!stickyTodoEl) return;
    stickyTodoEl.hidden = true;
    stickyTodoEl.innerHTML = "";
    stickyTodoEl.classList.remove("expanded", "compact");
    stickyTodoEl.setAttribute("aria-expanded", "false");
  }

  // --- Sticky dernier message utilisateur (§2.24) ---

  /** @type {{ text: string, meta?: string, fullText: string, messageId?: string } | null} */
  let userPromptStickySnapshot = null;
  let userPromptStickyPendingLink = false;

  /**
   * @param {{ text?: string, meta?: string, fullText?: string }} payload
   */
  function setUserPromptSticky(payload) {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text) {
      hideUserPromptSticky();
      return;
    }
    userPromptStickySnapshot = {
      text,
      meta:
        typeof payload.meta === "string" && payload.meta.trim()
          ? payload.meta.trim()
          : undefined,
      fullText:
        typeof payload.fullText === "string" && payload.fullText.trim()
          ? payload.fullText.trim()
          : text,
      messageId: userPromptStickySnapshot?.messageId,
    };
    userPromptStickyPendingLink = true;
    renderUserPromptSticky();
  }

  /**
   * @param {string | undefined} messageId
   */
  function linkUserPromptStickyToMessage(messageId) {
    if (!userPromptStickySnapshot || !messageId) {
      return;
    }
    userPromptStickySnapshot.messageId = messageId;
    userPromptStickyPendingLink = false;
    renderUserPromptSticky();
  }

  function renderUserPromptSticky() {
    if (!stickyUserPromptEl || !userPromptStickySnapshot) {
      return;
    }
    const { text, meta, fullText } = userPromptStickySnapshot;
    stickyUserPromptEl.innerHTML = "";
    stickyUserPromptEl.title = fullText || text;

    const ic = document.createElement("span");
    ic.className = "sticky-ic";
    ic.textContent = "▸";
    ic.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "sticky-body";

    const txt = document.createElement("span");
    txt.className = "sticky-text";
    txt.textContent = text;
    body.appendChild(txt);

    if (meta) {
      const metaEl = document.createElement("span");
      metaEl.className = "sticky-meta";
      metaEl.textContent = meta;
      body.appendChild(metaEl);
    }

    const jump = document.createElement("span");
    jump.className = "sticky-jump";
    jump.textContent = "↗";
    jump.title = "Voir dans le fil";

    stickyUserPromptEl.appendChild(ic);
    stickyUserPromptEl.appendChild(body);
    stickyUserPromptEl.appendChild(jump);
    stickyUserPromptEl.hidden = false;
  }

  function hideUserPromptSticky() {
    if (!stickyUserPromptEl) {
      return;
    }
    stickyUserPromptEl.hidden = true;
    stickyUserPromptEl.innerHTML = "";
    stickyUserPromptEl.removeAttribute("title");
    userPromptStickySnapshot = null;
    userPromptStickyPendingLink = false;
  }

  /**
   * @param {HTMLDivElement} row
   */
  function flashUserMessageRow(row) {
    row.classList.add("msg-row-highlight");
    window.setTimeout(() => {
      row.classList.remove("msg-row-highlight");
    }, 1800);
  }

  function scrollToUserPromptMessage() {
    const id = userPromptStickySnapshot?.messageId;
    if (!id) {
      return;
    }
    const row = logEl.querySelector(
      `.msg-row-user[data-msg-id="${CSS.escape(id)}"]`,
    );
    if (!(row instanceof HTMLDivElement)) {
      return;
    }
    row.scrollIntoView({ behavior: "smooth", block: "center" });
    flashUserMessageRow(row);
  }

  // --- Objectif verrouillé du run (§2.25) ---

  /** @type {string | null} */
  let runObjectiveSnapshot = null;
  let scopeParkingExpanded = false;

  /**
   * @param {{ text?: string }} payload
   */
  function setRunObjectiveSticky(payload) {
    const text = typeof payload.text === "string" ? payload.text.trim() : "";
    if (!text || !stickyRunObjectiveEl) {
      hideRunObjectiveSticky();
      return;
    }
    runObjectiveSnapshot = text;
    stickyRunObjectiveEl.innerHTML = "";
    stickyRunObjectiveEl.title = text;

    const ic = document.createElement("span");
    ic.className = "sticky-ic";
    ic.textContent = "◎";
    ic.setAttribute("aria-hidden", "true");

    const body = document.createElement("div");
    body.className = "sticky-body";

    const label = document.createElement("span");
    label.className = "sticky-meta";
    label.textContent = "Objectif du run";

    const txt = document.createElement("span");
    txt.className = "sticky-text";
    txt.textContent =
      text.length > 220 ? `${text.slice(0, 219)}…` : text;

    body.appendChild(label);
    body.appendChild(txt);
    stickyRunObjectiveEl.appendChild(ic);
    stickyRunObjectiveEl.appendChild(body);
    stickyRunObjectiveEl.hidden = false;
  }

  function hideRunObjectiveSticky() {
    runObjectiveSnapshot = null;
    if (!stickyRunObjectiveEl) {
      return;
    }
    stickyRunObjectiveEl.hidden = true;
    stickyRunObjectiveEl.innerHTML = "";
    stickyRunObjectiveEl.removeAttribute("title");
  }

  /**
   * @param {{ items?: Array<{ finding?: string, reason?: string }> }} payload
   */
  function renderScopeParking(payload) {
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (
      !scopeParkingEl ||
      !scopeParkingToggleEl ||
      !scopeParkingListEl
    ) {
      return;
    }
    if (items.length === 0) {
      hideScopeParking();
      return;
    }
    scopeParkingToggleEl.textContent =
      items.length === 1
        ? "1 élément reporté hors scope"
        : `${items.length} éléments reportés hors scope`;
    scopeParkingListEl.innerHTML = "";
    for (const item of items) {
      const finding =
        typeof item.finding === "string" ? item.finding.trim() : "";
      const reason =
        typeof item.reason === "string" ? item.reason.trim() : "";
      if (!finding) {
        continue;
      }
      const li = document.createElement("li");
      li.className = "scope-parking-item";
      const f = document.createElement("span");
      f.className = "scope-parking-finding";
      f.textContent = finding;
      li.appendChild(f);
      if (reason) {
        const r = document.createElement("span");
        r.className = "scope-parking-reason";
        r.textContent = reason;
        li.appendChild(r);
      }
      scopeParkingListEl.appendChild(li);
    }
    scopeParkingEl.hidden = false;
    scopeParkingToggleEl.setAttribute(
      "aria-expanded",
      scopeParkingExpanded ? "true" : "false",
    );
    scopeParkingListEl.hidden = !scopeParkingExpanded;
  }

  function hideScopeParking() {
    scopeParkingExpanded = false;
    if (!scopeParkingEl || !scopeParkingToggleEl || !scopeParkingListEl) {
      return;
    }
    scopeParkingEl.hidden = true;
    scopeParkingToggleEl.setAttribute("aria-expanded", "false");
    scopeParkingListEl.hidden = true;
    scopeParkingListEl.innerHTML = "";
    scopeParkingToggleEl.textContent = "";
  }

  if (scopeParkingToggleEl) {
    scopeParkingToggleEl.addEventListener("click", () => {
      scopeParkingExpanded = !scopeParkingExpanded;
      if (scopeParkingListEl) {
        scopeParkingListEl.hidden = !scopeParkingExpanded;
      }
      scopeParkingToggleEl.setAttribute(
        "aria-expanded",
        scopeParkingExpanded ? "true" : "false",
      );
    });
  }

  // --- Plan de cours (`course_plan_write`, mode Professeur) ---

  const COURSE_STEP_STATUS_META = {
    pending: { icon: "○", label: "À venir", cls: "course-pending" },
    active: { icon: "◐", label: "En cours", cls: "course-active" },
    mastered: { icon: "✓", label: "Maîtrisé", cls: "course-mastered" },
    skipped: { icon: "⊘", label: "Passé", cls: "course-skipped" },
  };

  const COURSE_KIND_LABEL = {
    lesson: "Cours",
    exercise: "Exercice",
    checkpoint: "Contrôle",
  };

  function countCourseSteps(items) {
    const c = { pending: 0, active: 0, mastered: 0, skipped: 0 };
    for (const s of items) {
      if (c[s.status] != null) c[s.status]++;
    }
    return c;
  }

  /**
   * @param {{ courseTitle: string, steps: Array<{id:string,title:string,kind:string,status:string}> }} payload
   */
  function renderCoursePlan(payload) {
    if (!isProfessorMode()) {
      hideCoursePlanSticky();
      return;
    }
    const title =
      typeof payload.courseTitle === "string" ? payload.courseTitle.trim() : "";
    const items = Array.isArray(payload.steps) ? payload.steps : [];
    if (!title || items.length === 0) {
      hideCoursePlanSticky();
      return;
    }
    finalizeAssistant();
    hideLoader();
    const stick = isAtBottom();

    let block = currentCoursePlanBlockEl;
    if (!block || !block.isConnected) {
      block = document.createElement("div");
      block.className = "msg-course-plan";
      const head = document.createElement("div");
      head.className = "course-plan-head";
      const planTitle = document.createElement("span");
      planTitle.className = "course-plan-title";
      planTitle.textContent = "Plan de cours";
      head.appendChild(planTitle);
      const mission = document.createElement("span");
      mission.className = "course-plan-mission";
      head.appendChild(mission);
      const counter = document.createElement("span");
      counter.className = "course-plan-counter";
      head.appendChild(counter);
      block.appendChild(head);
      const list = document.createElement("ul");
      list.className = "course-plan-list";
      block.appendChild(list);
      logEl.appendChild(block);
      currentCoursePlanBlockEl = block;
    }

    const missionEl = block.querySelector(".course-plan-mission");
    const counter = block.querySelector(".course-plan-counter");
    const list = block.querySelector(".course-plan-list");
    if (missionEl) missionEl.textContent = title;
    const counts = countCourseSteps(items);
    const done = counts.mastered + counts.skipped;
    if (counter) {
      counter.textContent = `${done} / ${items.length}`;
    }
    if (list) {
      list.innerHTML = "";
      for (const s of items) {
        const meta =
          COURSE_STEP_STATUS_META[s.status] || COURSE_STEP_STATUS_META.pending;
        const kindLabel = COURSE_KIND_LABEL[s.kind] || s.kind;
        const li = document.createElement("li");
        li.className = `course-step ${meta.cls}`;
        li.setAttribute("data-id", s.id);
        const ic = document.createElement("span");
        ic.className = "course-ic";
        ic.textContent = meta.icon;
        ic.setAttribute("title", meta.label);
        const kind = document.createElement("span");
        kind.className = "course-kind";
        kind.textContent = kindLabel;
        const txt = document.createElement("span");
        txt.className = "course-text";
        txt.textContent = s.title;
        li.appendChild(ic);
        li.appendChild(kind);
        li.appendChild(txt);
        list.appendChild(li);
      }
    }

    maybeScroll(stick);
    updateCoursePlanSticky(title, items, counts);
  }

  /** @type {{ title: string, items: any[], counts: any } | null} */
  let courseStickySnapshot = null;
  let courseStickyExpanded = false;

  function renderCourseCycleBanner(payload) {
    if (!courseCycleBannerEl) {
      return;
    }
    const active = !!payload?.active && isProfessorMode();
    if (!active) {
      courseCycleBannerEl.hidden = true;
      courseCycleBannerEl.replaceChildren();
      return;
    }
    const cycleId =
      typeof payload.cycleId === "string" ? payload.cycleId : "";
    const shortId = cycleId.length > 28 ? `${cycleId.slice(0, 28)}…` : cycleId;
    courseCycleBannerEl.hidden = false;
    courseCycleBannerEl.replaceChildren();
    const text = document.createElement("span");
    text.className = "course-cycle-text";
    text.textContent = `Cycle professeur actif (${shortId || "…"}) — journal .drox/course-cycles/`;
    courseCycleBannerEl.appendChild(text);
    const hint = document.createElement("span");
    hint.className = "course-cycle-hint";
    hint.textContent = "/course_undo · /course_end";
    courseCycleBannerEl.appendChild(hint);
  }

  function updateCoursePlanSticky(title, items, counts) {
    if (!stickyCoursePlanEl) return;
    courseStickySnapshot = { title, items, counts };
    renderCoursePlanSticky();
  }

  function renderCoursePlanSticky() {
    if (!isProfessorMode()) {
      hideCoursePlanSticky();
      return;
    }
    if (!stickyCoursePlanEl || !courseStickySnapshot) return;
    const { title, items, counts } = courseStickySnapshot;
    if (!items || items.length === 0) {
      hideCoursePlanSticky();
      return;
    }
    stickyCoursePlanEl.innerHTML = "";
    stickyCoursePlanEl.classList.toggle("expanded", courseStickyExpanded);
    const done = counts.mastered + counts.skipped;
    const active = items.find((s) => s.status === "active");
    const label = active
      ? `${COURSE_KIND_LABEL[active.kind] || active.kind} : ${active.title}`
      : done >= items.length
        ? "Plan de cours terminé"
        : "Plan de cours";
    stickyCoursePlanEl.hidden = false;
    stickyCoursePlanEl.setAttribute(
      "aria-expanded",
      courseStickyExpanded ? "true" : "false",
    );
    const ic = document.createElement("span");
    ic.className = "sticky-ic";
    ic.textContent = "📚";
    const txt = document.createElement("span");
    txt.className = "sticky-text";
    txt.textContent = label;
    const ctr = document.createElement("span");
    ctr.className = "sticky-counter";
    ctr.textContent = `${done}/${items.length}`;
    stickyCoursePlanEl.appendChild(ic);
    stickyCoursePlanEl.appendChild(txt);
    stickyCoursePlanEl.appendChild(ctr);
    if (courseStickyExpanded) {
      const list = document.createElement("ul");
      list.className = "sticky-list";
      for (const s of items) {
        const meta =
          COURSE_STEP_STATUS_META[s.status] || COURSE_STEP_STATUS_META.pending;
        const li = document.createElement("li");
        li.className = `sticky-li sticky-li-${s.status}`;
        li.textContent = `${meta.icon} ${COURSE_KIND_LABEL[s.kind] || s.kind} — ${s.title}`;
        list.appendChild(li);
      }
      stickyCoursePlanEl.appendChild(list);
    }
  }

  function hideCoursePlanSticky() {
    if (!stickyCoursePlanEl) return;
    stickyCoursePlanEl.hidden = true;
    stickyCoursePlanEl.innerHTML = "";
    courseStickySnapshot = null;
    courseStickyExpanded = false;
  }

  function scrollToCoursePlanBlock() {
    if (currentCoursePlanBlockEl && currentCoursePlanBlockEl.isConnected) {
      currentCoursePlanBlockEl.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    }
  }

  function toggleStickyTodo() {
    stickyExpanded = !stickyExpanded;
    renderTodoSticky();
  }

  function scrollToTodoBlock() {
    if (currentTodoBlockEl && currentTodoBlockEl.isConnected) {
      currentTodoBlockEl.scrollIntoView({ behavior: "smooth", block: "center" });
    }
  }

  /** Crée le DOM d'un bloc tool en état "running". */
  function createToolBlock(payload) {
    const stick = isAtBottom();
    const details = document.createElement("details");
    details.className = "msg-tool running";

    const summary = document.createElement("summary");

    const icon = document.createElement("span");
    icon.className = "tool-icon";
    icon.innerHTML = "<span class='spin'></span>";

    const label = document.createElement("span");
    label.className = "tool-label";
    const verb = String(payload.verb ?? "Ran");
    const target = String(payload.target ?? "");
    label.appendChild(boldText(verb));
    if (target) {
      label.appendChild(document.createTextNode(" "));
      const t = document.createElement("span");
      t.className = "tool-target";
      t.textContent = target;
      label.appendChild(t);
    }

    summary.appendChild(icon);
    summary.appendChild(label);

    const body = document.createElement("div");
    body.className = "msg-tool-body";

    if (payload.argsPreview) {
      const argsPre = document.createElement("pre");
      argsPre.className = "tool-args";
      argsPre.textContent = payload.argsPreview;
      body.appendChild(argsPre);
    }

    details.appendChild(summary);
    details.appendChild(body);
    currentContainer().appendChild(details);
    maybeScroll(stick);
    return details;
  }

  function boldText(txt) {
    const s = document.createElement("span");
    s.className = "tool-verb";
    s.textContent = txt;
    return s;
  }

  function finishToolBlock(details, payload) {
    details.classList.remove("running");
    details.classList.add(payload.isError ? "errored" : "done");

    const icon = details.querySelector(".tool-icon");
    if (icon) {
      icon.innerHTML = payload.isError ? svgCross() : svgCheck();
    }

    const body = details.querySelector(".msg-tool-body");
    if (body && payload.outputPreview) {
      const sep = document.createElement("div");
      sep.className = "tool-sep";
      sep.textContent = "→ résultat";
      body.appendChild(sep);

      const out = document.createElement("pre");
      out.className = "tool-output";
      out.textContent = payload.outputPreview;
      body.appendChild(out);
    }
  }

  function svgCheck() {
    return (
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M3 8.5l3 3 7-7"></path></svg>'
    );
  }
  function svgCross() {
    return (
      '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M4 4l8 8"></path><path d="M12 4l-8 8"></path></svg>'
    );
  }

  function handleToolEvent(payload) {
    const id = String(payload.id ?? "");
    if (payload.phase === "start") {
      finalizeAssistant();
      hideLoader();
      const details = createToolBlock(payload);
      if (id) {
        toolBlocks.set(id, details);
        activeToolNames.set(id, String(payload.name ?? "?"));
      }
      refreshStatusState();
      return;
    }
    if (payload.phase === "finish") {
      finalizeAssistant();
      hideLoader();
      const existing = id ? toolBlocks.get(id) : undefined;
      if (existing) {
        finishToolBlock(existing, payload);
        toolBlocks.delete(id);
      } else {
        const details = createToolBlock({
          verb: payload.isError ? "Failed" : "Ran",
          target: "",
          argsPreview: "",
        });
        finishToolBlock(details, payload);
      }
      if (id) {
        activeToolNames.delete(id);
      }
      refreshStatusState();
    }
  }

  // --- Status bar updates ---

  function renderStatus() {
    if (statTokensIn) {
      statTokensIn.textContent = String(totalIn);
    }
    if (statTokensOut) {
      statTokensOut.textContent = String(totalOut);
    }
    if (statCtx) {
      statCtx.textContent = formatTokens(ctxTokens);
    }
  }

  function formatTokens(n) {
    if (!n) {
      return "0";
    }
    if (n < 1000) {
      return String(n);
    }
    return (n / 1000).toFixed(n < 10000 ? 1 : 0) + "k";
  }

  // --- Attachements (images) ---

  function randomId() {
    return Math.random().toString(36).slice(2, 10);
  }

  /** @param {File} file */
  function fileIsImage(file) {
    return (
      typeof file.type === "string" && file.type.toLowerCase().startsWith("image/")
    );
  }

  /**
   * @param {File} file
   * @returns {Promise<{ id: string, name: string, dataUrl: string, mime: string }>}
   */
  function readAsDataUrl(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onerror = () => reject(reader.error ?? new Error("read failed"));
      reader.onload = () =>
        resolve({
          id: randomId(),
          name: file.name || "image",
          mime: file.type || "image/png",
          dataUrl: String(reader.result),
        });
      reader.readAsDataURL(file);
    });
  }

  function renderAttachments() {
    attachmentsEl.innerHTML = "";
    for (const att of attachments) {
      const wrap = document.createElement("div");
      wrap.className = "attachment";
      wrap.title = att.name;
      const img = document.createElement("img");
      img.src = att.dataUrl;
      img.alt = att.name;
      const remove = document.createElement("button");
      remove.className = "remove";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Retirer";
      remove.addEventListener("click", () => {
        attachments = attachments.filter((a) => a.id !== att.id);
        renderAttachments();
      });
      wrap.appendChild(img);
      wrap.appendChild(remove);
      attachmentsEl.appendChild(wrap);
    }
  }

  /** @param {FileList | File[] | null | undefined} files */
  async function addFiles(files) {
    if (!files) {
      return;
    }
    const incoming = Array.from(files).filter(fileIsImage);
    for (const f of incoming) {
      try {
        const item = await readAsDataUrl(f);
        attachments.push(item);
      } catch {
        /* ignore */
      }
    }
    renderAttachments();
  }

  if (attachBtn && fileInput) {
    attachBtn.addEventListener("click", () => fileInput.click());
    fileInput.addEventListener("change", () => {
      void addFiles(fileInput.files);
      fileInput.value = "";
    });
  } else {
    diag("DOM manquant: #attach ou #file-input");
  }
  if (addRefsBtn) {
    addRefsBtn.addEventListener("click", () => {
      vscode.postMessage({ type: "pickReferences" });
    });
  }
  diag("checkpoint C");

  /**
   * Sprint Questions bloquantes (§2.13) — initialise / réécrit complètement
   * la carte « Questions » dans le composer. Bloque le bouton Send tant
   * que la carte est active.
   */
  function openUserAskCard(payload) {
    const answers = new Map();
    for (const q of payload.questions) {
      answers.set(q.id, {
        optionIds: new Set(),
        freeText: "",
        skipped: false,
      });
    }
    pendingUserAsk = {
      askId: payload.askId,
      title: payload.title || null,
      questions: payload.questions,
      currentIndex: 0,
      answers,
    };
    userAskEl.hidden = false;
    renderUserAskCard();
    updateSendButtonForUserAsk();
  }

  /** Ferme la carte (réponse envoyée OU run annulé / chat reset). */
  function closeUserAskCard() {
    pendingUserAsk = null;
    userAskEl.hidden = true;
    userAskEl.innerHTML = "";
    updateSendButtonForUserAsk();
  }

  /**
   * Désactive le bouton Send tant qu'une carte Questions est active : on
   * veut forcer une réponse avant de continuer la conversation. Le bouton
   * est restauré dès qu'on envoie ou skip la carte.
   */
  function updateSendButtonForUserAsk() {
    updateComposerChrome();
  }

  /** Boutons Send / Stop, badge file, pièces jointes — état run + Questions. */
  function updateComposerChrome() {
    if (stopRunBtn) {
      if (busy) {
        stopRunBtn.removeAttribute("hidden");
      } else {
        stopRunBtn.setAttribute("hidden", "");
      }
    }

    sendBtn.classList.remove("stopping");

    const q = pendingPrompts.length;
    if (sendQueueBadge) {
      if (busy && q > 0) {
        sendQueueBadge.removeAttribute("hidden");
        sendQueueBadge.textContent = `+${q}`;
      } else {
        sendQueueBadge.setAttribute("hidden", "");
        sendQueueBadge.textContent = "";
      }
    }

    if (pendingUserAsk && !busy) {
      sendBtn.disabled = true;
      sendBtn.title = "Réponds aux questions ou clique « Ignorer » pour continuer";
    } else if (busy) {
      sendBtn.disabled = false;
      sendBtn.title =
        "Mettre en file d'attente — envoi à la fin du run (Entrée)";
    } else {
      sendBtn.disabled = false;
      sendBtn.title = "Envoyer (Entrée)";
    }

    sendBtn.setAttribute(
      "aria-label",
      busy
        ? pendingPrompts.length > 0
          ? `Mettre en file d'attente (${pendingPrompts.length} déjà en attente)`
          : "Mettre en file d'attente"
        : "Envoyer le message",
    );

    // Composer reste utilisable pendant un run (§2.14).
    attachBtn.disabled = Boolean(pendingUserAsk && !busy);
    addRefsBtn.disabled = Boolean(pendingUserAsk && !busy);
    modeSelect.disabled = Boolean(pendingUserAsk && !busy);
    promptEl.disabled = Boolean(pendingUserAsk && !busy);
  }

  function clearPendingPrompts() {
    pendingPrompts = [];
    renderPendingPrompts();
    updateComposerChrome();
  }

  /**
   * Remet un message en file dans le composer (Modifier).
   * @param {typeof pendingPrompts[0]} item
   */
  function restoreComposerFromPending(item) {
    promptEl.value = item.prompt || "";
    modeSelect.value = item.mode || "acceptEdits";
    attachments = (item.attachments || []).map((a) => ({
      id: randomId(),
      name: a.name,
      mime: a.mime,
      dataUrl: a.dataUrl,
    }));
    references = (item.references || []).map((r) => ({
      id: r.id || randomId(),
      uri: r.uri,
      label: r.label,
    }));
    pasteAttachments = (item.pastes || []).map((p) => ({
      ...p,
      id: p.id || randomId(),
    }));
    renderAttachments();
    renderRefs();
    autoresize();
    promptEl.focus();
  }

  /** @param {string} itemId */
  function editPendingPrompt(itemId) {
    const item = pendingPrompts.find((x) => x.id === itemId);
    if (!item) {
      return;
    }
    pendingPrompts = pendingPrompts.filter((x) => x.id !== itemId);
    restoreComposerFromPending(item);
    renderPendingPrompts();
    updateComposerChrome();
  }

  function snippetForPending(text, maxLen) {
    const one = String(text || "")
      .replace(/\s+/g, " ")
      .trim();
    if (!one) return "(vide)";
    if (one.length <= maxLen) return one;
    return one.slice(0, maxLen) + "…";
  }

  function pendingPromptExtras(item) {
    const extras = [];
    if (item.references.length) {
      extras.push(`${item.references.length} réf.`);
    }
    if (item.attachments.length) {
      extras.push(`${item.attachments.length} img`);
    }
    if (item.pastes.length) {
      extras.push(`${item.pastes.length} extrait`);
    }
    return extras;
  }

  function renderPendingPrompts() {
    if (!pendingPromptsEl) {
      return;
    }
    pendingPromptsEl.replaceChildren();
    if (pendingPrompts.length === 0) {
      pendingPromptsEl.setAttribute("hidden", "");
      return;
    }
    pendingPromptsEl.removeAttribute("hidden");

    const list = document.createElement("div");
    list.className = "pending-prompts-list";
    list.setAttribute(
      "aria-label",
      `${pendingPrompts.length} message(s) en attente`,
    );

    for (const item of pendingPrompts) {
      const card = document.createElement("div");
      card.className = "pending-prompt-card";

      const body = document.createElement("div");
      body.className = "pending-prompt-body";

      const text = document.createElement("span");
      text.className = "pending-prompt-snippet";
      text.textContent = snippetForPending(item.prompt, PENDING_SNIPPET_MAX);
      text.title = item.prompt || "";
      body.appendChild(text);

      const extras = pendingPromptExtras(item);
      if (extras.length) {
        const meta = document.createElement("span");
        meta.className = "pending-prompt-meta";
        meta.textContent = extras.join(" · ");
        body.appendChild(meta);
      }

      const actions = document.createElement("div");
      actions.className = "pending-prompt-actions";

      const editBtn = document.createElement("button");
      editBtn.type = "button";
      editBtn.className = "pending-prompt-edit";
      editBtn.textContent = "Modifier";
      editBtn.title = "Récupérer ce message dans le composer";
      editBtn.addEventListener("click", () => editPendingPrompt(item.id));

      const removeBtn = document.createElement("button");
      removeBtn.type = "button";
      removeBtn.className = "pending-prompt-remove";
      removeBtn.textContent = "Retirer";
      removeBtn.title = "Retirer de la file";
      removeBtn.addEventListener("click", () => {
        pendingPrompts = pendingPrompts.filter((x) => x.id !== item.id);
        renderPendingPrompts();
        updateComposerChrome();
      });

      actions.appendChild(editBtn);
      actions.appendChild(removeBtn);

      card.appendChild(body);
      card.appendChild(actions);
      list.appendChild(card);
    }

    pendingPromptsEl.appendChild(list);
    updatePromptPlaceholder();
  }

  function isComposerPayloadEmpty(text) {
    return (
      !text &&
      attachments.length === 0 &&
      references.length === 0 &&
      pasteAttachments.length === 0
    );
  }

  function snapshotComposerPayload(text) {
    return {
      prompt: text,
      mode: modeSelect.value,
      attachments: attachments.map((a) => ({
        name: a.name,
        mime: a.mime,
        dataUrl: a.dataUrl,
      })),
      references: references.map((r) => ({
        id: r.id,
        uri: r.uri,
        label: r.label,
      })),
      pastes: pasteAttachments.map((p) => ({
        id: p.id,
        token: p.token,
        kind: p.kind === "terminal" ? "terminal" : "editor",
        absPath: p.absPath,
        relPath: p.relPath,
        languageId: p.languageId,
        startLine: p.startLine,
        endLine: p.endLine,
        lineCount: p.lineCount,
        text: p.text,
      })),
    };
  }

  function clearComposerAfterSend() {
    promptEl.value = "";
    hidePathSuggestions();
    attachments = [];
    renderAttachments();
    references = [];
    pasteAttachments = [];
    renderRefs();
    autoresize();
    updatePromptPlaceholder();
  }

  function performSend(payload) {
    diag(
      `performSend promptLen=${(payload.prompt || "").length} replay=${replayingHistory}`,
    );
    // Priorité utilisateur : ne pas laisser un replay bloquer l'affichage du message.
    if (replayingHistory) {
      endReplayMode();
    }
    if (payload.prompt) {
      hasSentPrompt = true;
      const t = payload.prompt;
      if (history[0] !== t) {
        history.unshift(t);
        if (history.length > 50) history.length = 50;
      }
    }
    historyIdx = -1;
    historyDraft = "";

    vscode.postMessage({
      type: "send",
      prompt: payload.prompt,
      mode: payload.mode,
      attachments: payload.attachments.map((a) => ({
        name: a.name,
        mime: a.mime,
        dataUrl: a.dataUrl,
      })),
      references: payload.references.map((r) => ({ uri: r.uri })),
      pastes: payload.pastes,
    });
    clearComposerAfterSend();
  }

  function tryEnqueueFromComposer() {
    const raw = promptEl.value;
    const text = raw.trim();
    if (isComposerPayloadEmpty(text)) {
      return false;
    }
    if (parseSlashCommand(raw)) {
      vscode.postMessage({
        type: "slash",
        slashInvalid:
          "Les commandes / ne peuvent pas être mises en file pendant un run.",
      });
      return true;
    }

    const snap = snapshotComposerPayload(text);
    pendingPrompts.push({
      id: randomId(),
      ...snap,
    });
    clearComposerAfterSend();
    historyIdx = -1;
    historyDraft = "";
    renderPendingPrompts();
    updateComposerChrome();
    return true;
  }

  function flushPendingPromptQueue() {
    if (busy || pendingUserAsk || pendingPrompts.length === 0) {
      return;
    }
    const item = pendingPrompts.shift();
    renderPendingPrompts();
    updateComposerChrome();
    performSend(item);
  }

  function renderUserAskCard() {
    if (!pendingUserAsk) return;
    const total = pendingUserAsk.questions.length;
    const idx = pendingUserAsk.currentIndex;
    const q = pendingUserAsk.questions[idx];
    const state = pendingUserAsk.answers.get(q.id);

    userAskEl.innerHTML = "";

    const header = document.createElement("div");
    header.className = "user-ask-header";
    const headerLeft = document.createElement("div");
    headerLeft.className = "user-ask-title";
    headerLeft.textContent = pendingUserAsk.title || "Questions";
    const headerRight = document.createElement("div");
    headerRight.className = "user-ask-counter";
    headerRight.textContent = `${idx + 1} of ${total}`;
    header.appendChild(headerLeft);
    header.appendChild(headerRight);
    userAskEl.appendChild(header);

    const promptLine = document.createElement("div");
    promptLine.className = "user-ask-prompt";
    promptLine.textContent = `${idx + 1}. ${q.prompt}`;
    userAskEl.appendChild(promptLine);

    if (q.options.length > 0) {
      const opts = document.createElement("div");
      opts.className = "user-ask-options";
      q.options.forEach((opt, j) => {
        const selected = state.optionIds.has(opt.id);
        const btn = document.createElement("button");
        btn.type = "button";
        btn.className = "user-ask-option" + (selected ? " selected" : "");
        const letter = document.createElement("span");
        letter.className = "user-ask-option-letter";
        letter.textContent = String.fromCharCode(65 + (j % 26));
        const lab = document.createElement("span");
        lab.className = "user-ask-option-label";
        lab.textContent = opt.label;
        btn.appendChild(letter);
        btn.appendChild(lab);
        btn.addEventListener("click", () => {
          if (!q.allowMultiple) {
            state.optionIds.clear();
          }
          if (state.optionIds.has(opt.id)) {
            state.optionIds.delete(opt.id);
          } else {
            state.optionIds.add(opt.id);
          }
          state.skipped = false;
          renderUserAskCard();
        });
        opts.appendChild(btn);
      });
      userAskEl.appendChild(opts);
    }

    if (q.allowFreeText || q.options.length === 0) {
      const wrap = document.createElement("div");
      wrap.className = "user-ask-free";
      const ta = document.createElement("textarea");
      ta.className = "user-ask-free-input";
      ta.rows = 1;
      ta.placeholder =
        q.options.length === 0
          ? "Votre réponse…"
          : "Add more optional details";
      ta.value = state.freeText || "";
      ta.addEventListener("input", () => {
        state.freeText = ta.value;
        if (state.freeText) state.skipped = false;
      });
      // Enter (sans Shift) déclenche Continuer si on est sur la dernière
      // question ; sinon avance d'un cran.
      ta.addEventListener("keydown", (e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          state.freeText = ta.value;
          advanceOrSubmit();
        } else if (e.key === "Escape") {
          e.preventDefault();
          skipUserAsk();
        }
      });
      wrap.appendChild(ta);
      userAskEl.appendChild(wrap);
    }

    const actions = document.createElement("div");
    actions.className = "user-ask-actions";

    const skip = document.createElement("button");
    skip.type = "button";
    skip.className = "user-ask-action skip";
    skip.innerHTML = "Skip <kbd>Esc</kbd>";
    skip.title = "Ignorer toutes les questions et reprendre la main";
    skip.addEventListener("click", () => skipUserAsk());

    const prev = document.createElement("button");
    prev.type = "button";
    prev.className = "user-ask-action prev";
    prev.textContent = "◀";
    prev.disabled = idx === 0;
    prev.title = "Question précédente";
    prev.addEventListener("click", () => {
      pendingUserAsk.currentIndex = Math.max(0, idx - 1);
      renderUserAskCard();
    });

    const next = document.createElement("button");
    next.type = "button";
    next.className = "user-ask-action next";
    const isLast = idx === total - 1;
    next.innerHTML = isLast
      ? "Continue <kbd>↵</kbd>"
      : "Suivant <kbd>↵</kbd>";
    next.addEventListener("click", () => advanceOrSubmit());

    actions.appendChild(skip);
    actions.appendChild(prev);
    actions.appendChild(next);
    userAskEl.appendChild(actions);
  }

  function advanceOrSubmit() {
    if (!pendingUserAsk) return;
    if (pendingUserAsk.currentIndex < pendingUserAsk.questions.length - 1) {
      pendingUserAsk.currentIndex += 1;
      renderUserAskCard();
      return;
    }
    submitUserAsk();
  }

  function submitUserAsk() {
    if (!pendingUserAsk) return;
    const answers = pendingUserAsk.questions.map((q) => {
      const s = pendingUserAsk.answers.get(q.id);
      return {
        id: q.id,
        optionIds: Array.from(s.optionIds),
        freeText: s.freeText,
        skipped: false,
      };
    });
    vscode.postMessage({
      type: "userAskAnswer",
      askId: pendingUserAsk.askId,
      answers,
    });
    closeUserAskCard();
  }

  function skipUserAsk() {
    if (!pendingUserAsk) return;
    const answers = pendingUserAsk.questions.map((q) => ({
      id: q.id,
      optionIds: [],
      freeText: "",
      skipped: true,
    }));
    vscode.postMessage({
      type: "userAskAnswer",
      askId: pendingUserAsk.askId,
      answers,
    });
    closeUserAskCard();
  }

  /**
   * Affiche les chips de **références** (fichiers/dossiers glissés depuis
   * l'Explorateur) ET les chips **smart paste** (§2.9 — sélections éditeur
   * reconnues au paste) au-dessus du textarea. Les deux types coexistent
   * dans le même conteneur `#refs` pour rester groupés visuellement, avec
   * un style propre via `.paste-chip`.
   */
  function renderRefs() {
    refsEl.innerHTML = "";
    for (const ref of references) {
      const chip = document.createElement("span");
      chip.className = "ref-chip";
      chip.title = ref.uri;

      const icon = document.createElement("span");
      icon.className = "ref-icon";
      icon.innerHTML =
        '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round">' +
        '<path d="M9 2H4a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1V6"></path>' +
        '<path d="M9 2v4h4"></path></svg>';

      const label = document.createElement("span");
      label.className = "ref-label";
      label.textContent = ref.label;

      const remove = document.createElement("button");
      remove.className = "ref-remove";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Retirer";
      remove.addEventListener("click", () => {
        references = references.filter((r) => r.id !== ref.id);
        renderRefs();
      });

      chip.appendChild(icon);
      chip.appendChild(label);
      chip.appendChild(remove);
      refsEl.appendChild(chip);
    }
    for (const p of pasteAttachments) {
      const chip = document.createElement("span");
      const isTerminal = p.kind === "terminal";
      chip.className = isTerminal
        ? "ref-chip paste-chip paste-chip-terminal"
        : "ref-chip paste-chip";
      const lineRef = pasteLineRef(p.startLine, p.endLine);
      const refPath = p.relPath ?? p.absPath ?? "";
      const chipLabel = isTerminal
        ? `${refPath || "Terminal"} · ${lineRef}`
        : `${labelFor(refPath)} · ${lineRef}`;
      chip.title = isTerminal
        ? `Terminal — ${lineRef} (${p.lineCount} l.)`
        : `${refPath} — ${lineRef} (${p.lineCount} l.)`;

      const icon = document.createElement("span");
      icon.className = "ref-icon paste-icon";
      if (isTerminal) {
        icon.innerHTML =
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<rect x="2" y="3" width="12" height="10" rx="1"></rect>' +
          '<path d="M4 6h6M4 9h4"></path></svg>';
      } else {
        icon.innerHTML =
          '<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
          '<rect x="3" y="2" width="9" height="11" rx="1"></rect>' +
          '<path d="M6 2V1h3v1"></path>' +
          '<path d="M5 6h5M5 9h5"></path></svg>';
      }

      const label = document.createElement("button");
      label.className = "ref-label paste-label";
      label.type = "button";
      label.textContent = chipLabel;
      label.title = isTerminal
        ? "Afficher le terminal source"
        : "Ouvrir le fichier à cette plage";
      label.addEventListener("click", () => {
        vscode.postMessage({
          type: "openPasteSource",
          kind: p.kind,
          absPath: p.absPath,
          relPath: p.relPath,
          startLine: p.startLine,
          endLine: p.endLine,
        });
      });

      const remove = document.createElement("button");
      remove.className = "ref-remove";
      remove.type = "button";
      remove.textContent = "×";
      remove.title = "Retirer";
      remove.addEventListener("click", () => {
        pasteAttachments = pasteAttachments.filter((x) => x.id !== p.id);
        renderRefs();
      });

      chip.appendChild(icon);
      chip.appendChild(label);
      chip.appendChild(remove);
      refsEl.appendChild(chip);
    }
    updatePromptPlaceholder();
  }

  /** Décode un `file:///` URI en chemin lisible (URL-decoded). */
  function fileUriToPath(uri) {
    try {
      let p = uri.replace(/^file:\/\//, "");
      p = decodeURIComponent(p);
      // Sous Windows : `file:///c:/...` → `/c:/...` → on retire le `/` initial.
      if (/^\/[a-zA-Z]:/.test(p)) {
        p = p.slice(1);
      }
      return p;
    } catch {
      return uri;
    }
  }

  /** Court label depuis un chemin (basename + parent si court). */
  function labelFor(p) {
    const norm = p.replaceAll("\\", "/");
    const parts = norm.split("/").filter(Boolean);
    if (parts.length === 0) return p;
    if (parts.length === 1) return parts[0];
    const last = parts[parts.length - 1];
    const parent = parts[parts.length - 2];
    return `${parent}/${last}`;
  }

  /** Clé de déduplication insensible à la casse/encodage. */
  function refKey(uri) {
    return String(uri || "").trim().toLowerCase();
  }

  function addUriRefs(uris) {
    const existing = new Set(references.map((r) => refKey(r.uri)));
    for (const u of uris) {
      const trimmed = String(u || "").trim();
      if (!trimmed || trimmed.startsWith("#")) continue;
      const key = refKey(trimmed);
      if (existing.has(key)) continue;
      existing.add(key);
      const filePath = trimmed.startsWith("file://") ? fileUriToPath(trimmed) : trimmed;
      references.push({
        id: randomId(),
        uri: trimmed,
        label: labelFor(filePath),
      });
    }
    renderRefs();
  }

  // Drag & drop : accepte fichiers OS (images) ET URIs glissés depuis
  // l'Explorateur VS Code (fichiers/dossiers ajoutés comme références).
  //
  // Important : on attache en phase de capture (3e argument `true`) pour
  // intercepter AVANT le handler natif du `<textarea>` qui insèrerait sinon
  // le chemin comme texte brut. On preventDefault inconditionnellement en
  // dragover, sinon le navigateur n'autorise pas le drop.

  let dragDepth = 0;

  document.addEventListener(
    "dragenter",
    (e) => {
      if (!e.dataTransfer) return;
      dragDepth += 1;
      composerEl.classList.add("dragging");
      e.preventDefault();
    },
    true,
  );

  document.addEventListener(
    "dragover",
    (e) => {
      if (!e.dataTransfer) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = "copy";
    },
    true,
  );

  document.addEventListener(
    "dragleave",
    () => {
      dragDepth = Math.max(0, dragDepth - 1);
      if (dragDepth === 0) {
        composerEl.classList.remove("dragging");
      }
    },
    true,
  );

  /** Convertit un chemin OS en `file:///...` pour réutiliser addUriRefs. */
  function pathToFileUri(p) {
    const norm = (p || "").trim().replace(/\\/g, "/");
    if (!norm) return "";
    if (norm.startsWith("file://")) return norm;
    if (/^[a-zA-Z]:/.test(norm)) return "file:///" + norm;
    if (norm.startsWith("/")) return "file://" + norm;
    return "file:///" + norm;
  }

  /**
   * Détecte une URI `file:` ou un chemin absolu dans une ligne.
   * @param {string} line
   * @returns {string | null}
   */
  function parsePotentialUri(line) {
    const t = line.trim();
    if (!t || t.startsWith("#")) return null;
    if (t.startsWith("file://")) return t;
    if (/^[a-zA-Z]:[\\/]/.test(t)) return pathToFileUri(t);
    if (t.startsWith("/") && t.length > 1) return pathToFileUri(t);
    return null;
  }

  /**
   * Extrait des URIs depuis un bloc de texte multiligne (uri-list, plain, etc.).
   * @param {string} raw
   */
  function extractUrisFromText(raw) {
    if (!raw) return [];
    /** @type {string[]} */
    const out = [];
    for (const line of raw.split(/\r?\n/)) {
      const u = parsePotentialUri(line);
      if (u) out.push(u);
    }
    return out;
  }

  /**
   * Parcourt un JSON (drag Explorateur) à la recherche de chaînes `file://` ou chemins.
   * @param {unknown} val
   * @param {string[]} out
   */
  function walkJsonForUris(val, out) {
    if (typeof val === "string") {
      const u = parsePotentialUri(val);
      if (u) {
        out.push(u);
      } else {
        out.push(...extractUrisFromText(val));
      }
      return;
    }
    if (Array.isArray(val)) {
      for (const v of val) walkJsonForUris(v, out);
      return;
    }
    if (val && typeof val === "object") {
      for (const k of Object.keys(val)) walkJsonForUris(val[k], out);
    }
  }

  /**
   * `getData` synchrone pour tous les MIME types annoncés + formats VS Code connus.
   * @param {DataTransfer} dt
   */
  function readUrisFromDataTransferSync(dt) {
    /** @type {string[]} */
    const collected = [];
    const typeSet = new Set([
      "application/vnd.code.uri-list",
      "text/uri-list",
      "codefiles",
      "application/vnd.code.tree.workbench.explorer.fileView",
      "text/plain",
    ]);
    for (const t of Array.from(dt.types || [])) {
      typeSet.add(t);
    }
    for (const type of typeSet) {
      let raw = "";
      try {
        raw = dt.getData(type) || "";
      } catch {
        continue;
      }
      if (!raw) continue;
      if (raw.startsWith("[") || raw.startsWith("{")) {
        try {
          walkJsonForUris(JSON.parse(raw), collected);
        } catch {
          collected.push(...extractUrisFromText(raw));
        }
      } else {
        collected.push(...extractUrisFromText(raw));
      }
    }
    return collected;
  }

  /** Extraction async via `DataTransferItem` (souvent nécessaire pour l'Explorateur VS Code). */
  async function readUrisFromDataTransferItems(dt) {
    /** @type {string[]} */
    const collected = [];
    const items = dt.items ? Array.from(dt.items) : [];
    for (const it of items) {
      if (it.kind === "string") {
        const s = await new Promise((resolve) => {
          try {
            it.getAsString((v) => resolve(v ?? ""));
          } catch {
            resolve("");
          }
        });
        if (!s) continue;
        if (s.startsWith("[") || s.startsWith("{")) {
          try {
            walkJsonForUris(JSON.parse(s), collected);
          } catch {
            collected.push(...extractUrisFromText(s));
          }
        } else {
          collected.push(...extractUrisFromText(s));
        }
      } else if (it.kind === "file") {
        const f = it.getAsFile();
        if (f) {
          const p = /** @type {{ path?: string }} */ (f).path;
          if (typeof p === "string" && p.length > 0) {
            const u = pathToFileUri(p);
            if (u) collected.push(u);
          }
        }
      }
    }
    return collected;
  }

  /** Fichiers `File` avec propriété Electron `.path`. */
  function readUrisFromFileList(dt) {
    /** @type {string[]} */
    const out = [];
    if (!dt.files || dt.files.length === 0) return out;
    for (let i = 0; i < dt.files.length; i++) {
      const f = dt.files[i];
      const p = /** @type {{ path?: string }} */ (f).path;
      if (typeof p === "string" && p.length > 0) {
        const u = pathToFileUri(p);
        if (u) out.push(u);
      }
    }
    return out;
  }

  /** @param {string[]} list */
  function dedupeUris(list) {
    const s = new Set();
    /** @type {string[]} */
    const r = [];
    for (const u of list) {
      const k = u.trim();
      if (!k || s.has(k)) continue;
      s.add(k);
      r.push(k);
    }
    return r;
  }

  /**
   * @param {DataTransfer} dt
   * @returns {Array<{ mime: string, preview: string }>}
   */
  function buildDropSnippets(dt) {
    const types = Array.from(dt.types || []);
    /** @type {Array<{ mime: string, preview: string }>} */
    const snippets = [];
    for (const mime of types) {
      try {
        const v = dt.getData(mime);
        if (!v) continue;
        snippets.push({
          mime,
          preview: v.length > 2000 ? v.slice(0, 2000) + "…" : v,
        });
      } catch {
        snippets.push({ mime, preview: "(getData a échoué)" });
      }
    }
    return snippets;
  }

  /** Message dans le chat + rapport détaillé vers l’extension (panneau Sortie). */
  function reportDropFailure(dt) {
    const types = Array.from(dt.types || []);
    const snippets = buildDropSnippets(dt);
    appendBlock(
      "msg-system",
      [
        "[références] Drop sans chemin exploitable (VS Code limite souvent les données vers les webviews).",
        "→ Panneau **Sortie**, canal **Drox (moteur)** pour le détail technique.",
        "→ Palette : **Drox: Ajouter des références (fichiers/dossiers)** (contournement fiable).",
        "",
        `Types MIME annoncés : ${types.length ? types.join(", ") : "(aucun)"}`,
      ].join("\n"),
    );
    vscode.postMessage({
      type: "dropReport",
      extracted: 0,
      types,
      snippets,
    });
  }

  document.addEventListener(
    "drop",
    async (e) => {
      dragDepth = 0;
      composerEl.classList.remove("dragging");
      e.preventDefault();
      e.stopPropagation();

      const dt = /** @type {DragEvent} */ (e).dataTransfer;
      if (!dt) {
        appendBlock("msg-system", "[références] Drop sans dataTransfer.");
        return;
      }

      let uris = dedupeUris(readUrisFromDataTransferSync(dt));
      if (uris.length === 0) {
        uris = dedupeUris(await readUrisFromDataTransferItems(dt));
      }
      if (uris.length === 0) {
        uris = dedupeUris(readUrisFromFileList(dt));
      }

      const hasFiles = Boolean(dt.files && dt.files.length > 0);

      if (uris.length > 0) {
        addUriRefs(uris);
      }
      if (hasFiles) {
        void addFiles(dt.files);
      }

      if (uris.length === 0 && !hasFiles) {
        reportDropFailure(dt);
      }
    },
    true,
  );

  // Bloque le comportement natif du textarea (insertion du nom de fichier, etc.).
  promptEl.addEventListener(
    "dragover",
    (ev) => {
      ev.preventDefault();
    },
    true,
  );
  promptEl.addEventListener(
    "drop",
    (ev) => {
      ev.preventDefault();
      ev.stopPropagation();
    },
    true,
  );

  // Paste image (Ctrl/Cmd+V) + Smart paste (§2.9) — éditeur ou terminal.
  //
  // Trois cas dans l'ordre de priorité :
  //   1. Images → attachments.
  //   2. Texte = sélection récente (hash FNV-1a) → chip (réf. Lx-y, pas le texte).
  //   3. Sinon → collage texte brut dans le textarea.
  promptEl.addEventListener("paste", (e) => {
    const dt = e.clipboardData;
    if (!dt) return;
    const items = dt.items;
    if (items) {
      const files = [];
      for (let i = 0; i < items.length; i++) {
        const it = items[i];
        if (it.kind === "file") {
          const f = it.getAsFile();
          if (f && fileIsImage(f)) files.push(f);
        }
      }
      if (files.length > 0) {
        e.preventDefault();
        void addFiles(files);
        return;
      }
    }
    const pasted = dt.getData("text/plain");
    if (!pasted) return;
    const normalized = normalizeForHash(pasted);
    if (!normalized.trim()) return;
    const token = fnv1a32(normalized);
    const cand = pasteCandidates.get(token);
    if (!cand) return;
    const alreadyAttached = pasteAttachments.some((p) => p.token === token);
    if (alreadyAttached) {
      e.preventDefault();
      return;
    }
    e.preventDefault();
    pasteAttachments.push({
      id: randomId(),
      token: cand.token,
      kind: cand.kind,
      absPath: cand.absPath,
      relPath: cand.relPath,
      languageId: cand.languageId,
      startLine: cand.startLine,
      endLine: cand.endLine,
      lineCount: cand.lineCount,
      text: cand.text,
    });
    renderRefs();
  });

  /** Normalise le texte avant hash : CRLF → LF, retire un BOM éventuel. */
  function normalizeForHash(s) {
    return String(s).replace(/\r\n/g, "\n").replace(/^\uFEFF/, "");
  }

  /** Hash 32-bit FNV-1a (hex, 8 caractères) — doit matcher `pasteCandidates.ts`. */
  function fnv1a32(input) {
    let hash = 0x811c9dc5;
    for (let i = 0; i < input.length; i++) {
      hash ^= input.charCodeAt(i);
      hash =
        (hash +
          ((hash << 1) +
            (hash << 4) +
            (hash << 7) +
            (hash << 8) +
            (hash << 24))) >>>
        0;
    }
    return hash.toString(16).padStart(8, "0");
  }

  // --- Envoi ---

  /**
   * Détecte une commande `/` sur une **seule** ligne (sans corps multi-lignes).
   * @returns {{ command: string, args: string } | null}
   */
  function parseSlashCommand(raw) {
    const trimmed = raw.trim();
    if (!trimmed.startsWith("/")) {
      return null;
    }
    const firstNl = trimmed.indexOf("\n");
    const head = firstNl === -1 ? trimmed : trimmed.slice(0, firstNl);
    const afterFirst = firstNl === -1 ? "" : trimmed.slice(firstNl + 1);
    if (afterFirst.trim().length > 0) {
      return null;
    }
    const m = /^\/([a-zA-Z][a-zA-Z0-9_-]*)(?:\s+(.*))?$/.exec(head.trim());
    if (!m) {
      return null;
    }
    return { command: m[1].toLowerCase(), args: (m[2] || "").trim() };
  }

  /**
   * Demande au backend d'annuler le run en cours. Le backend appelle
   * `agent.cancel` côté moteur, puis renvoie un `state: busy=false` qui
   * restaurera l'icône envoi via le handler `case "state"`.
   */
  function requestCancel() {
    vscode.postMessage({ type: "cancelRun" });
  }

  function doSend() {
    if (pendingUserAsk && !busy) {
      return;
    }

    const raw = promptEl.value;
    const slash = parseSlashCommand(raw);

    if (busy) {
      if (pendingUserAsk) {
        return;
      }
      if (slash) {
        vscode.postMessage({
          type: "slash",
          slashInvalid:
            "Les commandes / ne peuvent pas être mises en file pendant un run.",
        });
        return;
      }
      tryEnqueueFromComposer();
      return;
    }

    if (slash) {
      const hasStuff =
        attachments.length > 0 ||
        references.length > 0 ||
        pasteAttachments.length > 0;
      if (hasStuff && slash.command !== "clear" && slash.command !== "new") {
        vscode.postMessage({
          type: "slash",
          slashInvalid:
            "Retirez les pièces jointes, références et smart paste pour cette commande (sauf `/clear` / `/new`).",
        });
        return;
      }
      if (slash.command === "clear" || slash.command === "new") {
        clearPendingPrompts();
        attachments = [];
        renderAttachments();
        references = [];
        pasteAttachments = [];
        renderRefs();
      }
      vscode.postMessage({
        type: "slash",
        command: slash.command,
        args: slash.args,
      });
      promptEl.value = "";
      historyIdx = -1;
      historyDraft = "";
      autoresize();
      return;
    }

    const text = raw.trim();
    if (isComposerPayloadEmpty(text)) {
      return;
    }

    performSend(snapshotComposerPayload(text));
  }

  if (sendBtn) {
    sendBtn.addEventListener("click", doSend);
  } else {
    diag("DOM manquant: #send");
  }
  if (stopRunBtn) {
    stopRunBtn.addEventListener("click", () => {
      if (busy) {
        requestCancel();
      }
    });
  }
  diag("checkpoint D");

  /** True si le curseur est sur la première ligne (avant le 1er saut). */
  function caretOnFirstLine() {
    const v = promptEl.value;
    const pos = promptEl.selectionStart ?? 0;
    return v.slice(0, pos).indexOf("\n") === -1;
  }

  /** True si le curseur est sur la dernière ligne. */
  function caretOnLastLine() {
    const v = promptEl.value;
    const pos = promptEl.selectionStart ?? 0;
    return v.slice(pos).indexOf("\n") === -1;
  }

  function placeCaretAtEnd() {
    const end = promptEl.value.length;
    promptEl.setSelectionRange(end, end);
    autoresize();
  }

  if (promptEl) {
    promptEl.addEventListener("keydown", (e) => {
    if (e.isComposing) {
      return;
    }

    if (pathSuggestionsOpen()) {
      if (e.key === "ArrowDown") {
        e.preventDefault();
        pathSuggestions.selected = Math.min(
          pathSuggestions.selected + 1,
          pathSuggestions.items.length - 1,
        );
        renderPathSuggestions();
        return;
      }
      if (e.key === "ArrowUp") {
        e.preventDefault();
        pathSuggestions.selected = Math.max(pathSuggestions.selected - 1, 0);
        renderPathSuggestions();
        return;
      }
      if (e.key === "Tab" || (e.key === "Enter" && !e.shiftKey)) {
        e.preventDefault();
        const item = pathSuggestions.items[pathSuggestions.selected];
        if (item) {
          applyPathSuggestion(item);
        }
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        hidePathSuggestions();
        return;
      }
    }

    if (e.key === "Enter") {
      if (e.shiftKey) {
        return;
      }
      e.preventDefault();
      doSend();
      return;
    }

    if (e.key === "Escape") {
      if (promptEl.value.length > 0) {
        e.preventDefault();
        promptEl.value = "";
        hidePathSuggestions();
        autoresize();
        updatePromptPlaceholder();
      } else {
        promptEl.blur();
      }
      historyIdx = -1;
      historyDraft = "";
      return;
    }

    if (e.key === "ArrowUp" && caretOnFirstLine() && history.length > 0) {
      if (historyIdx === -1) {
        historyDraft = promptEl.value;
      }
      const next = Math.min(historyIdx + 1, history.length - 1);
      if (next !== historyIdx) {
        historyIdx = next;
        promptEl.value = history[historyIdx];
        placeCaretAtEnd();
      }
      e.preventDefault();
      return;
    }

    if (e.key === "ArrowDown" && historyIdx !== -1 && caretOnLastLine()) {
      const next = historyIdx - 1;
      if (next < 0) {
        historyIdx = -1;
        promptEl.value = historyDraft;
      } else {
        historyIdx = next;
        promptEl.value = history[historyIdx];
      }
      placeCaretAtEnd();
      e.preventDefault();
    }
  });
  }

  // --- Historique des discussions ---

  function clearLog() {
    finalizeAssistant();
    hideLoader();
    closeCurrentPhase();
    logEl.innerHTML = "";
    msgDomSeq = 0;
    toolBlocks.clear();
    activeToolNames.clear();
    currentTodoBlockEl = null;
    currentCoursePlanBlockEl = null;
    stickySnapshot = null;
    stickyExpanded = false;
    hideTodoSticky();
    courseStickySnapshot = null;
    courseStickyExpanded = false;
    hideCoursePlanSticky();
    hideUserPromptSticky();
    clearPendingPrompts();
  }

  function openHistory() {
    historyPanel.classList.add("open");
    historyPanel.setAttribute("aria-hidden", "false");
    vscode.postMessage({ type: "listSessions" });
  }

  function closeHistory() {
    historyPanel.classList.remove("open");
    historyPanel.setAttribute("aria-hidden", "true");
  }

  function toggleHistory() {
    if (historyPanel.classList.contains("open")) {
      closeHistory();
    } else {
      openHistory();
    }
  }

  function newChat() {
    closeHistory();
    vscode.postMessage({ type: "newChat" });
    promptEl.focus();
  }

  /** @param {number} secs */
  function relativeTime(secs) {
    if (!secs) return "—";
    const diff = Date.now() / 1000 - secs;
    if (diff < 60) return "à l’instant";
    if (diff < 3600) return `il y a ${Math.floor(diff / 60)} min`;
    if (diff < 86400) return `il y a ${Math.floor(diff / 3600)} h`;
    if (diff < 86400 * 7) return `il y a ${Math.floor(diff / 86400)} j`;
    const d = new Date(secs * 1000);
    return d.toLocaleDateString();
  }

  function formatBytes(n) {
    if (!n) return "0 o";
    if (n < 1024) return n + " o";
    if (n < 1024 * 1024) return (n / 1024).toFixed(1) + " Ko";
    return (n / (1024 * 1024)).toFixed(1) + " Mo";
  }

  function renderHistory(payload) {
    historyList.innerHTML = "";
    if (payload.error) {
      const err = document.createElement("div");
      err.className = "history-error";
      err.textContent = payload.error;
      historyList.appendChild(err);
      return;
    }
    const items = Array.isArray(payload.items) ? payload.items : [];
    if (items.length === 0) {
      const empty = document.createElement("div");
      empty.className = "history-empty";
      empty.textContent = "Aucune conversation enregistrée pour l’instant.";
      historyList.appendChild(empty);
      return;
    }
    for (const it of items) {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "history-item";
      if (it.id === currentSessionId) {
        btn.classList.add("current");
      }
      const title = document.createElement("span");
      title.className = "title";
      title.textContent = it.id.replace(/^ses_/, "").slice(0, 8) + "…";
      title.title = it.id;
      const meta = document.createElement("span");
      meta.className = "meta";
      const when = document.createElement("span");
      when.textContent = relativeTime(it.modifiedSecs);
      const size = document.createElement("span");
      size.className = "size";
      size.textContent = formatBytes(it.sizeBytes);
      meta.appendChild(when);
      meta.appendChild(size);
      btn.appendChild(title);
      btn.appendChild(meta);
      btn.addEventListener("click", () => {
        closeHistory();
        // Ne pas vider le log ici : `loadSession` envoie `chatReset`. Si le
        // chargement échoue (moteur indisponible), on garde l'affichage courant.
        vscode.postMessage({ type: "loadSession", sessionId: it.id });
      });
      historyList.appendChild(btn);
    }
  }

  const requiredDomIds = [
    "log",
    "prompt",
    "send",
    "new-chat",
    "history-toggle",
    "open-settings",
    "history-panel",
    "history-list",
  ];
  for (const id of requiredDomIds) {
    if (!document.getElementById(id)) {
      diag(`DOM manquant: #${id}`);
    }
  }

  if (newChatBtn) {
    newChatBtn.addEventListener("click", () => {
      diag("click new-chat");
      newChat();
    });
  } else {
    diag("bouton #new-chat introuvable — listeners non branchés");
  }
  if (historyToggleBtn) {
    historyToggleBtn.addEventListener("click", () => {
      diag("click history-toggle");
      toggleHistory();
    });
  } else {
    diag("bouton #history-toggle introuvable");
  }
  if (historyCloseBtn) {
    historyCloseBtn.addEventListener("click", closeHistory);
  }
  if (openSettingsBtn) {
    openSettingsBtn.addEventListener("click", () => {
      diag("click open-settings");
      vscode.postMessage({ type: "openSettings" });
    });
  } else {
    diag("bouton #open-settings introuvable");
  }
  diag("checkpoint header buttons");
  if (stickyTodoEl) {
    // Clic simple = toggle compact ↔ expanded ; Alt+clic = scroll vers le
    // bloc complet dans le log (utile quand on veut voir l'historique
    // détaillé des transitions, par ex. les contents successifs d'un même
    // item).
    stickyTodoEl.addEventListener("click", (e) => {
      if (e.altKey) {
        scrollToTodoBlock();
        return;
      }
      toggleStickyTodo();
    });
    stickyTodoEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        toggleStickyTodo();
      }
    });
  }
  if (stickyCoursePlanEl) {
    stickyCoursePlanEl.addEventListener("click", (e) => {
      if (e.altKey) {
        scrollToCoursePlanBlock();
        return;
      }
      courseStickyExpanded = !courseStickyExpanded;
      renderCoursePlanSticky();
    });
    stickyCoursePlanEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        courseStickyExpanded = !courseStickyExpanded;
        renderCoursePlanSticky();
      }
    });
  }
  if (stickyUserPromptEl) {
    stickyUserPromptEl.addEventListener("click", () => {
      scrollToUserPromptMessage();
    });
    stickyUserPromptEl.addEventListener("keydown", (e) => {
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        scrollToUserPromptMessage();
      }
    });
  }

  // Raccourcis globaux niveau document : focus / clear / nouvelle / historique.
  document.addEventListener("keydown", (e) => {
    const mod = e.ctrlKey || e.metaKey;
    // Sprint Questions bloquantes (§2.13) — Esc skip la carte active si
    // aucun panneau historique n'est ouvert. Le textarea de la carte a
    // déjà son propre handler ; on couvre ici le cas où le focus est
    // ailleurs (boutons d'option, etc.).
    if (
      e.key === "Escape" &&
      pendingUserAsk &&
      !historyPanel.classList.contains("open")
    ) {
      e.preventDefault();
      skipUserAsk();
      return;
    }
    if (e.key === "Escape" && historyPanel.classList.contains("open")) {
      e.preventDefault();
      closeHistory();
      return;
    }
    if (mod && (e.key === "k" || e.key === "K")) {
      e.preventDefault();
      promptEl.focus();
      return;
    }
    if (mod && (e.key === "l" || e.key === "L")) {
      e.preventDefault();
      clearLog();
      return;
    }
    if (mod && (e.key === "n" || e.key === "N")) {
      e.preventDefault();
      newChat();
      return;
    }
    if (mod && (e.key === "h" || e.key === "H")) {
      e.preventDefault();
      toggleHistory();
      return;
    }
    if (mod && (e.key === "i" || e.key === "I")) {
      e.preventDefault();
      vscode.postMessage({ type: "pickReferences" });
    }
  });

  // --- Réception messages backend ---

  function flushReplayQueue() {
    replayDrainScheduled = false;
    const deadline = performance.now() + 14;
    while (replayMessageQueue.length > 0 && performance.now() < deadline) {
      const item = replayMessageQueue.shift();
      if (!item) {
        continue;
      }
      // Diffs fichier après le texte : ne pas les afficher pendant le replay actif.
      if (item.kind === "fileChange" && replayingHistory) {
        replayMessageQueue.unshift(item);
        break;
      }
      dispatchBackendMessage(item);
    }
    if (replayMessageQueue.length > 0) {
      scheduleReplayDrain();
    }
  }

  function scheduleReplayDrain() {
    if (replayDrainScheduled) {
      return;
    }
    replayDrainScheduled = true;
    requestAnimationFrame(flushReplayQueue);
  }

  /**
   * @param {Record<string, unknown>} m
   */
  function dispatchBackendMessage(m) {
    try {
      dispatchBackendMessageInner(m);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      diag(`dispatchBackendMessage ERREUR kind=${m.kind}: ${msg}`);
      console.error("[drox chat] message handler error", m.kind, err);
    }
  }

  /**
   * @param {Record<string, unknown>} m
   */
  function dispatchBackendMessageInner(m) {
    switch (m.kind) {
      case "clearAssistant":
        finalizeAssistant();
        closeCurrentPhase();
        break;
      case "phase":
        if (m.close === true) {
          closeCurrentPhase();
          break;
        }
        if (typeof m.phase === "string") {
          enterPhase(m.phase);
        }
        break;
      case "append":
        finalizeAssistant();
        hideLoader();
        if (m.role === "user") {
          const userRow = appendChatBubble("user", m.text ?? "");
          if (!replayingHistory && userPromptStickyPendingLink) {
            linkUserPromptStickyToMessage(userRow.dataset.msgId);
          }
        } else if (m.role === "assistant") {
          appendChatBubble("assistant", m.text ?? "");
        } else if (m.role === "error") {
          appendBlock("msg-error", m.text ?? "");
        } else if (m.role === "system") {
          appendBlock("msg-system", m.text ?? "");
        }
        break;
      case "delta":
        appendDelta(m.text ?? "");
        break;
      case "tool":
        if (m.phase === "start" || m.phase === "finish") {
          handleToolEvent(m);
        }
        if (m.phase === "finish" && busy) {
          showLoader();
        }
        break;
      case "usage":
        if (typeof m.inputTokens === "number") {
          totalIn += m.inputTokens;
          // `inputTokens` = `prompt_eval_count` côté Ollama, c'est-à-dire
          // la taille **réelle** du contexte chargé pour ce tour (system +
          // tools + transcript + user). C'est exactement ce qu'on veut
          // afficher en bas à droite comme "ctx" — sans attendre un event
          // `context_snip` qui n'arrive presque jamais.
          ctxTokens = m.inputTokens;
        }
        if (typeof m.outputTokens === "number") totalOut += m.outputTokens;
        renderStatus();
        break;
      case "context":
        if (typeof m.tokensUsed === "number") {
          ctxTokens = m.tokensUsed;
          renderStatus();
        }
        break;
      case "memory":
        finalizeAssistant();
        hideLoader();
        appendMemoryChip(m);
        break;
      case "state":
        busy = !!m.busy;
        sendBtn.classList.remove("loading");
        updateComposerChrome();
        setRunActive(busy);
        if (busy) {
          showLoader();
        } else {
          hideLoader();
          finalizeAssistant();
          closeCurrentPhase();
          flushPendingPromptQueue();
        }
        break;
      case "session":
        currentSessionId = typeof m.id === "string" ? m.id : null;
        if (m.uiStats && typeof m.uiStats === "object") {
          const u = m.uiStats;
          if (typeof u.totalIn === "number") {
            totalIn = u.totalIn;
          }
          if (typeof u.totalOut === "number") {
            totalOut = u.totalOut;
          }
          if (typeof u.ctx === "number") {
            ctxTokens = u.ctx;
          }
          renderStatus();
        }
        break;
      case "userPromptSticky":
        if (!replayingHistory) {
          setUserPromptSticky(m);
        }
        break;
      case "runObjective":
        if (!replayingHistory) {
          setRunObjectiveSticky(m);
        }
        break;
      case "scopeParkingUpdate":
        if (!replayingHistory) {
          renderScopeParking(m);
        }
        break;
      case "replay":
        if (m.active) {
          startReplayMode(m.fileDiffs);
        } else {
          endReplayMode();
        }
        break;
      case "chatReset":
        replayMessageQueue = [];
        replayDrainScheduled = false;
        clearLog();
        totalIn = 0;
        totalOut = 0;
        ctxTokens = 0;
        pasteAttachments = [];
        pasteCandidates.clear();
        clearPendingPrompts();
        renderRefs();
        renderStatus();
        // Si une carte Questions traînait, on la ferme pour repartir
        // proprement (le serveur a déjà reçu la réponse skip via le
        // handler `chatView.startNewChat` → `resolvePendingUserAskAsSkipped`).
        if (pendingUserAsk) {
          closeUserAskCard();
        }
        hasCoursePlanInRun = false;
        hideCoursePlanSticky();
        renderCourseCycleBanner({ active: false });
        updateProfessorGuardBanner();
        hideRunObjectiveSticky();
        hideScopeParking();
        break;
      case "todoUpdate":
        renderTodos(Array.isArray(m.todos) ? m.todos : []);
        break;
      case "coursePlanUpdate":
        hasCoursePlanInRun = true;
        updateProfessorGuardBanner();
        renderCoursePlan({
          courseTitle:
            typeof m.courseTitle === "string" ? m.courseTitle : "",
          steps: Array.isArray(m.steps) ? m.steps : [],
        });
        break;
      case "courseCycleActive":
        renderCourseCycleBanner(m);
        break;
      case "sessions":
        renderHistory(m);
        break;
      case "fileChange":
        if (replayingHistory) {
          break;
        }
        finalizeAssistant();
        hideLoader();
        appendFileChange(m);
        break;
      case "appendReferences": {
        const uris = Array.isArray(m.uris) ? m.uris : [];
        const asStrings = uris.map((u) => String(u)).filter((s) => s.length > 0);
        if (asStrings.length > 0) {
          addUriRefs(asStrings);
          promptEl.focus();
        }
        break;
      }
      case "prefillPrompt":
        prefillComposer(
          typeof m.text === "string" ? m.text : "",
          { replace: m.replace === true },
        );
        break;
      case "userAsk": {
        const askId = typeof m.askId === "string" ? m.askId : "";
        const questions = Array.isArray(m.questions) ? m.questions : [];
        if (askId && questions.length > 0) {
          openUserAskCard({
            askId,
            title: typeof m.title === "string" ? m.title : null,
            questions: questions.map((q, i) => ({
              id: typeof q.id === "string" && q.id ? q.id : `q${i + 1}`,
              prompt: typeof q.prompt === "string" ? q.prompt : "",
              options: Array.isArray(q.options)
                ? q.options.map((o, j) => ({
                    id: typeof o.id === "string" && o.id ? o.id : `opt${j + 1}`,
                    label: typeof o.label === "string" ? o.label : "",
                  }))
                : [],
              allowMultiple: Boolean(q.allowMultiple),
              allowFreeText: Boolean(q.allowFreeText),
            })),
          });
        }
        break;
      }
      case "pathCompleteResult": {
        const reqId = typeof m.requestId === "string" ? m.requestId : "";
        if (!reqId || reqId !== pathCompletePendingId || !pathSuggestions) {
          break;
        }
        pathCompletePendingId = null;
        const cursor = promptEl.selectionStart ?? 0;
        const ctx = findAtCompletionContext(promptEl.value, cursor);
        if (!ctx) {
          hidePathSuggestions();
          break;
        }
        const items = Array.isArray(m.items) ? m.items : [];
        if (items.length === 0) {
          hidePathSuggestions();
          break;
        }
        pathSuggestions = {
          items: items.map((it) => ({
            label: String(it.label ?? ""),
            insertText: String(it.insertText ?? ""),
            kind: String(it.kind ?? "file"),
            description:
              typeof it.description === "string" ? it.description : undefined,
          })),
          selected: 0,
          replaceStart: ctx.replaceStart,
          replaceEnd: ctx.replaceEnd,
        };
        renderPathSuggestions();
        break;
      }
      case "pasteCandidate": {
        const c = m.candidate;
        if (
          c &&
          typeof c.token === "string" &&
          typeof c.text === "string" &&
          typeof c.absPath === "string"
        ) {
          const kind = c.kind === "terminal" ? "terminal" : "editor";
          pasteCandidates.set(c.token, {
            id: typeof c.id === "string" ? c.id : c.token,
            token: c.token,
            kind,
            absPath: c.absPath,
            relPath: typeof c.relPath === "string" ? c.relPath : null,
            languageId:
              typeof c.languageId === "string"
                ? c.languageId
                : kind === "terminal"
                  ? "shellsession"
                  : "plaintext",
            startLine:
              typeof c.startLine === "number" && c.startLine > 0
                ? c.startLine
                : 1,
            endLine:
              typeof c.endLine === "number" && c.endLine > 0 ? c.endLine : 1,
            lineCount:
              typeof c.lineCount === "number" && c.lineCount > 0
                ? c.lineCount
                : 1,
            text: c.text,
          });
          // Pas plus de 10 candidats actifs (cap symétrique au tracker
          // extension). Si on dépasse, on retire le plus ancien.
          while (pasteCandidates.size > 10) {
            const oldest = pasteCandidates.keys().next().value;
            if (oldest === undefined) break;
            pasteCandidates.delete(oldest);
          }
        }
        break;
      }
      default:
        break;
    }
  }

  window.addEventListener("message", (event) => {
    const m = event.data;
    if (!m || typeof m.kind !== "string") {
      return;
    }
    const priority =
      m.kind === "replay" ||
      m.kind === "userPromptSticky" ||
      m.kind === "runObjective" ||
      m.kind === "scopeParkingUpdate" ||
      m.kind === "prefillPrompt" ||
      m.kind === "chatReset" ||
      m.kind === "session" ||
      m.kind === "sessions" ||
      m.kind === "state" ||
      m.kind === "clearAssistant" ||
      m.kind === "append" ||
      m.kind === "delta" ||
      m.kind === "userAsk";
    if (replayingHistory && !priority) {
      replayMessageQueue.push(m);
      scheduleReplayDrain();
      return;
    }
    dispatchBackendMessage(m);
  });

  diag("checkpoint E");
  safeInit("renderStatus", () => renderStatus());
  safeInit("composerChrome", () => updateComposerChrome());

  window.addEventListener("error", (ev) => {
    diag(`window.error: ${ev.message || ev}`);
  });
  window.addEventListener("unhandledrejection", (ev) => {
    const r = ev.reason;
    diag(`unhandledrejection: ${r instanceof Error ? r.message : String(r)}`);
  });

  safeInit("userPromptSticky", () => hideUserPromptSticky());
  safeInit("runObjective", () => hideRunObjectiveSticky());
  safeInit("scopeParking", () => hideScopeParking());
  diag("checkpoint F — fin init");
  postWebviewReadyOnce();
})();
