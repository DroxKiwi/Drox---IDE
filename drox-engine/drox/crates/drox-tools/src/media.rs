//! Médias sur disque : image, audio, vidéo.
//!
//! Le modèle les désigne par leur chemin. Le corps n'entre pas dans le contexte.
//! Le SVG reste du texte éditable et n'est pas dans cette liste.

use camino::Utf8Path;
use serde_json::{json, Value};

/// Type MIME si `path` désigne un média (extension), sinon `None`.
#[must_use]
pub(crate) fn media_type_for_path(path: &str) -> Option<&'static str> {
    let name = path.rsplit(['/', '\\']).next().unwrap_or(path);
    let ext = name.rsplit_once('.')?.1;
    if ext.is_empty() || ext.len() > 5 {
        return None;
    }
    Some(match ext.to_ascii_lowercase().as_str() {
        "png" => "image/png",
        "jpg" | "jpeg" => "image/jpeg",
        "gif" => "image/gif",
        "webp" => "image/webp",
        "bmp" => "image/bmp",
        "ico" => "image/x-icon",
        "mp3" => "audio/mpeg",
        "wav" => "audio/wav",
        "ogg" => "audio/ogg",
        "flac" => "audio/flac",
        "aac" => "audio/aac",
        "m4a" => "audio/mp4",
        "opus" => "audio/opus",
        "wma" => "audio/x-ms-wma",
        "mp4" | "m4v" => "video/mp4",
        "webm" => "video/webm",
        "mov" => "video/quicktime",
        "mkv" => "video/x-matroska",
        "avi" => "video/x-msvideo",
        _ => return None,
    })
}

/// Fiche renvoyée à la place du corps (`file_read`).
#[must_use]
pub(crate) fn media_fiche(resolved: &Utf8Path, size_bytes: u64, media_type: &str) -> Value {
    let name = resolved.file_name().unwrap_or("");
    json!({
        "path": resolved.as_str(),
        "name": name,
        "size_bytes": size_bytes,
        "media_type": media_type,
        "body_inlined": false,
        "note": "Media file. The body is not inlined. Use this path; do not dump the bytes.",
    })
}

/// Vrai quand l'échantillon n'est pas du texte.
///
/// Un octet NUL, ou une part notable de séquences UTF-8 invalides. Les
/// séquences ANSI (couleurs) restent du texte : elles sont de l'ASCII valide.
#[must_use]
pub(crate) fn bytes_look_binary(sample: &[u8]) -> bool {
    if sample.contains(&0) {
        return true;
    }
    if sample.len() < 24 {
        return false;
    }
    let lossy = String::from_utf8_lossy(sample);
    let total = lossy.chars().count();
    if total == 0 {
        return false;
    }
    let replaced = lossy.chars().filter(|c| *c == '\u{FFFD}').count();
    replaced.saturating_mul(20) >= total
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn svg_and_text_stay_readable() {
        assert!(media_type_for_path("icon.svg").is_none());
        assert!(media_type_for_path("readme.md").is_none());
        assert!(media_type_for_path("page.tsx").is_none());
        assert!(media_type_for_path("photo.png.bak").is_none());
    }

    #[test]
    fn media_extensions_are_typed() {
        assert_eq!(media_type_for_path("a.GIF"), Some("image/gif"));
        assert_eq!(media_type_for_path(r"media\clip.mp4"), Some("video/mp4"));
        assert_eq!(media_type_for_path("voice.wav"), Some("audio/wav"));
    }

    #[test]
    fn binary_sample_is_not_text() {
        assert!(!bytes_look_binary(b"hello world, this is plain text\n"));
        assert!(bytes_look_binary(b"GIF89a\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0\0"));
        let mut jpeg = vec![0xFF, 0xD8, 0xFF, 0xE0];
        jpeg.extend(std::iter::repeat(0xA3).take(64));
        assert!(bytes_look_binary(&jpeg));
    }
}
