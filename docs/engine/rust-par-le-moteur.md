Rédigé à l'aide de Cursor Agent

# Apprendre Rust avec le moteur Drox

Ici, on n’apprend pas Rust « dans le vide ». On ouvre le **vrai code** de Drox et on lit comment une partie précise du moteur est écrite — en détail, ligne après ligne.

## Par où commencer

| Document | Contenu |
|----------|---------|
| **[rust-parcours-inference.md](rust-parcours-inference.md)** | Fil principal : comment Drox parle à Ollama (requête d’inférence), en expliquant la syntaxe Rust et ce que ça fait dans la machine |
| [llm-backends.md](llm-backends.md) | Référence technique des backends (sans le fil pédagogique) |
| [architecture-overview.md](architecture-overview.md) | Vue des crates du workspace |

## Comment lire le parcours

1. Garde ce README pour te repérer.
2. Ouvre [rust-parcours-inference.md](rust-parcours-inference.md) et suis-le **du début à la fin** une première fois.
3. Quand un fichier source est cité, ouvre-le dans l’éditeur à côté : le tutoriel et le code se répondent.
4. Les numéros de ligne peuvent bouger un peu avec le temps : cherche le **nom** de la fonction (`create_llm_client`, `stream_chat`, …).

Le parcours commence par des idées très générales (qu’est-ce qu’un programme, une variable, une fonction), puis les retrouve immédiatement dans Drox. Ensuite seulement apparaissent des idées plus spécifiques à Rust (`struct`, `trait`, `async`, `Arc`…).
