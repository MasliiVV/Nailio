-- init-db.sql
-- Виконується при першому запуску PostgreSQL контейнера

-- Необхідні розширення (docs/database/schema.md)
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "btree_gist";
