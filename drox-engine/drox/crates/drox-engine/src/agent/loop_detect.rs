//! Détection de boucles turn-à-turn (empreinte stricte + familles bash/grep).

use drox_types::{StopReason, ToolUseId, Usage};
use serde_json::Value;

use crate::event::Phase;

#[derive(Clone)]
pub(crate) struct PendingToolCall {
    pub(crate) id: ToolUseId,
    pub(crate) name: String,
    pub(crate) arguments: Value,
}

/// Sprint Hotfix « boucle édition/lecture » — détecteur de répétition strict
/// turn-à-turn. Le modèle (typ. GLM-4.7-Flash sous pression de contexte) se
/// met parfois à **répéter exactement** le même texte assistant et/ou les
/// mêmes `tool_calls` (mêmes args), sans jamais converger vers `[phase: done]`.
/// Sans filet, le run épuise `max_iterations` en gaspillant des tokens.
///
/// Heuristique V1 (stricte) + V1.1 familles ciblées (`bash`/`grep`) :
/// 1. Empreinte tour : (texte+thinking, signature tool_calls brutes).
/// 2. Identique → Warn puis Abort (historique).
/// 3. Famille bash/grep aux args **normalisés** identiques (casse, `cmd & cmd`)
///    → Warn/Abort même si thinking change (dogfood findstr Metrics retry).
///
/// Anti-faux-positif : seuls les nudges qui **changent vraiment** le contrat
/// (todo ouverte, testing dû, InvalidArgs, etc.) appellent `reset`.
/// Les nudges `DONE_ONLY` / générique **ne reset plus** (1.6.0 L-1) — sinon
/// un modèle qui omet `done` régénère la même réponse jusqu'à `max_iterations`.
/// Depuis 1.5.14, `observe` est appelé **après** les gates `[phase: done]`.
#[derive(Default)]
pub(crate) struct LoopDetector {
    /// Hash du dernier tour observé (`None` au début du run).
    last_fingerprint: Option<u64>,
    /// Composante texte du dernier tour (utile pour qualifier `kind` :
    /// « text » / « tool_calls » / « both »).
    last_text_hash: u64,
    last_tools_hash: u64,
    /// Empreinte tools après normalisation (familles bash/grep).
    last_tools_family_hash: Option<u64>,
    /// Nombre de tours identiques **consécutifs** observés.
    strike: u32,
    /// Strikes consécutifs sur la même famille d'outils normalisée.
    family_strike: u32,
    /// Hash du **body** assistant seul (sans thinking) — filet text-only 1.6.0 L-2.
    last_body_hash: Option<u64>,
    /// Strikes body identique sans tool_call (thinking ignoré).
    text_only_strike: u32,
    /// 1.6.0 L-tools — signature `(name, args)` du dernier round d'outils.
    last_tools_call_sig: Option<u64>,
    /// Hash des outputs LLM du dernier round (progrès = output change).
    last_tools_output_sig: Option<u64>,
    /// Strikes même call + même output (pas de progrès).
    tools_progress_strike: u32,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub(crate) enum LoopDecision {
    /// Tour normal, pas de répétition.
    Ok,
    /// 1re répétition stricte — injecter un nudge anti-boucle.
    Warn { kind: &'static str },
    /// 2e répétition après nudge — stopper avec `EngineError::LoopDetected`.
    Abort { kind: &'static str, turns: u32 },
}

impl LoopDetector {
    pub(crate) fn new() -> Self {
        Self::default()
    }

    /// Reset le compteur (nudges structurels qui forcent un comportement
    /// différent — pas les relances `DONE_ONLY` / générique).
    pub(crate) fn reset(&mut self) {
        self.strike = 0;
        self.family_strike = 0;
        self.text_only_strike = 0;
        self.last_body_hash = None;
        self.tools_progress_strike = 0;
        self.last_tools_call_sig = None;
        self.last_tools_output_sig = None;
    }

    /// Examine un `TurnOutcome` et renvoie la décision à prendre. `outcome`
    /// est passé par ref : on ne touche pas à son contenu.
    pub(crate) fn observe(&mut self, outcome: &TurnOutcome) -> LoopDecision {
        // Thinking natif compte pour l'empreinte stricte : sinon KAT-Coder /
        // modèles *think* n'ont qu'un texte vide + le même tool cassé → faux
        // positif immédiat. Le filet text-only (L-2) ignore volontairement
        // le thinking pour les tours sans tool.
        let text_h = combine_hash(hash_text(&outcome.text), hash_text(&outcome.thinking));
        let body_h = hash_text(&outcome.text);
        let tools_h = hash_tool_calls(&outcome.tool_calls);
        let tools_family_h = hash_tool_calls_family(&outcome.tool_calls);
        let fp = combine_hash(text_h, tools_h);
        let targeted_family = is_targeted_tool_loop_family(&outcome.tool_calls);
        let text_only = outcome.tool_calls.is_empty() && !outcome.text.trim().is_empty();

        // Tour vide (ni texte significatif, ni thinking, ni outils) : on laisse
        // les gates `tool_calls.is_empty()` + `NUDGE_PROMPT` faire leur job et
        // on n'incrémente pas — sinon un run silencieux puis re-silencieux
        // se ferait flagger par erreur.
        if outcome.text.trim().is_empty()
            && outcome.thinking.trim().is_empty()
            && outcome.tool_calls.is_empty()
        {
            self.last_fingerprint = Some(fp);
            self.last_text_hash = text_h;
            self.last_tools_hash = tools_h;
            self.last_tools_family_hash = None;
            self.family_strike = 0;
            self.last_body_hash = None;
            self.text_only_strike = 0;
            return LoopDecision::Ok;
        }

        let exact_repeat = matches!(self.last_fingerprint, Some(prev) if prev == fp);
        let family_repeat = targeted_family
            && matches!(self.last_tools_family_hash, Some(prev) if prev == tools_family_h);
        let body_repeat =
            text_only && matches!(self.last_body_hash, Some(prev) if prev == body_h);

        // Mise à jour de l'état AVANT de retourner : le prochain `observe`
        // doit voir l'empreinte courante quelle que soit la décision.
        let last_text_h = self.last_text_hash;
        let last_tools_h = self.last_tools_hash;
        self.last_fingerprint = Some(fp);
        self.last_text_hash = text_h;
        self.last_tools_hash = tools_h;
        if targeted_family {
            self.last_tools_family_hash = Some(tools_family_h);
        } else {
            self.last_tools_family_hash = None;
            self.family_strike = 0;
        }
        if text_only {
            self.last_body_hash = Some(body_h);
        } else {
            self.last_body_hash = None;
            self.text_only_strike = 0;
        }

        // 0) Text-only body (sans tool) — warn@2, hard@3 ; thinking ignoré.
        if text_only {
            if body_repeat {
                self.text_only_strike = self.text_only_strike.saturating_add(1);
                match self.text_only_strike {
                    1 => return LoopDecision::Warn { kind: "text_only" },
                    _ => {
                        return LoopDecision::Abort {
                            kind: "text_only",
                            turns: self.text_only_strike + 1,
                        };
                    }
                }
            }
            self.text_only_strike = 0;
        }

        // 1) Famille d'outils (bash/grep normalisés) — même si thinking change.
        if family_repeat {
            self.family_strike = self.family_strike.saturating_add(1);
            match self.family_strike {
                1 | 2 => return LoopDecision::Warn { kind: "tool_family" },
                _ => {
                    return LoopDecision::Abort {
                        kind: "tool_family",
                        turns: self.family_strike + 1,
                    };
                }
            }
        } else if targeted_family {
            self.family_strike = 0;
        }

        // 2) Empreinte stricte (texte + tools bruts) — comportement historique.
        if !exact_repeat {
            self.strike = 0;
            return LoopDecision::Ok;
        }

        // Qualifie le `kind` pour le message d'erreur / nudge.
        let kind = if text_h == last_text_h && tools_h == last_tools_h {
            "both"
        } else if text_h == last_text_h {
            "text"
        } else {
            "tool_calls"
        };

        self.strike = self.strike.saturating_add(1);
        match self.strike {
            // 1er + 2e strike → nudge (laisse plus de marge aux retries
            // JSON d'outils / thinking models). Abort au 3e.
            1 | 2 => LoopDecision::Warn { kind },
            _ => LoopDecision::Abort {
                kind,
                turns: self.strike + 1, // strike == 3 → 4e tour identique au total
            },
        }
    }

    /// 1.6.0 L-tools — après exécution des tools du tour.
    ///
    /// Même `(name, args)` + **même** output → warn puis abort.
    /// Même call + output **différent** → progrès (polling) : reset strike.
    pub(crate) fn observe_tool_outputs(
        &mut self,
        calls: &[PendingToolCall],
        output_blob: &str,
    ) -> LoopDecision {
        if calls.is_empty() {
            self.last_tools_call_sig = None;
            self.last_tools_output_sig = None;
            self.tools_progress_strike = 0;
            return LoopDecision::Ok;
        }
        let call_sig = hash_tool_calls(calls);
        let out_sig = hash_text(output_blob);
        let same_call = matches!(self.last_tools_call_sig, Some(prev) if prev == call_sig);
        let same_out = matches!(self.last_tools_output_sig, Some(prev) if prev == out_sig);

        self.last_tools_call_sig = Some(call_sig);
        self.last_tools_output_sig = Some(out_sig);

        if !same_call {
            self.tools_progress_strike = 0;
            return LoopDecision::Ok;
        }
        if !same_out {
            // Même outil, output qui change = progrès (polling).
            self.tools_progress_strike = 0;
            return LoopDecision::Ok;
        }
        self.tools_progress_strike = self.tools_progress_strike.saturating_add(1);
        match self.tools_progress_strike {
            1 => LoopDecision::Warn { kind: "tools" },
            _ => LoopDecision::Abort {
                kind: "tools",
                turns: self.tools_progress_strike + 1,
            },
        }
    }
}

/// Hash stable d'un fragment de texte (FNV-1a-like via `DefaultHasher`).
/// On `trim` pour éviter qu'un saut de ligne en plus change l'empreinte —
/// les deltas Ollama sont fragmentés et le `consume_stream` recolle parfois
/// avec des espaces autour des marqueurs supprimés.
pub(crate) fn hash_text(s: &str) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    s.trim().hash(&mut h);
    h.finish()
}

/// Signature stable d'une séquence de `PendingToolCall`. L'`id` est
/// **volontairement ignoré** (il change à chaque tour par construction), seuls
/// `name` + `arguments` sérialisés comptent. Pour les arguments, on passe par
/// `serde_json::to_string` ; deux turns identiques produiront le même JSON
/// d'arguments (les LLM sont déterministes au format près quand l'intention
/// est la même), c'est suffisant pour une détection stricte.
pub(crate) fn hash_tool_calls(calls: &[PendingToolCall]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    calls.len().hash(&mut h);
    for c in calls {
        c.name.hash(&mut h);
        let args = serde_json::to_string(&c.arguments).unwrap_or_default();
        args.hash(&mut h);
    }
    h.finish()
}

/// Empreinte tools après normalisation (familles bash / grep).
pub(crate) fn hash_tool_calls_family(calls: &[PendingToolCall]) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    calls.len().hash(&mut h);
    for c in calls {
        c.name.hash(&mut h);
        normalize_tool_args_for_loop_family(&c.name, &c.arguments).hash(&mut h);
    }
    h.finish()
}

pub(crate) fn is_targeted_tool_loop_family(calls: &[PendingToolCall]) -> bool {
    !calls.is_empty() && calls.iter().all(|c| c.name == "bash" || c.name == "grep")
}

/// Canonise les args d'un outil pour la détection de famille (pas de NLP user).
pub(crate) fn normalize_tool_args_for_loop_family(name: &str, args: &serde_json::Value) -> String {
    match name {
        "bash" => {
            let cmd = args
                .get("command")
                .and_then(|v| v.as_str())
                .unwrap_or("");
            normalize_bash_command_for_loop(cmd)
        }
        "grep" => {
            let pat = args
                .get("pattern")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            let path = args
                .get("path")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .replace('\\', "/")
                .to_lowercase();
            let glob = args
                .get("glob")
                .and_then(|v| v.as_str())
                .unwrap_or("")
                .to_lowercase();
            format!("{pat}|{path}|{glob}")
        }
        _ => serde_json::to_string(args).unwrap_or_default(),
    }
}

pub(crate) fn normalize_bash_command_for_loop(cmd: &str) -> String {
    let mut s = cmd.to_lowercase();
    loop {
        let next = strip_retry_noise(&s);
        if next == s {
            break;
        }
        s = next;
    }
    let mut segments: Vec<String> = split_bash_segments_for_loop(&s);
    segments.sort();
    segments.dedup();
    segments.join(" | ")
}

/// Découpe `&&`, `&`, `;` pour comparer le fond de la commande (ignore doublons).
pub(crate) fn split_bash_segments_for_loop(s: &str) -> Vec<String> {
    let unified = s.replace("&&", "\n").replace('&', "\n").replace(';', "\n");
    unified
        .split('\n')
        .map(|part| part.split_whitespace().collect::<Vec<_>>().join(" "))
        .filter(|part| !part.is_empty())
        .collect()
}

pub(crate) fn strip_retry_noise(s: &str) -> String {
    let bytes = s.as_bytes();
    let mut out = String::with_capacity(s.len());
    let mut i = 0;
    while i < bytes.len() {
        if bytes[i] == b'(' {
            let rest = &s[i..];
            if rest.starts_with("(retry)") {
                i += "(retry)".len();
                continue;
            }
            if rest.starts_with("(retry ") {
                if let Some(end) = rest.find(')') {
                    let inner = &rest[7..end];
                    if !inner.is_empty() && inner.bytes().all(|b| b.is_ascii_digit()) {
                        i += end + 1;
                        continue;
                    }
                }
            }
        }
        out.push(bytes[i] as char);
        i += 1;
    }
    out
}

pub(crate) fn combine_hash(a: u64, b: u64) -> u64 {
    use std::collections::hash_map::DefaultHasher;
    use std::hash::{Hash, Hasher};
    let mut h = DefaultHasher::new();
    a.hash(&mut h);
    b.hash(&mut h);
    h.finish()
}

pub(crate) struct TurnOutcome {
	/// Texte assistant **nettoyé** : tous les marqueurs `[phase: ...]` reconnus
	/// ont été retirés (y compris les lignes `reasoning` / `next-move` ignorées).
	/// C'est ce qui est poussé dans le transcript et renvoyé au LLM aux tours
	/// suivants — le contexte sémantique pour le modèle, sans la quincaillerie
	/// protocolaire.
	pub(crate) text: String,
	/// Trace *thinking* native (Ollama / reasoning_content). **Incluse dans
	/// l'empreinte anti-boucle** : sinon un modèle thinking qui n'émet que
	/// le même `todo_write` cassé + thinking différent est flaggé à tort.
	pub(crate) thinking: String,
	pub(crate) tool_calls: Vec<PendingToolCall>,
	pub(crate) reason: StopReason,
	pub(crate) usage: Usage,
	/// Dernière phase déclarée dans ce tour, si présente. Utilisée par
	/// `drive_inner` pour décider de la clôture (cf. `Phase::Done`).
	pub(crate) final_phase: Option<Phase>,
	/// `true` si la phase `Answering` a été déclarée à un moment ou un autre
	/// pendant ce tour. Sert à détecter les `Done` prématurés où le modèle
	/// écrit sa synthèse dans `reading`/`verifying` puis ferme sans passer
	/// par `answering` (cf. Sprint A.3 — answering-before-done).
	pub(crate) saw_answering: bool,
	/// `true` si `[phase: analyzing]` a été déclaré pendant ce tour (§2.18).
	pub(crate) saw_analyzing: bool,
	/// `true` si `[phase: testing]` a été déclaré pendant ce tour (§2.11).
	pub(crate) saw_testing: bool,
}
