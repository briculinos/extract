# Document Extract

AI-powered document extraction system using LlamaExtract for structured data extraction from unstructured documents.

## Features

- **Drag & Drop Upload**: Upload PDF, images, DOCX, XLSX, and text files
- **API Endpoint Fetch**: Fetch documents directly from URLs
- **Structured Extraction**: Extract data using predefined schemas (Digital Product Passport, Generic)
- **Full-Text Search**: Search across all extracted data
- **Semantic Search**: Vector similarity search using pgvector
- **Insights Chat**: Ask questions about your documents using RAG

## Architecture

```
Frontend (React + Vite) → Backend (FastAPI) → Celery Workers → PostgreSQL + pgvector
                                    ↓
                               LlamaExtract API
                                    ↓
                                MinIO (storage)
```

## Quick Start

1. **Clone and configure**:
   ```bash
   cp .env.example .env
   # Edit .env with your API keys
   ```

2. **Start services**:
   ```bash
   docker-compose up -d
   ```

3. **Access the app**:
   - Frontend: http://localhost:5173
   - Backend API: http://localhost:8000
   - MinIO Console: http://localhost:9001

## API Keys Required

- **LLAMA_CLOUD_API_KEY**: Get from [LlamaCloud](https://cloud.llamaindex.ai/)
- **OPENAI_API_KEY**: Get from [OpenAI](https://platform.openai.com/)

## API Endpoints

| Endpoint | Method | Description |
|----------|--------|-------------|
| `/api/v1/documents/upload` | POST | Upload document for extraction |
| `/api/v1/documents/fetch-url` | POST | Fetch document from URL |
| `/api/v1/documents` | GET | List all documents |
| `/api/v1/documents/{id}` | GET | Get document details |
| `/api/v1/documents/{id}/extracted` | GET | Get extracted data |
| `/api/v1/jobs/{id}` | GET | Get job status |
| `/api/v1/search` | POST | Search extracted data |
| `/api/v1/search/semantic` | GET | Semantic vector search |
| `/api/v1/chat` | POST | Chat with documents |
| `/api/v1/schemas` | GET | List available schemas |

## Extraction Schemas

### Product Passport
Designed for Digital Product Passport data:
- Product identification (name, model, serial number)
- Manufacturing info (date, location, materials)
- Environmental data (CO2 footprint, recyclability)
- Compliance and certifications
- Lifecycle information

### Generic
General-purpose document extraction:
- Title and document type
- Author and date
- Key entities and values
- Summary and categories

## Development

### Backend
```bash
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

### Celery Worker
```bash
cd backend
celery -A app.workers.celery_app worker --loglevel=info
```

## Tech Stack

- **Frontend**: React, Vite, TailwindCSS, Zustand
- **Backend**: FastAPI, SQLAlchemy, Celery
- **Database**: PostgreSQL with pgvector
- **Storage**: MinIO (S3-compatible)
- **Queue**: Redis
- **AI**: LlamaExtract, OpenAI
