use sqlx::postgres::{PgPool, PgPoolOptions};
use std::time::Duration;

pub async fn init_pool(database_url: &str) -> Result<PgPool, sqlx::Error> {
    let pool = PgPoolOptions::new()
        .max_connections(5)
        .acquire_timeout(Duration::from_secs(5))
        .connect(database_url)
        .await?;

    // Table for Agent Reports
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS agent_runs (
            id UUID PRIMARY KEY,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            model_name VARCHAR(100) NOT NULL,
            agent_role VARCHAR(50) NOT NULL,
            task_scope VARCHAR(100) NOT NULL,
            status VARCHAR(20) NOT NULL,
            duration_sec INTEGER,
            error_summary TEXT
        )
        "#,
    )
    .execute(&pool)
    .await?;

    // Table for raw token training data
    sqlx::query(
        r#"
        CREATE TABLE IF NOT EXISTS token_training (
            id SERIAL PRIMARY KEY,
            timestamp TIMESTAMPTZ NOT NULL DEFAULT NOW(),
            project_type VARCHAR(50) NOT NULL,
            file_size_bytes BIGINT NOT NULL,
            actual_tokens BIGINT NOT NULL
        )
        "#,
    )
    .execute(&pool)
    .await?;

    tracing::info!("Database initialized: Telemetry tables ready");
    Ok(pool)
}
