#![cfg(feature = "embed")]

use std::path::PathBuf;

/// Dogfood only — needs GGUF under `drox-engine/models/`. Not run in default `cargo test`.
/// `cargo test -p drox-embed --features embed --test live_minilm -- --ignored --nocapture`
#[test]
#[ignore = "requires all-MiniLM-L6-v2.Q4_K_M.gguf (see scripts/fetch-drox-embed-model.ps1)"]
fn load_and_encode_minilm() {
    let path = PathBuf::from(env!("CARGO_MANIFEST_DIR"))
        .join("../../../models/all-MiniLM-L6-v2.Q4_K_M.gguf");
    assert!(path.is_file(), "missing model at {}", path.display());
    drox_embed::load_model(&path).expect("load");
    let st = drox_embed::status();
    assert!(st.model_loaded);
    assert!(st.dimensions.unwrap_or(0) > 0);
    let rows = drox_embed::encode(&["hello world".into()]).expect("encode");
    assert_eq!(rows.len(), 1);
    assert!(!rows[0].values.is_empty());
    eprintln!("dims={} first={}", rows[0].values.len(), rows[0].values[0]);
}
