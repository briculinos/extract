# Agent Guide: Document Extract Application

This document provides comprehensive context for AI agents working on this codebase.

## Overview

**Purpose**: AI-powered system to extract structured data from unstructured documents (PDFs, images, DOCX, etc.) and provide search + chat insights over the extracted data.

**Primary Use Case**: Digital Product Passport extraction and general document intelligence.

**Extraction Engine**: Multi-provider architecture with NuExtract (primary) and LlamaExtract (fallback).

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                      FRONTEND (React + Vite)                        │
│                      Port: 5173                                     │
├─────────────────┬─────────────────┬─────────────────────────────────┤
│  /              │   /results      │   /insights                     │
│  1. Schema      │   Data Table    │   Chat with                     │
│  2. File Upload │   + PDF Preview │   Document Context              │
└────────┬────────┴────────┬────────┴────────────────┬────────────────┘
         │                 │                         │
         ▼                 ▼                         ▼
┌─────────────────────────────────────────────────────────────────────┐
│                    BACKEND (FastAPI) - Port: 8000                   │
│                    Base URL: /api/v1                                │
└─────────────────────────────────────────────────────────────────────┘
              │                                    │
              ▼                                    │
┌──────────────────────────┐                       │
│   Redis - Port: 6379     │                       │
│   (Celery job queue)     │                       │
└────────────┬─────────────┘                       │
             ▼                                     │
┌─────────────────────────────────────────────────────────────────────┐
│              CELERY WORKERS (Scalable, 4 concurrent default)        │
│                                                                     │
│   Extraction Provider Chain (auto mode):                            │
│   ┌─────────────────┐    ┌─────────────────┐    ┌────────────────┐  │
│   │ 1. NuExtract    │───▶│ 2. NuExtract    │───▶│ 3. LlamaExtract│  │
│   │    API          │    │    Local        │    │    API         │  │
│   │ (if API key set)│    │ (if enabled)    │    │ (fallback)     │  │
│   └─────────────────┘    └─────────────────┘    └────────────────┘  │
│                                                                     │
│   Job Flow:                                                         │
│   1. Pull job from Redis                                            │
│   2. Download document from MinIO                                   │
│   3. Extract text (PyPDF2/pdfplumber for PDFs)                      │
│   4. Call extraction provider (NuExtract → LlamaExtract fallback)   │
│   5. Store extracted JSON in PostgreSQL                             │
│   6. Generate OpenAI embeddings                                     │
│   7. Store embeddings in pgvector                                   │
│   8. Update job status                                              │
└─────────────────────────────────────────────────────────────────────┘
              │                                    │
              ▼                                    ▼
┌──────────────────────────┬──────────────────────────────────────────┐
│   MinIO - Ports 9000/9001│   PostgreSQL + pgvector - Port: 5432     │
│   Bucket: documents      │   Database: extract_db                   │
│   Credentials: minioadmin│   Tables: documents, extraction_jobs,    │
│                          │           extracted_data, document_chunks│
└──────────────────────────┴──────────────────────────────────────────┘
```

---

## Multi-Provider Extraction System

The application uses a **provider chain** for structured data extraction, with automatic fallback:

### Provider Priority (auto mode)

| Priority | Provider | Activation Condition | Use Case |
|----------|----------|---------------------|----------|
| 1 | **NuExtract API** | `NUMIND_API_KEY` is set | Production, managed service |
| 2 | **NuExtract Local** | `NUEXTRACT_USE_LOCAL=true` | Privacy, offline, no API costs |
| 3 | **LlamaExtract** | `LLAMA_CLOUD_API_KEY` is set | Fallback, complex documents |

### Why NuExtract is Primary

- **Open Source**: MIT license, can run locally
- **Efficient**: 0.5B-7B parameter models match 100x larger LLMs
- **Privacy**: Local deployment option for sensitive documents
- **Multilingual**: Supports EN, FR, ES, DE, PT, IT
- **Cost**: Local model = no per-request API costs

### Provider Configuration

```bash
# Option 1: NuMind Platform API (easiest)
NUMIND_API_KEY=your_key
EXTRACTION_PROVIDER=auto  # Will use NuExtract API

# Option 2: Local NuExtract model (privacy/offline)
NUEXTRACT_USE_LOCAL=true
NUEXTRACT_MODEL=numind/NuExtract-1.5  # or NuExtract-2.0-8B
NUEXTRACT_DEVICE=cuda  # cuda, cpu, mps
EXTRACTION_PROVIDER=nuextract_local

# Option 3: Force LlamaExtract only
EXTRACTION_PROVIDER=llamaextract
LLAMA_CLOUD_API_KEY=your_key
```

### NuExtract Model Options

| Model | Size | VRAM | Best For |
|-------|------|------|----------|
| `numind/NuExtract-tiny` | 0.5B | ~2GB | Quick extractions, limited resources |
| `numind/NuExtract` | 3.8B | ~8GB | Balanced accuracy/speed |
| `numind/NuExtract-1.5` | 3.8B | ~8GB | **Recommended** - multilingual, long docs |
| `numind/NuExtract-large` | 7B | ~16GB | Maximum accuracy |
| `numind/NuExtract-2.0-8B` | 8B | ~18GB | Latest, multimodal support |

### How Provider Selection Works

```python
# In extraction_service.py:
class ExtractionService:
    def _get_provider_order(self):
        if settings.extraction_provider == "auto":
            return ["nuextract_api", "nuextract_local", "llamaextract"]
        else:
            # Specific provider first, then fallbacks
            return [settings.extraction_provider, ...]

    async def extract_from_text(self, text, schema_name):
        for provider_name in self._get_provider_order():
            provider = self.providers[provider_name]
            if provider.is_available():
                try:
                    return provider.extract(text, schema_name)
                except Exception:
                    continue  # Try next provider
        raise RuntimeError("All providers failed")
```

---

## Key Files & Their Purposes

### Backend (`/backend`)

| File | Purpose |
|------|---------|
| `app/main.py` | FastAPI application entry point, CORS config, lifespan events |
| `app/core/config.py` | Environment variables and settings (Pydantic Settings) |
| `app/core/database.py` | SQLAlchemy async engine, session factory, pgvector init |
| `app/models/document.py` | SQLAlchemy models: Document, ExtractionJob, ExtractedData, DocumentChunk |
| `app/api/routes.py` | All REST endpoints (upload, search, chat, etc.) |
| `app/api/schemas.py` | Pydantic request/response schemas |
| `app/services/minio_service.py` | MinIO client wrapper (upload, download, presigned URLs) |
| `app/services/extraction_service.py` | **Multi-provider extraction**: NuExtract API/Local + LlamaExtract fallback |
| `app/services/embedding_service.py` | OpenAI embeddings + text chunking |
| `app/services/chat_service.py` | Chat with direct SQL query on extracted data + OpenAI (gpt-4o-mini) |
| `app/workers/celery_app.py` | Celery configuration |
| `app/workers/extraction_tasks.py` | Background task: `process_document_extraction` |

### Frontend (`/frontend`)

| File | Purpose |
|------|---------|
| `src/App.tsx` | Main component with React Router (3 pages: /, /results, /insights) |
| `src/api/client.ts` | Axios API client with all endpoint functions |
| `src/store/useStore.ts` | Zustand global state management with persistence |
| `src/types/index.ts` | TypeScript interfaces |
| `src/components/SchemaSelector.tsx` | Schema picker + custom schema creation with name/fields |
| `src/components/FileUpload.tsx` | Drag-drop zone + "Browse Files" button + URL fetch |
| `src/components/DocumentPreview.tsx` | Stacked document cards with PDF/image thumbnails |
| `src/components/ResultsPage.tsx` | Extracted data table with inline PDF preview |
| `src/components/InlinePDFPreview.tsx` | PDF viewer with field highlighting on hover |
| `src/components/DocumentPreviewModal.tsx` | Full-screen document preview modal |
| `src/components/InsightsChat.tsx` | Streaming chat + document list sidebar |
| `src/components/PDFViewer.tsx` | React-PDF based viewer with zoom/navigation |
| `src/components/ExportModal.tsx` | Export data to CSV/JSON |
| `src/components/DocumentList.tsx` | Document listing with status indicators |
| `src/components/ExtractedDataView.tsx` | Rendered extracted JSON data |
| `src/components/SearchPanel.tsx` | Full-text search UI |

---

## Database Schema

### `documents` table
```sql
id              VARCHAR(36) PRIMARY KEY  -- UUID
filename        VARCHAR(255)             -- MinIO object name
original_filename VARCHAR(255)           -- User's filename
content_type    VARCHAR(100)             -- MIME type
file_size       INTEGER                  -- Bytes
minio_path      VARCHAR(500)             -- MinIO object path
source_type     VARCHAR(50)              -- 'upload' or 'api_endpoint'
source_url      VARCHAR(1000)            -- Original URL if fetched
created_at      TIMESTAMP
updated_at      TIMESTAMP
```

### `extraction_jobs` table
```sql
id              VARCHAR(36) PRIMARY KEY
document_id     VARCHAR(36) FK -> documents.id
status          ENUM('pending', 'processing', 'completed', 'failed')
schema_name     VARCHAR(100)             -- e.g., 'product_passport', 'generic'
error_message   TEXT
started_at      TIMESTAMP
completed_at    TIMESTAMP
created_at      TIMESTAMP
```

### `extracted_data` table
```sql
id              VARCHAR(36) PRIMARY KEY
document_id     VARCHAR(36) FK -> documents.id
schema_name     VARCHAR(100)
data            JSONB                    -- The extracted structured data
confidence_scores JSONB                  -- Per-field confidence (LlamaExtract only)
citations       JSONB                    -- Source citations (LlamaExtract only)
created_at      TIMESTAMP
```

### `document_chunks` table (for RAG)
```sql
id              VARCHAR(36) PRIMARY KEY
document_id     VARCHAR(36) FK -> documents.id
chunk_index     INTEGER
content         TEXT                     -- Chunk text
embedding       VECTOR(1536)             -- OpenAI text-embedding-3-small
metadata        JSONB
created_at      TIMESTAMP
```

---

## API Endpoints

### Document Management
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/documents/upload` | Upload file (multipart/form-data) |
| POST | `/api/v1/documents/fetch-url` | Fetch from URL `{url, schema_name}` |
| GET | `/api/v1/documents` | List documents (pagination: `limit`, `offset`) |
| GET | `/api/v1/documents/{id}` | Get single document |
| GET | `/api/v1/documents/{id}/extracted` | Get extracted data for document |

### Jobs
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/jobs/{id}` | Get job status (poll this for progress) |

### Search
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/search` | Full-text search `{query, limit, offset}` |
| GET | `/api/v1/search/semantic?query=...&limit=5` | Vector similarity search |

### Chat
| Method | Endpoint | Description |
|--------|----------|-------------|
| POST | `/api/v1/chat` | Chat completion `{query, chat_history}` |
| POST | `/api/v1/chat/stream` | Streaming chat (SSE-like plain text stream) |

### Schemas
| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/v1/schemas` | List available extraction schemas |

---

## Extraction Schemas

Defined in `backend/app/services/extraction_service.py`:

### `product_passport` (ProductPassport)
For Digital Product Passport data extraction:
- `product_name`, `manufacturer`, `model_number`, `serial_number`
- `manufacturing_date`, `manufacturing_location`
- `materials` (list), `weight`, `dimensions`
- `co2_footprint`, `energy_rating`, `recyclability`, `hazardous_substances`
- `certifications`, `compliance_standards`
- `expected_lifespan`, `warranty_period`, `repair_information`, `end_of_life_instructions`

### `generic` (GenericDocument)
For general document extraction:
- `title`, `document_type`, `date`, `author`
- `summary`, `key_entities` (list), `key_values` (dict), `categories`

### NuExtract Template Format

Schemas are converted to NuExtract's JSON template format via `schema_to_template()`:

```python
# Pydantic schema
class ProductPassport(BaseModel):
    product_name: Optional[str] = Field(...)
    materials: Optional[list[str]] = Field(...)

# Becomes NuExtract template
{
    "product_name": "",
    "materials": [""]
}
```

**To add new schemas**:
1. Define Pydantic model in `extraction_service.py`
2. Add to `SCHEMAS` dict
3. Frontend will auto-discover via `/api/v1/schemas`

---

## Data Flow: Document Upload to Insights

```
1. User flow on upload page (/):
   └─> Select or create extraction schema (SchemaSelector.tsx)
   └─> Custom schemas: name + fields, saved to localStorage
   └─> Upload files via drag-drop, "Browse Files", or URL fetch
   └─> POST /api/v1/documents/upload (multipart)

2. Backend receives file
   └─> minio_service.upload_file() -> stores in MinIO
   └─> Creates Document record in PostgreSQL
   └─> Creates ExtractionJob record (status: pending)
   └─> Calls process_document_extraction.delay(job_id, doc_id, schema)
   └─> Returns {document_id, job_id, status: pending}

3. Frontend polls job status
   └─> GET /api/v1/jobs/{job_id} every 2 seconds
   └─> Updates UI with status changes

4. Celery worker picks up job
   └─> Downloads file from MinIO
   └─> Extracts text (PyPDF2 for PDFs, raw read for others)
   └─> Calls extraction_service.extract_from_text()
       ├─> Try NuExtract API (if NUMIND_API_KEY set)
       ├─> Try NuExtract Local (if NUEXTRACT_USE_LOCAL=true)
       └─> Fallback to LlamaExtract (if LLAMA_CLOUD_API_KEY set)
   └─> Stores ExtractedData in PostgreSQL (includes provider name)
   └─> Chunks extracted JSON text
   └─> Generates embeddings via OpenAI
   └─> Stores DocumentChunk records with vectors
   └─> Updates job status to 'completed'

5. User can now:
   └─> View extracted data (ExtractedDataView.tsx)
   └─> Search via /search (SearchPanel.tsx)
   └─> Chat via /insights (InsightsChat.tsx)

6. Chat flow (fast, direct SQL):
   └─> User asks question
   └─> Backend queries ExtractedData table directly (no embeddings)
   └─> Builds context from all extracted JSON data (limit 50)
   └─> Calls OpenAI gpt-4o-mini with context + question
   └─> Streams response back to frontend
```

---

## Environment Variables

| Variable | Service | Description |
|----------|---------|-------------|
| `DATABASE_URL` | Backend/Worker | PostgreSQL connection string |
| `REDIS_URL` | Backend/Worker | Redis connection string |
| `MINIO_ENDPOINT` | Backend/Worker | MinIO host:port |
| `MINIO_ACCESS_KEY` | Backend/Worker | MinIO access key |
| `MINIO_SECRET_KEY` | Backend/Worker | MinIO secret key |
| `MINIO_BUCKET` | Backend/Worker | MinIO bucket name |
| **NuExtract (Primary)** | | |
| `NUMIND_API_KEY` | Worker | NuMind platform API key |
| `NUEXTRACT_USE_LOCAL` | Worker | Enable local model (true/false) |
| `NUEXTRACT_MODEL` | Worker | HuggingFace model name |
| `NUEXTRACT_DEVICE` | Worker | Device: cuda, cpu, mps |
| `EXTRACTION_PROVIDER` | Worker | auto, nuextract_api, nuextract_local, llamaextract |
| **LlamaExtract (Fallback)** | | |
| `LLAMA_CLOUD_API_KEY` | Worker | LlamaExtract API key |
| **OpenAI** | | |
| `OPENAI_API_KEY` | Backend/Worker | OpenAI API key (embeddings + chat) |

---

## Common Tasks for Agents

### Adding a new extraction schema
1. Define Pydantic model in `backend/app/services/extraction_service.py`
2. Add to `SCHEMAS` dict
3. Frontend will auto-discover via `/api/v1/schemas`

### Adding a new extraction provider
1. Create class inheriting from `ExtractionProvider` in `extraction_service.py`
2. Implement `is_available()` and `extract()` methods
3. Register in `ExtractionService.providers` dict
4. Add to provider order in `_get_provider_order()`

### Switching extraction providers
```bash
# Force specific provider
EXTRACTION_PROVIDER=nuextract_local  # or nuextract_api, llamaextract

# Or let auto mode choose based on available API keys
EXTRACTION_PROVIDER=auto
```

### Adding a new API endpoint
1. Add route in `backend/app/api/routes.py`
2. Add request/response schemas in `backend/app/api/schemas.py`
3. Add API client function in `frontend/src/api/client.ts`

### Modifying database schema
1. Update models in `backend/app/models/document.py`
2. Database recreates on startup (dev mode) or use Alembic for migrations

### Adding new frontend page
1. Create component in `frontend/src/components/`
2. Add route in `frontend/src/App.tsx`
3. Add navigation link in App.tsx header

### Debugging extraction issues
1. Check job status: `GET /api/v1/jobs/{id}`
2. Check Celery logs: `docker-compose logs celery-worker`
3. Check extracted data: `GET /api/v1/documents/{id}/extracted`
4. Look for `provider` field in extracted_data to see which provider was used

### Scaling workers
```yaml
# In docker-compose.yml, modify celery-worker command:
command: celery -A app.workers.celery_app worker --loglevel=info --concurrency=8
```

### Running local NuExtract model
```bash
# Requires GPU with sufficient VRAM
NUEXTRACT_USE_LOCAL=true
NUEXTRACT_MODEL=numind/NuExtract-1.5
NUEXTRACT_DEVICE=cuda

# For CPU-only (slower):
NUEXTRACT_DEVICE=cpu

# For Apple Silicon:
NUEXTRACT_DEVICE=mps
```

---

## External Dependencies

| Service | Purpose | Docs |
|---------|---------|------|
| **NuExtract** | Primary extraction (API or local model) | https://numind.ai/blog/nuextract-a-foundation-model-for-structured-extraction |
| NuMind Platform | NuExtract cloud API | https://nuextract.ai |
| HuggingFace | NuExtract local models | https://huggingface.co/numind |
| **LlamaExtract** | Fallback extraction | https://docs.cloud.llamaindex.ai/llamaextract |
| **OpenAI** | Embeddings (text-embedding-3-small) + Chat (gpt-4o) | https://platform.openai.com/docs |
| pgvector | Vector similarity search in PostgreSQL | https://github.com/pgvector/pgvector |
| MinIO | S3-compatible object storage | https://min.io/docs |
| Celery | Distributed task queue | https://docs.celeryq.dev |
| PyPDF2 | PDF text extraction | https://pypdf2.readthedocs.io |

---

## Digital Product Passport Context

This application was designed with EU Digital Product Passport (DPP) regulations in mind:

- **ESPR** (Ecodesign for Sustainable Products Regulation) mandates DPPs by 2026+
- DPPs contain: materials, environmental impact, recyclability, certifications
- Real examples researched:
  - Schneider Electric: https://schneider-electric.dpp.spherity.com/
  - Siemens: ID-Link system, Battery Passport
  - IKEA: 9,500+ circular design articles
  - Philips: WEEE recycling passports

The `product_passport` schema is aligned with these real-world DPP data requirements.

---

## Testing the Application

```bash
# Start all services
docker-compose up -d

# Check service health
curl http://localhost:8000/health

# Upload a test document
curl -X POST http://localhost:8000/api/v1/documents/upload \
  -F "file=@test.pdf" \
  -F "schema_name=product_passport"

# Check job status (replace JOB_ID)
curl http://localhost:8000/api/v1/jobs/{JOB_ID}

# Search extracted data
curl -X POST http://localhost:8000/api/v1/search \
  -H "Content-Type: application/json" \
  -d '{"query": "manufacturer"}'

# Chat with documents
curl -X POST http://localhost:8000/api/v1/chat \
  -H "Content-Type: application/json" \
  -d '{"query": "What products are in the database?"}'
```

---

## Recent Updates (December 2024)

### Custom Schema Management
- **Delete custom schemas**: Users can now delete custom schemas they no longer need
  - Trash icon appears next to custom schemas in the dropdown
  - Confirmation dialog before deletion
  - If deleted schema was selected, falls back to 'generic'
  - Files: `SchemaSelector.tsx`, `useStore.ts` (deleteCustomSchema action)

### Image Preview Support
- **InlinePDFPreview** now handles both PDFs and images (PNG, JPG, JPEG, GIF, WebP, BMP, TIFF)
  - Auto-detects file type from filename extension
  - Images render with `<img>` tag instead of react-pdf
  - Zoom controls work for both PDFs and images
  - Files: `InlinePDFPreview.tsx`, `ResultsPage.tsx` (passes filename prop)

---

## Planned Features

### Nested Fields / Line Items Support (In Development)
**Goal**: Handle invoices with multiple line items (e.g., IKEA kitchen with 5000+ items)

**Approach**:
1. **Backend**: Add `LineItem` Pydantic model with fields: `product_name`, `quantity`, `unit_price`, `total_price`, `vat_rate`, `sku`
2. **Invoice Schema**: Add `line_items: Optional[list[LineItem]]` field
3. **Custom Schemas**: Support syntax `line_items[].field_name` for nested arrays
4. **UI Display**: Expandable rows - collapsed shows "N line items", expanded shows table
5. **Export**: Flatten to one row per line item (document fields repeated)

**Key files to modify**:
- `backend/app/services/extraction_service.py` - LineItem model, update Invoice schema
- `frontend/src/components/ExpandableLineItems.tsx` - New component
- `frontend/src/components/ResultsPage.tsx` - Detect arrays, render expandable
- `frontend/src/components/ExportModal.tsx` - Flatten line items

---

## Known Limitations

1. **No authentication** - Add JWT/OAuth for production
2. **No file validation** - Add virus scanning, size limits
3. **Basic search** - Consider Elasticsearch for large-scale full-text search
4. **No rate limiting** - Add for production API
5. **NuExtract local model** - Requires GPU with sufficient VRAM for best performance
6. **PDF text extraction** - Uses simple text extraction; complex layouts may need OCR
7. **Flat schemas only** - Currently no support for nested/array fields (in development)

---

## File Locations Quick Reference

- **Main FastAPI app**: `backend/app/main.py:14`
- **API routes**: `backend/app/api/routes.py`
- **Celery task**: `backend/app/workers/extraction_tasks.py:28`
- **Multi-provider extraction**: `backend/app/services/extraction_service.py`
- **Provider classes**: `extraction_service.py:110` (NuExtractAPIProvider), `:166` (NuExtractLocalProvider), `:268` (LlamaExtractProvider)
- **Extraction schemas**: `extraction_service.py:32` (ProductPassport), `:63` (GenericDocument)
- **Vector search**: `backend/app/services/chat_service.py:22`
- **Frontend state**: `frontend/src/store/useStore.ts`
- **API client**: `frontend/src/api/client.ts`
- **Docker services**: `docker-compose.yml`
