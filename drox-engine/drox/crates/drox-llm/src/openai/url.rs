//! Join d'URL chat OpenAI-compatible (parité IDE `buildLlmChatUrl`).

use url::Url;

use crate::error::LlmError;

/// `{base}/v1/chat/completions`, ou `{base}/chat/completions` si la base finit déjà par `/v1`.
pub fn openai_chat_completions_url(base: &Url) -> Result<Url, LlmError> {
    let path = base.path().trim_end_matches('/');
    let suffix = if path.ends_with("/v1") {
        "chat/completions"
    } else {
        "v1/chat/completions"
    };
    let mut url = base.clone();
    let mut p = url.path().to_owned();
    if !p.ends_with('/') {
        p.push('/');
        url.set_path(&p);
    }
    Ok(url.join(suffix)?)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn join_without_v1_suffix() {
        let base = Url::parse("http://192.168.1.1:4000").unwrap();
        let u = openai_chat_completions_url(&base).unwrap();
        assert_eq!(u.as_str(), "http://192.168.1.1:4000/v1/chat/completions");
    }

    #[test]
    fn join_with_v1_suffix() {
        let base = Url::parse("https://api.mistral.ai/v1").unwrap();
        let u = openai_chat_completions_url(&base).unwrap();
        assert_eq!(u.as_str(), "https://api.mistral.ai/v1/chat/completions");
    }

    #[test]
    fn join_with_trailing_slash() {
        let base = Url::parse("http://127.0.0.1:8000/").unwrap();
        let u = openai_chat_completions_url(&base).unwrap();
        assert_eq!(u.as_str(), "http://127.0.0.1:8000/v1/chat/completions");
    }
}
