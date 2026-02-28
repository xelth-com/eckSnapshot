use serde::{Deserialize, Serialize};
use uuid::Uuid;

#[derive(Debug, Deserialize)]
pub struct ReportRequest {
    pub model_name: String,
    pub agent_role: String,
    pub task_scope: String,
    pub status: String,
    pub duration_sec: Option<i32>,
    pub error_summary: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct ReportResponse {
    pub ok: bool,
    pub report_id: Uuid,
}

#[derive(Debug, Deserialize)]
pub struct TokenTrainRequest {
    pub project_type: String,
    pub file_size_bytes: i64,
    pub actual_tokens: i64,
}

#[derive(Debug, Serialize)]
pub struct TokenTrainResponse {
    pub ok: bool,
}

#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: &'static str,
    pub version: &'static str,
}
