use axum::{extract::State, http::StatusCode, Json};
use sqlx::PgPool;
use uuid::Uuid;

use crate::models::{
    HealthResponse, ReportRequest, ReportResponse, TokenTrainRequest, TokenTrainResponse,
};

pub async fn health() -> Json<HealthResponse> {
    Json(HealthResponse {
        status: "ok",
        version: env!("CARGO_PKG_VERSION"),
    })
}

pub async fn submit_report(
    State(pool): State<PgPool>,
    Json(req): Json<ReportRequest>,
) -> Result<Json<ReportResponse>, StatusCode> {
    let id = Uuid::new_v4();

    sqlx::query(
        r#"
        INSERT INTO agent_runs (id, model_name, agent_role, task_scope, status, duration_sec, error_summary)
        VALUES ($1, $2, $3, $4, $5, $6, $7)
        "#,
    )
    .bind(id)
    .bind(&req.model_name)
    .bind(&req.agent_role)
    .bind(&req.task_scope)
    .bind(&req.status)
    .bind(req.duration_sec)
    .bind(&req.error_summary)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert report: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    tracing::info!("Agent report saved: {} ({})", id, req.model_name);
    Ok(Json(ReportResponse { ok: true, report_id: id }))
}

pub async fn submit_token_data(
    State(pool): State<PgPool>,
    Json(req): Json<TokenTrainRequest>,
) -> Result<Json<TokenTrainResponse>, StatusCode> {
    sqlx::query(
        r#"
        INSERT INTO token_training (project_type, file_size_bytes, actual_tokens)
        VALUES ($1, $2, $3)
        "#,
    )
    .bind(&req.project_type)
    .bind(req.file_size_bytes)
    .bind(req.actual_tokens)
    .execute(&pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to insert token data: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    tracing::info!("Token training data saved for {}", req.project_type);
    Ok(Json(TokenTrainResponse { ok: true }))
}
