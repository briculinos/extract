from app.workers.celery_app import celery_app
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from datetime import datetime
import logging
import re

from app.core.config import get_settings
from app.models.document import Document, ExtractionJob, ExtractedData, DocumentChunk, JobStatus
from app.services.minio_service import MinioService
from app.services.extraction_service import ExtractionService, SCHEMAS
from app.services.embedding_service import EmbeddingService

logger = logging.getLogger(__name__)
settings = get_settings()


def parse_price(price_str: str | None) -> float | None:
    """Parse a price string to float, handling various formats."""
    if not price_str:
        return None
    try:
        # Remove currency symbols and whitespace
        cleaned = re.sub(r'[^\d,.\-]', '', str(price_str))
        # Handle European format (1.234,56) vs US format (1,234.56)
        if ',' in cleaned and '.' in cleaned:
            if cleaned.rfind(',') > cleaned.rfind('.'):
                # European: 1.234,56
                cleaned = cleaned.replace('.', '').replace(',', '.')
            else:
                # US: 1,234.56
                cleaned = cleaned.replace(',', '')
        elif ',' in cleaned:
            # Could be European decimal (123,45) or US thousands (1,234)
            parts = cleaned.split(',')
            if len(parts) == 2 and len(parts[1]) == 2:
                # Likely European decimal
                cleaned = cleaned.replace(',', '.')
            else:
                cleaned = cleaned.replace(',', '')
        return float(cleaned) if cleaned else None
    except (ValueError, AttributeError):
        return None


def post_process_extraction(data: dict) -> dict:
    """Post-process extracted data to fill in missing calculated fields."""
    if not data:
        return data

    # Calculate total from line items if missing
    line_items = data.get('line_items', [])
    if line_items and isinstance(line_items, list):
        # Calculate subtotal from line items if missing
        if not data.get('total') or data.get('total') in [None, '', '-']:
            total = 0.0
            currency = data.get('currency', '')
            for item in line_items:
                if isinstance(item, dict):
                    price = parse_price(item.get('total_price'))
                    if price:
                        total += price
            if total > 0:
                # Format with 2 decimal places
                data['total'] = f"{total:.2f}"
                logger.info(f"Calculated total from line items: {data['total']} {currency}")

        # Also calculate subtotal if missing (same as total for now, could subtract VAT later)
        if not data.get('subtotal') or data.get('subtotal') in [None, '', '-']:
            if data.get('total'):
                data['subtotal'] = data['total']

    return data

# Sync engine for Celery workers
sync_database_url = settings.database_url.replace("+asyncpg", "")
sync_engine = create_engine(sync_database_url)
SyncSession = sessionmaker(bind=sync_engine)


@celery_app.task(bind=True, max_retries=3, default_retry_delay=60)
def process_document_extraction(self, job_id: str, document_id: str, schema_name: str = "generic", custom_fields: list[str] | None = None):
    """
    Celery task to process document extraction.

    Flow:
    1. Update job status to PROCESSING
    2. Download document from MinIO
    3. Run LlamaExtract
    4. Store extracted data in PostgreSQL
    5. Create embeddings and store in pgvector
    6. Update job status to COMPLETED
    """
    session = SyncSession()
    minio = MinioService()
    extractor = ExtractionService()
    embedder = EmbeddingService()

    try:
        # Update job status
        job = session.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
        if not job:
            raise ValueError(f"Job {job_id} not found")

        job.status = JobStatus.PROCESSING
        job.started_at = datetime.utcnow()
        session.commit()

        # Get document
        document = session.query(Document).filter(Document.id == document_id).first()
        if not document:
            raise ValueError(f"Document {document_id} not found")

        logger.info(f"Processing document: {document.original_filename}")

        # Download from MinIO
        file_bytes = minio.download_file(document.minio_path)

        # Extract structured data using LlamaExtract
        import asyncio
        loop = asyncio.new_event_loop()
        asyncio.set_event_loop(loop)

        try:
            extraction_result = loop.run_until_complete(
                extractor.extract_from_bytes(
                    file_bytes,
                    document.original_filename,
                    schema_name,
                    custom_fields
                )
            )
        finally:
            loop.close()

        # Post-process: fill in missing calculated fields (e.g., total from line items)
        extraction_result["data"] = post_process_extraction(extraction_result["data"])

        # Store extracted data
        extracted = ExtractedData(
            document_id=document_id,
            schema_name=schema_name,
            data=extraction_result["data"],
            confidence_scores=extraction_result.get("confidence_scores"),
            citations=extraction_result.get("citations"),
        )
        session.add(extracted)

        # Create embeddings for the extracted data
        import json
        text_to_embed = json.dumps(extraction_result["data"], default=str)
        chunks = embedder.chunk_text(text_to_embed)

        for idx, chunk_text in enumerate(chunks):
            embedding = embedder.create_embedding(chunk_text)
            chunk = DocumentChunk(
                document_id=document_id,
                chunk_index=idx,
                content=chunk_text,
                embedding=embedding,
                chunk_metadata={"schema": schema_name, "source": document.original_filename},
            )
            session.add(chunk)

        # Update job status
        job.status = JobStatus.COMPLETED
        job.completed_at = datetime.utcnow()
        session.commit()

        logger.info(f"Successfully processed document: {document.original_filename}")
        return {"status": "success", "document_id": document_id, "job_id": job_id}

    except Exception as e:
        logger.error(f"Error processing document: {e}")
        session.rollback()

        # Update job with error
        job = session.query(ExtractionJob).filter(ExtractionJob.id == job_id).first()
        if job:
            job.status = JobStatus.FAILED
            job.error_message = str(e)
            job.completed_at = datetime.utcnow()
            session.commit()

        # Retry on transient errors
        raise self.retry(exc=e)

    finally:
        session.close()


@celery_app.task
def process_batch_extraction(job_ids: list[str], document_ids: list[str], schema_name: str = "generic"):
    """Process multiple documents in batch."""
    results = []
    for job_id, doc_id in zip(job_ids, document_ids):
        result = process_document_extraction.delay(job_id, doc_id, schema_name)
        results.append(result.id)
    return results
