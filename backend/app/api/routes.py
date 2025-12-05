from fastapi import APIRouter, UploadFile, File, Depends, HTTPException, Query
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func
from typing import Optional
import httpx

from app.core.database import get_db
from app.models.document import Document, ExtractionJob, ExtractedData, JobStatus
from app.services.minio_service import minio_service
from app.services.chat_service import chat_service
from app.services.extraction_service import SCHEMAS
from app.workers.extraction_tasks import process_document_extraction
from app.api.schemas import (
    DocumentUploadResponse,
    FetchFromURLRequest,
    SearchRequest,
    ChatRequest,
    DocumentResponse,
    JobResponse,
    ExtractedDataResponse,
    SearchResponse,
    SearchResultItem,
    ChatResponse,
    SchemaInfo,
    JobStatusEnum,
)

router = APIRouter()


# ============ Document Upload Endpoints ============

@router.post("/documents/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    schema_name: str = Query(default="generic", description="Extraction schema to use"),
    custom_fields: str = Query(default="", description="Comma-separated custom field names for extraction"),
    db: AsyncSession = Depends(get_db),
):
    """Upload a document for extraction."""
    # Read file
    file_bytes = await file.read()

    # Upload to MinIO
    minio_path = minio_service.upload_file(
        file_bytes,
        file.filename,
        file.content_type or "application/octet-stream",
    )

    # Create document record
    document = Document(
        filename=minio_path,
        original_filename=file.filename,
        content_type=file.content_type,
        file_size=len(file_bytes),
        minio_path=minio_path,
        source_type="upload",
    )
    db.add(document)
    await db.flush()

    # Parse custom fields
    fields_list = [f.strip() for f in custom_fields.split(",") if f.strip()] if custom_fields else None

    import logging
    logger = logging.getLogger(__name__)
    logger.info(f"Upload with schema_name={schema_name}, custom_fields={fields_list}")

    # Create extraction job
    job = ExtractionJob(
        document_id=document.id,
        schema_name=schema_name,
        status=JobStatus.PENDING,
    )
    db.add(job)
    await db.commit()

    # Queue extraction task
    process_document_extraction.delay(job.id, document.id, schema_name, fields_list)

    return DocumentUploadResponse(
        document_id=document.id,
        job_id=job.id,
        filename=file.filename,
        status=JobStatusEnum.PENDING,
        message="Document uploaded and queued for extraction",
    )


@router.post("/documents/fetch-url", response_model=DocumentUploadResponse)
async def fetch_from_url(
    request: FetchFromURLRequest,
    db: AsyncSession = Depends(get_db),
):
    """Fetch a document from a URL and process it."""
    async with httpx.AsyncClient() as client:
        response = await client.get(request.url, follow_redirects=True)
        response.raise_for_status()

    file_bytes = response.content
    content_type = response.headers.get("content-type", "application/octet-stream")
    filename = request.url.split("/")[-1] or "document"

    # Upload to MinIO
    minio_path = minio_service.upload_file(file_bytes, filename, content_type)

    # Create document record
    document = Document(
        filename=minio_path,
        original_filename=filename,
        content_type=content_type,
        file_size=len(file_bytes),
        minio_path=minio_path,
        source_type="api_endpoint",
        source_url=request.url,
    )
    db.add(document)
    await db.flush()

    # Create extraction job
    job = ExtractionJob(
        document_id=document.id,
        schema_name=request.schema_name,
        status=JobStatus.PENDING,
    )
    db.add(job)
    await db.commit()

    # Queue extraction task
    process_document_extraction.delay(job.id, document.id, request.schema_name)

    return DocumentUploadResponse(
        document_id=document.id,
        job_id=job.id,
        filename=filename,
        status=JobStatusEnum.PENDING,
        message="Document fetched and queued for extraction",
    )


# ============ Document & Job Status Endpoints ============

@router.get("/documents", response_model=list[DocumentResponse])
async def list_documents(
    limit: int = Query(default=20, le=100),
    offset: int = Query(default=0),
    db: AsyncSession = Depends(get_db),
):
    """List all documents."""
    result = await db.execute(
        select(Document)
        .order_by(Document.created_at.desc())
        .limit(limit)
        .offset(offset)
    )
    return result.scalars().all()


@router.get("/documents/{document_id}", response_model=DocumentResponse)
async def get_document(document_id: str, db: AsyncSession = Depends(get_db)):
    """Get a specific document."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")
    return document


@router.get("/jobs/{job_id}", response_model=JobResponse)
async def get_job_status(job_id: str, db: AsyncSession = Depends(get_db)):
    """Get extraction job status."""
    result = await db.execute(
        select(ExtractionJob).where(ExtractionJob.id == job_id)
    )
    job = result.scalar_one_or_none()
    if not job:
        raise HTTPException(status_code=404, detail="Job not found")
    return job


@router.get("/documents/{document_id}/extracted", response_model=list[ExtractedDataResponse])
async def get_extracted_data(document_id: str, db: AsyncSession = Depends(get_db)):
    """Get extracted data for a document."""
    result = await db.execute(
        select(ExtractedData).where(ExtractedData.document_id == document_id)
    )
    return result.scalars().all()


@router.get("/documents/{document_id}/file")
async def get_document_file(document_id: str, db: AsyncSession = Depends(get_db)):
    """Stream the document file directly."""
    result = await db.execute(
        select(Document).where(Document.id == document_id)
    )
    document = result.scalar_one_or_none()
    if not document:
        raise HTTPException(status_code=404, detail="Document not found")

    # Stream file directly from MinIO
    file_data = minio_service.download_file(document.minio_path)

    from io import BytesIO
    return StreamingResponse(
        BytesIO(file_data),
        media_type=document.content_type or "application/octet-stream",
        headers={
            "Content-Disposition": f'inline; filename="{document.original_filename}"',
            "Content-Length": str(len(file_data)),
        }
    )


# ============ Search Endpoint ============

@router.post("/search", response_model=SearchResponse)
async def search_documents(
    request: SearchRequest,
    db: AsyncSession = Depends(get_db),
):
    """Search extracted data using full-text and semantic search."""
    # Simple JSONB search - can be enhanced with full-text search
    query = request.query.lower()

    result = await db.execute(
        select(ExtractedData, Document)
        .join(Document, ExtractedData.document_id == Document.id)
        .limit(request.limit)
        .offset(request.offset)
    )
    rows = result.all()

    # Filter results that match the query in the JSON data
    results = []
    for extracted, document in rows:
        data_str = str(extracted.data).lower()
        if query in data_str:
            results.append(SearchResultItem(
                document_id=extracted.document_id,
                filename=document.original_filename,
                schema_name=extracted.schema_name,
                data=extracted.data,
            ))

    # Get total count
    count_result = await db.execute(select(func.count(ExtractedData.id)))
    total = count_result.scalar()

    return SearchResponse(
        results=results,
        total=total,
        query=request.query,
    )


@router.get("/search/semantic")
async def semantic_search(
    query: str = Query(..., description="Search query"),
    limit: int = Query(default=5, le=20),
    db: AsyncSession = Depends(get_db),
):
    """Semantic search using vector similarity."""
    results = await chat_service.search_similar_chunks(db, query, limit)
    return {"results": results, "query": query}


# ============ Chat/Insights Endpoint ============

@router.post("/chat", response_model=ChatResponse)
async def chat_insights(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Chat with the document database for insights."""
    response = await chat_service.chat(db, request.query, request.chat_history)
    return ChatResponse(response=response)


@router.post("/chat/stream")
async def chat_insights_stream(
    request: ChatRequest,
    db: AsyncSession = Depends(get_db),
):
    """Stream chat responses for better UX."""
    async def generate():
        async for chunk in chat_service.chat_stream(db, request.query, request.chat_history):
            yield chunk

    return StreamingResponse(generate(), media_type="text/plain")


# ============ Schema Info Endpoint ============

@router.get("/schemas", response_model=list[SchemaInfo])
async def list_schemas():
    """List available extraction schemas."""
    schemas = []
    for name, schema_class in SCHEMAS.items():
        fields = list(schema_class.model_fields.keys())
        schemas.append(SchemaInfo(
            name=name,
            description=schema_class.__doc__ or f"{name} extraction schema",
            fields=fields,
        ))
    return schemas
