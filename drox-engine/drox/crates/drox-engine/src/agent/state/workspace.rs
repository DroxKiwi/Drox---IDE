impl ArchitectRunState {
    /// Ingère les chemins `nodes[].path` d'une réponse `workspace_map_read`.
    pub fn ingest_workspace_map_output(&mut self, output: &Value) {
        self.workspace_map_loaded = true;
        self.workspace_paths.clear();
        let Some(nodes) = output.get("nodes").and_then(|v| v.as_array()) else {
            return;
        };
        for node in nodes {
            if let Some(path) = node.get("path").and_then(|v| v.as_str()) {
                let p = normalize_workspace_path(path);
                if !p.is_empty() {
                    self.workspace_paths.insert(p);
                }
            }
        }
    }
}

#[must_use]
pub fn normalize_workspace_path(path: &str) -> String {
    let mut p = path.trim();
    if let Some(rest) = p.strip_prefix(r"\\?\") {
        p = rest;
    }
    p.replace('\\', "/").trim().trim_matches('/').to_string()
}
