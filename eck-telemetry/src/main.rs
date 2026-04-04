mod db;
mod handlers;
mod models;

use axum::{routing::{get, post}, Router};
use std::net::SocketAddr;
use tower_http::cors::{Any, CorsLayer};
use tracing_subscriber::EnvFilter;
use handlers::AppState;

#[tokio::main]
async fn main() {
    tracing_subscriber::fmt()
        .with_env_filter(EnvFilter::try_from_default_env().unwrap_or_else(|_| "eck_telemetry=info".into()))
        .init();

    let db_url = std::env::var("DATABASE_URL")
        .unwrap_or_else(|_| "postgres://openpg:openpgpwd@localhost:5432/eckwms".into());

    let pool = db::init_pool(&db_url)
        .await
        .expect("Failed to initialize database");

    // Initialize state with cache
    let state = AppState::new(pool);

    // Allow CORS from anywhere (CLI tools will report here)
    let cors = CorsLayer::new()
        .allow_origin(Any)
        .allow_methods(Any)
        .allow_headers(Any);

    let app = Router::new()
        .route("/T/health", get(handlers::health))
        .route("/T/report", post(handlers::submit_report))
        .route("/T/tokens/train", post(handlers::submit_token_data))
        .route("/T/tokens/weights", get(handlers::get_weights))
        .route("/T/v2/events", post(handlers::submit_universal_event))
        .layer(cors)
        .with_state(state);

    let port: u16 = std::env::var("PORT")
        .ok()
        .and_then(|p| p.parse().ok())
        .unwrap_or(3203);

    let addr = SocketAddr::from(([0, 0, 0, 0], port));
    tracing::info!("Telemetry Hub listening on {}", addr);

    let listener = tokio::net::TcpListener::bind(addr).await.unwrap();
    axum::serve(listener, app).await.unwrap();
}
