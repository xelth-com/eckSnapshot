-- Simplified schema without vector and graph extensions for testing

-- Таблица для хранения фрагментов кода
CREATE TABLE IF NOT EXISTS code_chunks (
    id SERIAL PRIMARY KEY,
    file_path TEXT NOT NULL,
    chunk_type VARCHAR(50) NOT NULL, -- 'function', 'class', 'file'
    chunk_name TEXT,
    code TEXT NOT NULL,
    summary TEXT, -- Сюда будет писать "Аналитик кода"
    tokens INT,
    embedding TEXT -- JSON string representation for now
);

-- Таблица для хранения связей
CREATE TABLE IF NOT EXISTS relations (
    id SERIAL PRIMARY KEY,
    from_id INT REFERENCES code_chunks(id) ON DELETE CASCADE,
    to_id INT REFERENCES code_chunks(id) ON DELETE CASCADE,
    relation_type VARCHAR(50) NOT NULL -- 'imports', 'calls'
);