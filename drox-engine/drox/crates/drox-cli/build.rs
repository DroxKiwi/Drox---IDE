//! Stamp de build dev — injecté dans le binaire à chaque compilation de `drox-cli`.
//! Désactivé quand `DROX_OMIT_DEV_BUILD=1` (package release / drox:ship).

use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let omit = std::env::var("DROX_OMIT_DEV_BUILD")
        .ok()
        .is_some_and(|v| v == "1" || v.eq_ignore_ascii_case("true"));
    let dev_build = if omit {
        0
    } else {
        let ts = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .expect("clock")
            .as_secs();
        // 6 chiffres : change à chaque rebuild du binaire (visible dans le header chat).
        ts % 1_000_000
    };
    println!("cargo:rustc-env=DROX_DEV_BUILD={dev_build}");
    println!("cargo:rerun-if-changed=build.rs");
    println!("cargo:rerun-if-env-changed=DROX_OMIT_DEV_BUILD");
}
