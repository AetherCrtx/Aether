use aether_protocol::ipc::{ProviderConfig, ProviderSettings};
use anyhow::{Context, Result};
use std::fs;
use std::path::{Path, PathBuf};
use tracing::info;

#[cfg(unix)]
use std::os::unix::fs::PermissionsExt;

/// Resolves the file path for providers configuration (~/.config/aether/providers.toml)
pub fn resolve_providers_path() -> PathBuf {
    if let Ok(path) = std::env::var("AETHER_PROVIDERS_FILE") {
        return PathBuf::from(path);
    }
    if let Ok(dir) = std::env::var("AETHER_CONFIG_DIR") {
        return PathBuf::from(dir).join("providers.toml");
    }
    let base_dir = if let Some(proj_dirs) = directories::ProjectDirs::from("com", "aether", "aether") {
        proj_dirs.config_dir().to_path_buf()
    } else if let Ok(home) = std::env::var("HOME") {
        PathBuf::from(home).join(".config/aether")
    } else {
        PathBuf::from(".config/aether")
    };
    base_dir.join("providers.toml")
}

/// Loads the provider configuration from the specified path.
/// If the file does not exist, returns the default configuration.
pub fn load_provider_config_from(path: &Path) -> Result<ProviderConfig> {
    if !path.exists() {
        return Ok(ProviderConfig::default());
    }

    let contents = fs::read_to_string(path)
        .with_context(|| format!("Failed to read provider config from {}", path.display()))?;

    let mut config: ProviderConfig = toml::from_str(&contents)
        .with_context(|| format!("Failed to parse toml from {}", path.display()))?;

    // Ensure all standard providers exist in map with defaults if missing
    let defaults = ProviderConfig::default();
    for (k, v) in defaults.providers {
        config.providers.entry(k).or_insert(v);
    }

    Ok(config)
}

/// Loads the provider configuration from ~/.config/aether/providers.toml.
/// If the file does not exist, returns the default configuration.
pub fn load_provider_config() -> Result<ProviderConfig> {
    load_provider_config_from(&resolve_providers_path())
}

/// Saves the provider configuration to the specified path with secure 0600 permissions.
pub fn save_provider_config_to(config: &ProviderConfig, path: &Path) -> Result<()> {
    if let Some(parent) = path.parent() {
        fs::create_dir_all(parent)
            .with_context(|| format!("Failed to create directory {}", parent.display()))?;
    }

    let serialized = toml::to_string_pretty(config)
        .context("Failed to serialize provider config to TOML")?;

    fs::write(path, serialized)
        .with_context(|| format!("Failed to write provider config to {}", path.display()))?;

    #[cfg(unix)]
    {
        let perms = fs::Permissions::from_mode(0o600);
        let _ = fs::set_permissions(path, perms);
    }

    info!("Saved AI provider configuration to {}", path.display());
    Ok(())
}

/// Saves the provider configuration to ~/.config/aether/providers.toml with secure 0600 permissions.
pub fn save_provider_config(config: &ProviderConfig) -> Result<()> {
    save_provider_config_to(config, &resolve_providers_path())
}

/// Updates a single provider's settings and persists to disk.
pub fn update_provider_setting(
    provider: &str,
    api_key: &str,
    model: &str,
    base_url: Option<String>,
    display_name: Option<String>,
    protocol: Option<String>,
) -> Result<ProviderConfig> {
    let mut config = load_provider_config()?;
    let key = provider.to_lowercase();

    let entry = config.providers.entry(key.clone()).or_insert_with(|| ProviderSettings {
        api_key: String::new(),
        model: model.to_string(),
        base_url: base_url.clone(),
        display_name: display_name.clone(),
        protocol: protocol.clone(),
    });

    entry.api_key = api_key.to_string();
    if !model.trim().is_empty() {
        entry.model = model.to_string();
    }
    if let Some(url) = base_url {
        if !url.trim().is_empty() {
            entry.base_url = Some(url);
        }
    }
    if let Some(dn) = display_name {
        if !dn.trim().is_empty() {
            entry.display_name = Some(dn);
        }
    }
    if let Some(proto) = protocol {
        if !proto.trim().is_empty() {
            entry.protocol = Some(proto);
        }
    }

    config.default_provider = key;
    save_provider_config(&config)?;
    Ok(config)
}

/// Removes a custom or configured provider setting and persists to disk.
pub fn delete_provider_setting(provider: &str) -> Result<ProviderConfig> {
    let mut config = load_provider_config()?;
    let key = provider.to_lowercase();
    config.providers.remove(&key);
    if config.default_provider == key {
        config.default_provider = "openrouter".to_string();
    }
    save_provider_config(&config)?;
    Ok(config)
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_load_default_when_missing() {
        let temp_dir = std::env::temp_dir().join(format!("aether_test_prov_{}", uuid::Uuid::new_v4()));
        let test_file = temp_dir.join("missing_providers.toml");

        let config = load_provider_config_from(&test_file).expect("load default config failed");
        assert_eq!(config.default_provider, "openrouter");
        assert!(config.providers.contains_key("openrouter"));
        assert!(config.providers.contains_key("gemini"));
        assert!(config.providers.contains_key("anthropic"));
        assert!(config.providers.contains_key("ollama"));

        let _ = fs::remove_dir_all(&temp_dir);
    }

    #[test]
    fn test_save_and_reload_provider_config() {
        let temp_dir = std::env::temp_dir().join(format!("aether_test_prov_{}", uuid::Uuid::new_v4()));
        let test_file = temp_dir.join("providers.toml");

        let mut config = ProviderConfig::default();
        config.default_provider = "anthropic".to_string();
        if let Some(anthropic) = config.providers.get_mut("anthropic") {
            anthropic.api_key = "sk-ant-test-key".to_string();
            anthropic.model = "claude-3-5-sonnet-20241022".to_string();
        }

        save_provider_config_to(&config, &test_file).expect("save failed");
        let loaded = load_provider_config_from(&test_file).expect("reload failed");
        assert_eq!(loaded.default_provider, "anthropic");
        assert_eq!(loaded.providers.get("anthropic").unwrap().api_key, "sk-ant-test-key");

        let _ = fs::remove_dir_all(&temp_dir);
    }
}
