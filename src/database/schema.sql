-- Активируем расширение для векторного поиска
CREATE EXTENSION IF NOT EXISTS vector;

-- Загружаем расширение для графового поиска
-- (Предполагается, что Apache AGE уже установлен для вашей версии PG)
LOAD 'age';
SET search_path = ag_catalog, "$user", public;

-- Создаем графовое пространство (если его нет)
SELECT create_graph('eck_snapshot_graph');

-- Таблица для хранения фрагментов кода (узлов графа)
CREATE TABLE IF NOT EXISTS code_chunks (
    id SERIAL PRIMARY KEY,
    file_path TEXT NOT NULL,
    chunk_type VARCHAR(50) NOT NULL, -- 'function', 'class', 'file'
    chunk_name TEXT,
    code TEXT NOT NULL,
    summary TEXT, -- Сюда будет писать "Аналитик кода"
    tokens INT,
    embedding VECTOR(768), -- Размерность для Jina Code v2
    content_hash TEXT NOT NULL UNIQUE, -- Для кэширования
    profile VARCHAR(100) -- Профиль контекста
);

-- Таблица для хранения связей (ребер графа)
CREATE TABLE IF NOT EXISTS relations (
    id SERIAL PRIMARY KEY,
    from_id INT REFERENCES code_chunks(id) ON DELETE CASCADE,
    to_id INT REFERENCES code_chunks(id) ON DELETE CASCADE,
    relation_type VARCHAR(50) NOT NULL -- 'imports', 'calls'
);

-- Создаем HNSW-индекс для быстрого векторного поиска
CREATE INDEX IF NOT EXISTS code_chunks_embedding_idx ON code_chunks USING HNSW (embedding vector_cosine_ops);