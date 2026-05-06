# RAG System — Kortex

Retrieval-Augmented Generation (RAG) grounds LLM answers in your uploaded documents. Kortex implements a complete ingestion and retrieval pipeline using pgvector for similarity search and sentence-transformers for embeddings.

---

## Architecture

```
                INGESTION PIPELINE
───────────────────────────────────────────────────
 POST /api/rag/upload
        │
        ▼
 Validate (type + size)
        │
        ▼
 StorageService.save()
 └── Local: write to UPLOAD_DIR/{uuid}_{name}
 └── S3: upload to bucket
        │
        ▼
 Document record (status=pending)
        │
        ▼
 BackgroundTask → RAGService.ingest_document()
        │
        ├── Extract text (thread pool, non-blocking)
        │   ├── .pdf  → pypdf
        │   ├── .docx → python-docx
        │   └── .txt/.md → plain read
        │
        ├── chunk_text(text, size=1000, overlap=200)
        │   └── Paragraph-aware sliding window
        │
        ├── asyncio.Semaphore(3)  ← max 3 concurrent
        │
        ├── EmbeddingService.embed(chunks)
        │   └── Returns list[list[float]], each 384-dims
        │
        ├── Bulk INSERT document_chunks
        │   └── embedding VECTOR(384)
        │
        └── Document.status = "ready"

                RETRIEVAL PIPELINE
───────────────────────────────────────────────────
 POST /api/rag/query { query, documentIds?, maxCitations }
        │
        ▼
 EmbeddingService.embed([query])
 └── 384-dim query vector
        │
        ▼
 pgvector cosine similarity search
 SELECT ... ORDER BY embedding <=> $query_vec LIMIT maxCitations
 (optional: WHERE document_id IN documentIds)
        │
        ▼
 Filter: score >= SIMILARITY_THRESHOLD (0.3)
        │
        ├── No results? → return early message, no LLM call
        │
        ▼
 Build context: join chunk content strings
        │
        ▼
 LLMService.complete(system + context + question)
        │
        ▼
 Return: answer + citations + sources
```

---

## Chunking Strategy

```python
chunk_text(text, chunk_size=1000, overlap=200)
```

The chunker uses a paragraph-aware sliding window:

1. Split text into paragraphs on `\n\n`
2. Group paragraphs until the chunk reaches `chunk_size` characters
3. Start the next chunk `overlap` characters before the end of the previous
4. This preserves paragraph boundaries inside chunks when possible

**Configuration:**

| Variable | Default | Description |
|---|---|---|
| `CHUNK_SIZE` | 1000 | Target chars per chunk |
| `CHUNK_OVERLAP` | 200 | Overlap between adjacent chunks |

Larger `CHUNK_SIZE` preserves more context per chunk but reduces retrieval precision. Smaller sizes improve precision but may split important context across chunks.

---

## Embedding Service

### sentence-transformers (default, free)

Model: `all-MiniLM-L6-v2` (384 dimensions)

```
Chunk text
    │
    ▼
SentenceTransformerBackend.embed()
    ├── asyncio: loop.run_in_executor(None, model.encode)
    │   └── CPU inference in thread pool (non-blocking)
    ├── normalize_embeddings=True (unit vectors for cosine)
    └── _pad_or_truncate(vec, target_dim=384)
        └── Pads with zeros or truncates to exact EMBEDDING_DIMENSIONS
```

Model is loaded **once at startup** into `app.state.embedding_service` and reused across all requests.

### Anthropic / Voyage AI (paid)

Set `EMBEDDING_BACKEND=anthropic`. Uses the Voyage `voyage-3` model (1024 dims), padded/truncated to `EMBEDDING_DIMENSIONS`.

**Note:** Uses a new `httpx.AsyncClient` per `embed()` call. For high throughput, consider connection pooling.

### Switching Models

1. Change `EMBEDDING_MODEL` and `EMBEDDING_DIMENSIONS` in `.env`
2. Re-run migrations if `EMBEDDING_DIMENSIONS` changed (column type is fixed at schema creation)
3. Re-ingest all documents (old embeddings won't match new dimension)

---

## pgvector Search

The similarity search uses the IVFFlat index with cosine distance:

```sql
-- Index (created in 001_initial.sql)
CREATE INDEX idx_chunks_embedding
  ON document_chunks USING ivfflat (embedding vector_cosine_ops)
  WITH (lists = 100);

-- Query pattern (RAGService.query)
SELECT
  dc.id,
  dc.content,
  dc.page_number,
  dc.document_id,
  d.name AS document_name,
  (dc.embedding <=> $1) AS distance
FROM document_chunks dc
JOIN documents d ON dc.document_id = d.id
WHERE d.status = 'ready'
  AND ($2::uuid[] IS NULL OR d.id = ANY($2))
ORDER BY dc.embedding <=> $1
LIMIT $3;
```

The `<=>` operator returns cosine distance (0 = identical, 2 = opposite). Score in citations is converted to similarity: `score = 1 - distance`.

**`SIMILARITY_THRESHOLD = 0.3`** — chunks with `score < 0.3` are filtered out. Lower this value if the knowledge base is small or queries are broad. Raise it for higher precision.

**IVFFlat `lists=100`** — set to `sqrt(num_vectors)` as a rule of thumb. For very large datasets (>100K chunks), increase lists and consider HNSW index instead.

---

## Citation Format

Each citation returned:

```json
{
  "id": "uuid",
  "documentId": "uuid",
  "documentName": "Q4-Report.pdf",
  "content": "The first 250 characters of the chunk content…",
  "page": 3,
  "relevanceScore": 0.87
}
```

`content` is truncated to 250 characters at the nearest sentence boundary to keep responses concise. `page` comes from `chunk.page_number` (available for PDFs; `null` for plain text).

---

## Document Storage

Documents are stored via `StorageService`:

| Backend | `STORAGE_BACKEND` | Storage location |
|---|---|---|
| Local | `local` | `UPLOAD_DIR/` (default `./uploads/`) |
| S3 | `s3` | `s3://{S3_BUCKET}/{uuid}_{filename}` |

**Path traversal protection:** `Path(filename).name` is applied before writing — `../../etc/passwd` becomes `passwd`.

The file content is stored at upload time and read again only if re-ingestion is needed. Vector chunks in pgvector are sufficient for all retrieval operations.

---

## File Type Support

| Extension | Parser | Notes |
|---|---|---|
| `.pdf` | pypdf | Page numbers extracted |
| `.docx` | python-docx | Paragraphs joined |
| `.doc` | python-docx | Same as .docx |
| `.txt` | plain read | No structure extraction |
| `.md` | plain read | Markdown kept as-is |

Text extraction runs in a thread pool executor — large PDFs don't block the async event loop.

---

## Concurrency

- `asyncio.Semaphore(3)` limits concurrent ingestion tasks
- Each ingestion is a FastAPI `BackgroundTask` (runs in the web process)
- If the server restarts mid-ingestion, the document remains in `processing` state — re-upload to recover
- For production with frequent large uploads, use an external job queue (ARQ / Celery)

---

## Error Handling

| Scenario | Behaviour |
|---|---|
| Unsupported file type | `415 Unsupported Media Type` |
| File too large | `413 Request Entity Too Large` |
| Extraction fails | `Document.status = "error"`, `error_msg` set |
| No relevant chunks found | Early return: `"I couldn't find relevant information in the knowledge base."` — no LLM call |
| LLM fails during synthesis | `LLMError` raised → `500` response |

---

## Performance Characteristics

| Operation | Typical time |
|---|---|
| Upload (50 MB PDF) | < 1s (async write) |
| Text extraction (50-page PDF) | 1–3s (thread pool) |
| Chunking (50-page PDF) | < 100ms |
| Embedding (100 chunks) | 0.5–2s (CPU, sentence-transformers) |
| pgvector search (10K chunks) | < 50ms |
| LLM synthesis | 500ms–3s (streaming) |

Total time from upload to first query: 5–30s depending on document size.
