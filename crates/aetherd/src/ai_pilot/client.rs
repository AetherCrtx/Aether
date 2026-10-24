use aether_protocol::ipc::ProviderSettings;
use reqwest::header::{HeaderMap, HeaderValue, AUTHORIZATION, CONTENT_TYPE};
use serde::{Deserialize, Serialize};
use serde_json::json;
use std::time::Duration;
use tracing::debug;

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatMessage {
    pub role: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub content: Option<String>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_calls: Option<Vec<ToolCall>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tool_call_id: Option<String>,
}

impl ChatMessage {
    pub fn system(content: impl Into<String>) -> Self {
        Self {
            role: "system".to_string(),
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn user(content: impl Into<String>) -> Self {
        Self {
            role: "user".to_string(),
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: None,
        }
    }

    pub fn assistant(content: Option<String>, tool_calls: Option<Vec<ToolCall>>) -> Self {
        Self {
            role: "assistant".to_string(),
            content,
            tool_calls,
            tool_call_id: None,
        }
    }

    pub fn tool(tool_call_id: impl Into<String>, content: impl Into<String>) -> Self {
        Self {
            role: "tool".to_string(),
            content: Some(content.into()),
            tool_calls: None,
            tool_call_id: Some(tool_call_id.into()),
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolCall {
    pub id: String,
    pub r#type: String,
    pub function: FunctionCall,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FunctionCall {
    pub name: String,
    pub arguments: String,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ToolDefinition {
    pub r#type: String,
    pub function: FunctionDefinition,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct FunctionDefinition {
    pub name: String,
    pub description: String,
    pub parameters: serde_json::Value,
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
pub struct ChatResponse {
    pub content: Option<String>,
    pub tool_calls: Vec<ToolCall>,
}

/// Unified AI Pilot HTTP Client
pub struct AiPilotClient {
    http: reqwest::Client,
}

impl AiPilotClient {
    pub fn new() -> Self {
        let http = reqwest::Client::builder()
            .user_agent("AetherTerminal/0.1.0 (X11; Linux x86_64)")
            .timeout(Duration::from_secs(60))
            .pool_idle_timeout(Some(Duration::from_secs(30)))
            .tcp_keepalive(Some(Duration::from_secs(30)))
            .build()
            .unwrap_or_else(|_| reqwest::Client::new());
        Self { http }
    }

    /// Dispatches a chat completion request to the configured provider using unified schema
    pub async fn chat_completion(
        &self,
        provider: &str,
        settings: &ProviderSettings,
        messages: &[ChatMessage],
        tools: &[ToolDefinition],
    ) -> Result<ChatResponse, String> {
        if let Some(proto) = &settings.protocol {
            if proto.to_lowercase() == "anthropic" {
                return self.call_anthropic(settings, messages, tools).await;
            }
        }
        let p = provider.to_lowercase();
        match p.as_str() {
            "anthropic" => self.call_anthropic(settings, messages, tools).await,
            "gemini" => self.call_gemini_openai_compat(settings, messages, tools).await,
            "openai" => {
                self.call_openai_compat(settings, messages, tools, "https://api.openai.com/v1", false)
                    .await
            }
            "groq" => {
                self.call_openai_compat(
                    settings,
                    messages,
                    tools,
                    "https://api.groq.com/openai/v1",
                    false,
                )
                .await
            }
            "ollama" => {
                self.call_openai_compat(settings, messages, tools, "http://localhost:11434/v1", false)
                    .await
            }
            "openrouter" => {
                self.call_openai_compat(settings, messages, tools, "https://openrouter.ai/api/v1", true)
                    .await
            }
            _ => {
                let default_url = settings
                    .base_url
                    .as_deref()
                    .unwrap_or("https://api.openai.com/v1");
                let is_router = default_url.contains("openrouter")
                    || default_url.contains("9router")
                    || default_url.contains("router");
                self.call_openai_compat(settings, messages, tools, default_url, is_router)
                    .await
            }
        }
    }

    /// Tests connectivity with a simple ping message
    pub async fn test_connection(
        &self,
        provider: &str,
        settings: &ProviderSettings,
    ) -> Result<String, String> {
        let test_msgs = vec![ChatMessage::user("Say 'Aether AI ready' in three words.")];
        let resp = self.chat_completion(provider, settings, &test_msgs, &[]).await?;
        let text = resp.content.unwrap_or_else(|| "No text returned".to_string());
        Ok(text)
    }

    /// Handles OpenAI-compatible endpoints (OpenRouter, Ollama, custom base URLs)
    async fn call_openai_compat(
        &self,
        settings: &ProviderSettings,
        messages: &[ChatMessage],
        tools: &[ToolDefinition],
        default_base_url: &str,
        is_openrouter: bool,
    ) -> Result<ChatResponse, String> {
        let mut raw_base = settings
            .base_url
            .as_deref()
            .unwrap_or(default_base_url)
            .trim()
            .to_string();
        if raw_base.starts_with("http://localhost:") {
            raw_base = raw_base.replacen("http://localhost:", "http://127.0.0.1:", 1);
        } else if raw_base.starts_with("https://localhost:") {
            raw_base = raw_base.replacen("https://localhost:", "https://127.0.0.1:", 1);
        } else if raw_base == "http://localhost" || raw_base == "http://localhost/" {
            raw_base = "http://127.0.0.1".to_string();
        }
        let trimmed = raw_base.trim_end_matches('/');
        let url = if trimmed.ends_with("/chat/completions") {
            trimmed.to_string()
        } else {
            format!("{trimmed}/chat/completions")
        };

        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert(
            reqwest::header::ACCEPT,
            HeaderValue::from_static("application/json"),
        );

        if !settings.api_key.trim().is_empty() {
            let auth_val = format!("Bearer {}", settings.api_key.trim());
            if let Ok(val) = HeaderValue::from_str(&auth_val) {
                headers.insert(AUTHORIZATION, val);
            }
        }

        let is_router_endpoint = is_openrouter
            || url.contains("openrouter")
            || url.contains("9router")
            || url.contains("router");

        if is_router_endpoint {
            headers.insert("HTTP-Referer", HeaderValue::from_static("https://aetherterminal.dev"));
            headers.insert("X-Title", HeaderValue::from_static("AetherTerminal"));
        }

        let mut body = json!({
            "model": settings.model,
            "messages": messages,
            "temperature": 0.2,
            "max_tokens": 2048,
            "stream": false,
        });

        if !tools.is_empty() {
            body["tools"] = json!(tools);
            body["tool_choice"] = json!("auto");
        }

        debug!("Dispatching request to {url} with model {}", settings.model);

        // Attempt request with single retry on transient socket reset / connection closed by peer
        let mut last_error = String::new();
        for attempt in 0..2 {
            if attempt > 0 {
                tokio::time::sleep(Duration::from_millis(150)).await;
            }

            match self
                .http
                .post(&url)
                .headers(headers.clone())
                .json(&body)
                .send()
                .await
            {
                Ok(res) => {
                    let status = res.status();
                    let resp_text = res
                        .text()
                        .await
                        .map_err(|e| format!("Failed to read response body: {e}"))?;

                    if !status.is_success() {
                        return Err(format!("Provider returned status {status}: {resp_text}"));
                    }

                    let val: serde_json::Value = serde_json::from_str(&resp_text).map_err(|e| {
                        format!("Failed to parse JSON response: {e}. Raw: {resp_text}")
                    })?;

                    let choice = val
                        .get("choices")
                        .and_then(|c| c.as_array())
                        .and_then(|arr| arr.first())
                        .ok_or_else(|| {
                            format!("Invalid response format, missing choices: {resp_text}")
                        })?;

                    let message = choice.get("message").ok_or("Missing message in choice")?;
                    let raw_content = message
                        .get("content")
                        .and_then(|c| c.as_str())
                        .map(|s| s.to_string());

                    let content = raw_content.map(|mut s| {
                        if let Some(_start) = s.find("<thinking>") {
                            if let Some(end) = s.find("</thinking>") {
                                let after = s[end + 11..].trim();
                                if !after.is_empty() {
                                    s = after.to_string();
                                }
                            }
                        }
                        s
                    });

                    let mut tool_calls = Vec::new();
                    if let Some(tcs) = message.get("tool_calls").and_then(|t| t.as_array()) {
                        for tc in tcs {
                            let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                            let r#type = tc
                                .get("type")
                                .and_then(|t| t.as_str())
                                .unwrap_or("function")
                                .to_string();
                            if let Some(fn_obj) = tc.get("function") {
                                let name =
                                    fn_obj.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                                let args = fn_obj
                                    .get("arguments")
                                    .and_then(|a| a.as_str())
                                    .unwrap_or("{}")
                                    .to_string();
                                tool_calls.push(ToolCall {
                                    id,
                                    r#type,
                                    function: FunctionCall {
                                        name,
                                        arguments: args,
                                    },
                                });
                            }
                        }
                    }

                    return Ok(ChatResponse { content, tool_calls });
                }
                Err(e) => {
                    let err_str = e.to_string();
                    let is_peer_closed = err_str.contains("connection closed")
                        || err_str.contains("closed before message completed")
                        || err_str.contains("reset by peer");

                    if is_peer_closed {
                        last_error = format!(
                            "Connection closed by peer at {url}. The remote endpoint closed the connection. Check that the endpoint URL is reachable, the API key is valid, and the model exists on this provider."
                        );
                    } else {
                        last_error = format!("HTTP request error to {url}: {err_str}");
                    }
                }
            }
        }

        Err(last_error)
    }

    /// Handles Gemini OpenAI compatibility endpoint
    async fn call_gemini_openai_compat(
        &self,
        settings: &ProviderSettings,
        messages: &[ChatMessage],
        tools: &[ToolDefinition],
    ) -> Result<ChatResponse, String> {
        let base_url = settings
            .base_url
            .as_deref()
            .unwrap_or("https://generativelanguage.googleapis.com/v1beta/openai")
            .trim_end_matches('/');
        let url = format!("{base_url}/chat/completions");

        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));

        if !settings.api_key.trim().is_empty() {
            let auth_val = format!("Bearer {}", settings.api_key.trim());
            if let Ok(val) = HeaderValue::from_str(&auth_val) {
                headers.insert(AUTHORIZATION, val);
            }
        }

        let mut body = json!({
            "model": settings.model,
            "messages": messages,
            "temperature": 0.2,
        });

        if !tools.is_empty() {
            body["tools"] = json!(tools);
            body["tool_choice"] = json!("auto");
        }

        let res = self
            .http
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP request error to {url}: {e}"))?;

        let status = res.status();
        let resp_text = res
            .text()
            .await
            .map_err(|e| format!("Failed to read response body: {e}"))?;

        if !status.is_success() {
            return Err(format!("Gemini API error {status}: {resp_text}"));
        }

        let val: serde_json::Value = serde_json::from_str(&resp_text)
            .map_err(|e| format!("Failed to parse Gemini JSON: {e}"))?;

        let choice = val
            .get("choices")
            .and_then(|c| c.as_array())
            .and_then(|arr| arr.first())
            .ok_or_else(|| format!("Invalid response format: {resp_text}"))?;

        let message = choice.get("message").ok_or("Missing message in choice")?;
        let content = message.get("content").and_then(|c| c.as_str()).map(|s| s.to_string());

        let mut tool_calls = Vec::new();
        if let Some(tcs) = message.get("tool_calls").and_then(|t| t.as_array()) {
            for tc in tcs {
                let id = tc.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                let r#type = tc.get("type").and_then(|t| t.as_str()).unwrap_or("function").to_string();
                if let Some(fn_obj) = tc.get("function") {
                    let name = fn_obj.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                    let args = fn_obj.get("arguments").and_then(|a| a.as_str()).unwrap_or("{}").to_string();
                    tool_calls.push(ToolCall {
                        id,
                        r#type,
                        function: FunctionCall { name, arguments: args },
                    });
                }
            }
        }

        Ok(ChatResponse { content, tool_calls })
    }

    /// Handles Anthropic Messages API format mapping
    async fn call_anthropic(
        &self,
        settings: &ProviderSettings,
        messages: &[ChatMessage],
        tools: &[ToolDefinition],
    ) -> Result<ChatResponse, String> {
        let base_url = settings
            .base_url
            .as_deref()
            .unwrap_or("https://api.anthropic.com/v1")
            .trim_end_matches('/');
        let url = format!("{base_url}/messages");

        let mut headers = HeaderMap::new();
        headers.insert(CONTENT_TYPE, HeaderValue::from_static("application/json"));
        headers.insert("anthropic-version", HeaderValue::from_static("2023-06-01"));

        if let Ok(val) = HeaderValue::from_str(settings.api_key.trim()) {
            headers.insert("x-api-key", val);
        }

        // Extract system prompt
        let mut system_prompts = Vec::new();
        let mut anthropic_messages = Vec::new();

        for msg in messages {
            if msg.role == "system" {
                if let Some(c) = &msg.content {
                    system_prompts.push(c.clone());
                }
                continue;
            }

            if msg.role == "tool" {
                // Tool result in Anthropic is a user message with tool_result block
                let call_id = msg.tool_call_id.clone().unwrap_or_default();
                let content_str = msg.content.clone().unwrap_or_default();
                anthropic_messages.push(json!({
                    "role": "user",
                    "content": [{
                        "type": "tool_result",
                        "tool_use_id": call_id,
                        "content": content_str,
                    }]
                }));
                continue;
            }

            if msg.role == "assistant" {
                let mut blocks = Vec::new();
                if let Some(c) = &msg.content {
                    if !c.is_empty() {
                        blocks.push(json!({
                            "type": "text",
                            "text": c
                        }));
                    }
                }
                if let Some(tcs) = &msg.tool_calls {
                    for tc in tcs {
                        let parsed_input: serde_json::Value =
                            serde_json::from_str(&tc.function.arguments).unwrap_or_else(|_| json!({}));
                        blocks.push(json!({
                            "type": "tool_use",
                            "id": tc.id,
                            "name": tc.function.name,
                            "input": parsed_input,
                        }));
                    }
                }
                anthropic_messages.push(json!({
                    "role": "assistant",
                    "content": blocks
                }));
                continue;
            }

            // Normal user message
            let text = msg.content.clone().unwrap_or_default();
            anthropic_messages.push(json!({
                "role": "user",
                "content": text
            }));
        }

        let mut body = json!({
            "model": settings.model,
            "max_tokens": 4096,
            "messages": anthropic_messages,
        });

        if !system_prompts.is_empty() {
            body["system"] = json!(system_prompts.join("\n\n"));
        }

        if !tools.is_empty() {
            let mapped_tools: Vec<serde_json::Value> = tools
                .iter()
                .map(|t| {
                    json!({
                        "name": t.function.name,
                        "description": t.function.description,
                        "input_schema": t.function.parameters,
                    })
                })
                .collect();
            body["tools"] = json!(mapped_tools);
        }

        let res = self
            .http
            .post(&url)
            .headers(headers)
            .json(&body)
            .send()
            .await
            .map_err(|e| format!("HTTP request error to {url}: {e}"))?;

        let status = res.status();
        let resp_text = res
            .text()
            .await
            .map_err(|e| format!("Failed to read Anthropic response: {e}"))?;

        if !status.is_success() {
            return Err(format!("Anthropic API error {status}: {resp_text}"));
        }

        let val: serde_json::Value = serde_json::from_str(&resp_text)
            .map_err(|e| format!("Failed to parse Anthropic JSON: {e}"))?;

        let mut text_content = String::new();
        let mut tool_calls = Vec::new();

        if let Some(blocks) = val.get("content").and_then(|c| c.as_array()) {
            for block in blocks {
                let block_type = block.get("type").and_then(|t| t.as_str()).unwrap_or("");
                if block_type == "text" {
                    if let Some(t) = block.get("text").and_then(|txt| txt.as_str()) {
                        text_content.push_str(t);
                    }
                } else if block_type == "tool_use" {
                    let id = block.get("id").and_then(|i| i.as_str()).unwrap_or("").to_string();
                    let name = block.get("name").and_then(|n| n.as_str()).unwrap_or("").to_string();
                    let input = block.get("input").cloned().unwrap_or_else(|| json!({}));
                    let args = serde_json::to_string(&input).unwrap_or_else(|_| "{}".to_string());

                    tool_calls.push(ToolCall {
                        id,
                        r#type: "function".to_string(),
                        function: FunctionCall { name, arguments: args },
                    });
                }
            }
        }

        let content = if text_content.is_empty() {
            None
        } else {
            Some(text_content)
        };

        Ok(ChatResponse { content, tool_calls })
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_chat_message_constructors() {
        let sys = ChatMessage::system("You are an assistant");
        assert_eq!(sys.role, "system");
        assert_eq!(sys.content.as_deref(), Some("You are an assistant"));

        let user = ChatMessage::user("Hello");
        assert_eq!(user.role, "user");

        let tc = ToolCall {
            id: "call_1".to_string(),
            r#type: "function".to_string(),
            function: FunctionCall {
                name: "inspect_pane_screen".to_string(),
                arguments: "{\"pane_id\":\"p1\"}".to_string(),
            },
        };
        let asst = ChatMessage::assistant(None, Some(vec![tc]));
        assert_eq!(asst.role, "assistant");
        assert_eq!(asst.tool_calls.as_ref().unwrap().len(), 1);

        let tool_resp = ChatMessage::tool("call_1", "screen text");
        assert_eq!(tool_resp.role, "tool");
        assert_eq!(tool_resp.tool_call_id.as_deref(), Some("call_1"));
    }
}
