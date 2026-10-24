use aether_protocol::ipc::ProviderSettings;
use aetherd::ai_pilot::client::AiPilotClient;
use std::time::Duration;
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpListener;

#[tokio::test]
async fn test_live_connection_network_failure_connection_refused() {
    let client = AiPilotClient::new();
    // Choose an unused port on localhost
    let settings = ProviderSettings {
        api_key: "sk-test-key".to_string(),
        model: "gpt-4o".to_string(),
        base_url: Some("http://127.0.0.1:59999".to_string()),
        display_name: Some("Offline Mock".to_string()),
        protocol: Some("openai".to_string()),
    };

    let result = client.test_connection("custom", &settings).await;
    assert!(result.is_err(), "Must return Err on connection refused");
    let err_msg = result.unwrap_err();
    assert!(
        err_msg.contains("HTTP request error") || err_msg.contains("error sending request"),
        "Error message must indicate network request failure: {err_msg}"
    );
}

#[tokio::test]
async fn test_live_connection_invalid_api_key_401_unauthorized() {
    // Bind mock HTTP server
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        if let Ok((mut socket, _)) = listener.accept().await {
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;
            let resp = "HTTP/1.1 401 Unauthorized\r\n\
                        Content-Type: application/json\r\n\
                        Content-Length: 75\r\n\
                        Connection: close\r\n\r\n\
                        {\"error\":{\"message\":\"Invalid API Key provided\",\"type\":\"invalid_request_error\"}}";
            let _ = socket.write_all(resp.as_bytes()).await;
        }
    });

    let client = AiPilotClient::new();
    let settings = ProviderSettings {
        api_key: "sk-invalid-auth-key".to_string(),
        model: "gpt-4o".to_string(),
        base_url: Some(format!("http://127.0.0.1:{port}")),
        display_name: Some("Mock 401".to_string()),
        protocol: Some("openai".to_string()),
    };

    let result = client.test_connection("custom", &settings).await;
    assert!(result.is_err(), "Must return Err on 401 Unauthorized");
    let err_msg = result.unwrap_err();
    assert!(
        err_msg.contains("401") && err_msg.contains("Invalid API Key"),
        "Error must contain 401 and response body details: {err_msg}"
    );
}

#[tokio::test]
async fn test_live_connection_slow_response_latency() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        if let Ok((mut socket, _)) = listener.accept().await {
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;
            // Delay for 100ms
            tokio::time::sleep(Duration::from_millis(100)).await;
            let body = "{\"choices\":[{\"message\":{\"content\":\"Aether AI ready\"}}]}";
            let resp = format!(
                "HTTP/1.1 200 OK\r\n\
                 Content-Type: application/json\r\n\
                 Content-Length: {}\r\n\
                 Connection: close\r\n\r\n\
                 {}",
                body.len(),
                body
            );
            let _ = socket.write_all(resp.as_bytes()).await;
        }
    });

    let client = AiPilotClient::new();
    let settings = ProviderSettings {
        api_key: "sk-valid-key".to_string(),
        model: "gpt-4o".to_string(),
        base_url: Some(format!("http://127.0.0.1:{port}")),
        display_name: Some("Mock Latency".to_string()),
        protocol: Some("openai".to_string()),
    };

    let result = client.test_connection("custom", &settings).await;
    assert!(result.is_ok(), "Must succeed after latency delay: {:?}", result);
    let msg = result.unwrap();
    assert_eq!(msg, "Aether AI ready");
}

#[tokio::test]
async fn test_live_connection_html_502_bad_gateway() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        if let Ok((mut socket, _)) = listener.accept().await {
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;
            let body = "<html><body>502 Bad Gateway</body></html>";
            let resp = format!(
                "HTTP/1.1 502 Bad Gateway\r\n\
                 Content-Type: text/html\r\n\
                 Content-Length: {}\r\n\
                 Connection: close\r\n\r\n\
                 {}",
                body.len(),
                body
            );
            let _ = socket.write_all(resp.as_bytes()).await;
        }
    });

    let client = AiPilotClient::new();
    let settings = ProviderSettings {
        api_key: "sk-valid-key".to_string(),
        model: "gpt-4o".to_string(),
        base_url: Some(format!("http://127.0.0.1:{port}")),
        display_name: Some("Mock 502".to_string()),
        protocol: Some("openai".to_string()),
    };

    let result = client.test_connection("custom", &settings).await;
    assert!(result.is_err(), "Must return Err on 502 Bad Gateway");
    let err_msg = result.unwrap_err();
    assert!(
        err_msg.contains("502 Bad Gateway"),
        "Error message must indicate 502 Bad Gateway: {err_msg}"
    );
}

#[tokio::test]
async fn test_live_connection_malformed_json_200_ok() {
    let listener = TcpListener::bind("127.0.0.1:0").await.unwrap();
    let port = listener.local_addr().unwrap().port();

    tokio::spawn(async move {
        if let Ok((mut socket, _)) = listener.accept().await {
            let mut buf = [0u8; 1024];
            let _ = socket.read(&mut buf).await;
            let resp = "HTTP/1.1 200 OK\r\n\
                        Content-Type: application/json\r\n\
                        Content-Length: 15\r\n\
                        Connection: close\r\n\r\n\
                        {not-valid-json";
            let _ = socket.write_all(resp.as_bytes()).await;
        }
    });

    let client = AiPilotClient::new();
    let settings = ProviderSettings {
        api_key: "sk-valid-key".to_string(),
        model: "gpt-4o".to_string(),
        base_url: Some(format!("http://127.0.0.1:{port}")),
        display_name: Some("Mock Corrupt JSON".to_string()),
        protocol: Some("openai".to_string()),
    };

    let result = client.test_connection("custom", &settings).await;
    assert!(result.is_err(), "Must return Err on corrupt JSON");
    let err_msg = result.unwrap_err();
    assert!(
        err_msg.contains("Failed to parse JSON response"),
        "Error message must indicate JSON parse failure: {err_msg}"
    );
}
