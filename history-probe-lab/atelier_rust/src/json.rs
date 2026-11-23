//! Mini-lecteur JSON (std seul). Supporte objets, tableaux, chaînes, nombres, booléens et null.

use std::collections::BTreeMap;

/// Erreur de parse avec un message explicite.
#[derive(Debug, Clone, PartialEq)]
pub struct ParseError {
    pub message: String,
    pub position: usize,
}

impl std::fmt::Display for ParseError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(
            f,
            "erreur de parse à la position {} : {}",
            self.position, self.message
        )
    }
}

impl std::error::Error for ParseError {}

/// Valeur JSON.
#[derive(Debug, Clone, PartialEq)]
pub enum Value {
    Null,
    Bool(bool),
    Number(f64),
    String(String),
    Array(Vec<Value>),
    Object(BTreeMap<String, Value>),
}

/// Parseur itératif sur une séquence de bytes UTF-8.
pub struct Parser<'a> {
    bytes: &'a [u8],
    pos: usize,
}

impl<'a> Parser<'a> {
    /// Construit un parseur sur les bytes UTF-8 de `text`.
    pub fn new(text: &'a str) -> Self {
        Parser {
            bytes: text.as_bytes(),
            pos: 0,
        }
    }

    /// Parse une valeur complète et consomme les espaces restants.
    pub fn parse(mut self) -> Result<Value, ParseError> {
        self.skip_ws();
        let value = self.parse_value()?;
        self.skip_ws();
        if self.pos != self.bytes.len() {
            return Err(self.error("caractère inattendu après la valeur"));
        }
        Ok(value)
    }

    fn error(&self, message: &str) -> ParseError {
        ParseError {
            message: message.to_string(),
            position: self.pos,
        }
    }

    fn peek(&self) -> Option<u8> {
        self.bytes.get(self.pos).copied()
    }

    fn skip_ws(&mut self) {
        while let Some(b) = self.peek() {
            match b {
                b' ' | b'\t' | b'\n' | b'\r' => self.pos += 1,
                _ => break,
            }
        }
    }

    fn parse_value(&mut self) -> Result<Value, ParseError> {
        self.skip_ws();
        match self.peek() {
            Some(b'{') => self.parse_object(),
            Some(b'[') => self.parse_array(),
            Some(b'"') => Ok(Value::String(self.parse_string()?)),
            Some(b't') | Some(b'f') => self.parse_bool(),
            Some(b'n') => self.parse_null(),
            Some(c) if c == b'-' || c.is_ascii_digit() => self.parse_number(),
            Some(c) => Err(self.error(&format!("caractère inattendu '{}'", c as char))),
            None => Err(self.error("fin inattendue du document")),
        }
    }

    fn parse_object(&mut self) -> Result<Value, ParseError> {
        self.pos += 1; // '{'
        let mut map = BTreeMap::new();
        self.skip_ws();
        if self.peek() == Some(b'}') {
            self.pos += 1;
            return Ok(Value::Object(map));
        }
        loop {
            self.skip_ws();
            if self.peek() != Some(b'"') {
                return Err(self.error("clé d'objet attendue (chaîne)"));
            }
            let key = self.parse_string()?;
            self.skip_ws();
            if self.peek() != Some(b':') {
                return Err(self.error("deuxième attendu après la clé"));
            }
            self.pos += 1; // ':'
            let value = self.parse_value()?;
            map.insert(key, value);
            self.skip_ws();
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                }
                Some(b'}') => {
                    self.pos += 1;
                    break;
                }
                _ => return Err(self.error("',' ou '}' attendu dans l'objet")),
            }
        }
        Ok(Value::Object(map))
    }

    fn parse_array(&mut self) -> Result<Value, ParseError> {
        self.pos += 1; // '['
        let mut items = Vec::new();
        self.skip_ws();
        if self.peek() == Some(b']') {
            self.pos += 1;
            return Ok(Value::Array(items));
        }
        loop {
            let value = self.parse_value()?;
            items.push(value);
            self.skip_ws();
            match self.peek() {
                Some(b',') => {
                    self.pos += 1;
                }
                Some(b']') => {
                    self.pos += 1;
                    break;
                }
                _ => return Err(self.error("',' ou '}' attendu dans le tableau")),
            }
        }
        Ok(Value::Array(items))
    }

    fn parse_string(&mut self) -> Result<String, ParseError> {
        self.pos += 1; // '"'
        let mut out = String::new();
        loop {
            match self.next_byte() {
                Some(b'"') => break,
                Some(b'\\') => {
                    match self.next_byte() {
                        Some(b'"') => out.push('"'),
                        Some(b'\\') => out.push('\\'),
                        Some(b'/') => out.push('/'),
                        Some(b'n') => out.push('\n'),
                        Some(b't') => out.push('\t'),
                        Some(b'r') => out.push('\r'),
                        Some(b'b') => out.push('\u{0008}'),
                        Some(b'f') => out.push('\u{000C}'),
                        Some(b'u') => {
                            let cp = self.parse_hex4()?;
                            // Support basique : un codepoint UTF-8.
                            match char::from_u32(cp) {
                                Some(c) => out.push(c),
                                None => return Err(self.error("code unicode invalide")),
                            }
                        }
                        _ => return Err(self.error("séquence d'échappement invalide")),
                    }
                }
                Some(c) => {
                    // Accumule les bytes d'un caractère UTF-8 multi-octets.
                    if c < 0x80 {
                        out.push(c as char);
                    } else {
                        let mut bytes = [0u8; 4];
                        let mut count = 0;
                        bytes[count] = c;
                        count += 1;
                        while (self.peek().unwrap() & 0xC0) == 0x80 {
                            if count >= 4 {
                                return Err(self.error("caractère UTF-8 trop long"));
                            }
                            bytes[count] = self.next_byte().unwrap();
                            count += 1;
                        }
                        out.push_str(std::str::from_utf8(&bytes[..count]).map_err(|e| {
                            ParseError {
                                message: e.to_string(),
                                position: self.pos,
                            }
                        })?);
                    }
                }
                None => return Err(self.error("chaîne non terminée")),
            }
        }
        Ok(out)
    }

    fn next_byte(&mut self) -> Option<u8> {
        let b = self.bytes.get(self.pos).copied();
        if b.is_some() {
            self.pos += 1;
        }
        b
    }

    fn parse_hex4(&mut self) -> Result<u32, ParseError> {
        let mut value = 0u32;
        for _ in 0..4 {
            let c = self.next_byte().ok_or_else(|| {
                ParseError {
                    message: "fin inattendue dans le code unicode".to_string(),
                    position: self.pos,
                }
            })?;
            let digit = match c {
                b'0'..=b'9' => (c - b'0') as u32,
                b'a'..=b'f' => (c - b'a' + 10) as u32,
                b'A'..=b'F' => (c - b'A' + 10) as u32,
                _ => return Err(self.error("chiffre hexadécimal attendu")),
            };
            value = value * 16 + digit;
        }
        Ok(value)
    }

    fn parse_bool(&mut self) -> Result<Value, ParseError> {
        if self.bytes[self.pos..].starts_with(b"true") {
            self.pos += 4;
            Ok(Value::Bool(true))
        } else if self.bytes[self.pos..].starts_with(b"false") {
            self.pos += 5;
            Ok(Value::Bool(false))
        } else {
            Err(self.error("booléen attendu"))
        }
    }

    fn parse_null(&mut self) -> Result<Value, ParseError> {
        if self.bytes[self.pos..].starts_with(b"null") {
            self.pos += 4;
            Ok(Value::Null)
        } else {
            Err(self.error("null attendu"))
        }
    }

    fn parse_number(&mut self) -> Result<Value, ParseError> {
        let start = self.pos;
        if self.peek() == Some(b'-') {
            self.pos += 1;
        }
        while let Some(b) = self.peek() {
            if b.is_ascii_digit() {
                self.pos += 1;
            } else {
                break;
            }
        }
        if self.peek() == Some(b'.') {
            self.pos += 1;
            while let Some(b) = self.peek() {
                if b.is_ascii_digit() {
                    self.pos += 1;
                } else {
                    break;
                }
            }
        }
        if matches!(self.peek(), Some(b'e') | Some(b'E')) {
            self.pos += 1;
            if matches!(self.peek(), Some(b'+') | Some(b'-')) {
                self.pos += 1;
            }
            while let Some(b) = self.peek() {
                if b.is_ascii_digit() {
                    self.pos += 1;
                } else {
                    break;
                }
            }
        }
        let text = std::str::from_utf8(&self.bytes[start..self.pos]).unwrap();
        text.parse::<f64>()
            .map(Value::Number)
            .map_err(|e| ParseError {
                message: e.to_string(),
                position: start,
            })
    }
}

/// Parse une chaîne JSON en [`Value`].
pub fn parse(text: &str) -> Result<Value, ParseError> {
    Parser::new(text).parse()
}
