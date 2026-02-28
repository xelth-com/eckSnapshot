use axum::{extract::State, http::StatusCode, Json};
use serde::Serialize;
use sqlx::PgPool;
use std::collections::HashMap;
use uuid::Uuid;

use crate::models::{
    HealthResponse, ReportRequest, ReportResponse, TokenTrainRequest, TokenTrainResponse,
};

#[derive(sqlx::FromRow)]
struct TokenRow {
    project_type: String,
    file_size_bytes: i64,
    actual_tokens: i64,
}

#[derive(Debug, Serialize)]
pub struct WeightsResponse {
    pub coefficients: HashMap<String, [f64; 4]>,
}

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

pub async fn get_weights(State(pool): State<PgPool>) -> Result<Json<WeightsResponse>, StatusCode> {
    let rows = sqlx::query_as::<_, TokenRow>(
        "SELECT project_type, file_size_bytes, actual_tokens FROM token_training",
    )
    .fetch_all(&pool)
    .await
    .map_err(|e| {
        tracing::error!("Failed to fetch token data: {e}");
        StatusCode::INTERNAL_SERVER_ERROR
    })?;

    let mut groups: HashMap<String, Vec<(f64, f64)>> = HashMap::new();
    for row in rows {
        groups
            .entry(row.project_type)
            .or_default()
            .push((row.file_size_bytes as f64, row.actual_tokens as f64));
    }

    let mut coefficients = HashMap::new();
    for (ptype, points) in groups {
        let n = points.len() as f64;
        if n == 1.0 {
            let ratio = points[0].1 / points[0].0.max(1.0);
            coefficients.insert(ptype, [0.0, ratio.max(0.0), 0.0, 0.0]);
        } else {
            let mut sum_x = 0.0_f64;
            let mut sum_y = 0.0_f64;
            let mut sum_xy = 0.0_f64;
            let mut sum_x2 = 0.0_f64;
            for (x, y) in &points {
                sum_x += x;
                sum_y += y;
                sum_xy += x * y;
                sum_x2 += x * x;
            }
            let denominator = n * sum_x2 - sum_x * sum_x;
            if denominator != 0.0 {
                let slope = (n * sum_xy - sum_x * sum_y) / denominator;
                let intercept = (sum_y - slope * sum_x) / n;
                coefficients.insert(ptype, [intercept.max(0.0), slope.max(0.0), 0.0, 0.0]);
            }
        }
    }

    Ok(Json(WeightsResponse { coefficients }))
}
