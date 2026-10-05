ALTER TABLE public.lesson_chunks
  ADD COLUMN IF NOT EXISTS embedding_provider varchar(120) NOT NULL DEFAULT 'ollama:nomic-embed-text:768';
