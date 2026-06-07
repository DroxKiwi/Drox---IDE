//! Stamp de build dev — injecté dans le binaire à chaque compilation de `drox-cli`.

use std::time::{SystemTime, UNIX_EPOCH};

fn main() {
    let ts = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .expect("clock")
        .as_secs();
    // 6 chiffres : change à chaque rebuild du binaire (visible dans le header chat).
    let dev_build = ts % 1_000_000;
    println!("cargo:rustc-env=DROX_DEV_BUILD={dev_build}");
    println!("cargo:rerun-if-changed=build.rs");
}
