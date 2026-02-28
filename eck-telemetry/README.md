# eck-telemetry

Telemetry Hub for AI Agent Reports & Token Estimation Weights.

## Overview

This microservice acts as a centralized telemetry hub for the ECK ecosystem. It collects:
- Agent execution reports (model name, role, task status, duration, errors)
- Token training data (project type, file size, actual token count)

## Tech Stack

- **Language**: Rust (Edition 2024)
- **Web Framework**: Axum 0.8
- **Database**: PostgreSQL (via SQLx)
- **Port**: 3203 (configurable via `PORT` env var)

## Endpoints

### GET /T/health
Health check endpoint.

**Response:**
```json
{
  "status": "ok",
  "version": "0.1.0"
}
```

### POST /T/report
Submit an agent execution report.

**Request:**
```json
{
  "model_name": "GLM-4.7 (OpenCode)",
  "agent_role": "Swarm Orchestrator",
  "task_scope": "Implement feature X",
  "status": "SUCCESS",
  "duration_sec": 120,
  "error_summary": null
}
```

**Response:**
```json
{
  "ok": true,
  "report_id": "550e8400-e29b-41d4-a716-446655440000"
}
```

### POST /T/tokens/train
Submit token training data for estimator improvement.

**Request:**
```json
{
  "project_type": "nodejs",
  "file_size_bytes": 1024000,
  "actual_tokens": 150000
}
```

**Response:**
```json
{
  "ok": true
}
```

## Database Schema

### agent_runs
- `id`: UUID (primary key)
- `timestamp`: TIMESTAMPTZ (auto-generated)
- `model_name`: VARCHAR(100)
- `agent_role`: VARCHAR(50)
- `task_scope`: VARCHAR(100)
- `status`: VARCHAR(20)
- `duration_sec`: INTEGER (optional)
- `error_summary`: TEXT (optional)

### token_training
- `id`: SERIAL (primary key)
- `timestamp`: TIMESTAMPTZ (auto-generated)
- `project_type`: VARCHAR(50)
- `file_size_bytes`: BIGINT
- `actual_tokens`: BIGINT

## Environment Variables

- `DATABASE_URL`: PostgreSQL connection string (default: `postgres://openpg:openpgpwd@localhost:5432/eckwms`)
- `PORT`: HTTP server port (default: 3203)
- `RUST_LOG`: Logging level (default: `info`)

## Running

```bash
# Set environment variables
export DATABASE_URL="postgres://user:pass@localhost:5432/eckwms"
export PORT=3203

# Run the service
cargo run --release
```

## Development

```bash
# Check for compilation errors (fast)
cargo check

# Run tests
cargo test

# Run with logging
RUST_LOG=debug cargo run
```
