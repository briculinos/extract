from pydantic import BaseModel, Field
from typing import Optional
from datetime import datetime
from enum import Enum


class JobStatusEnum(str, Enum):
    PENDING = "pending"
    PROCESSING = "processing"
    COMPLETED = "completed"
    FAILED = "failed"


# Request schemas
class DocumentUploadResponse(BaseModel):
    document_id: str
    job_id: str
    filename: str
    status: JobStatusEnum
    message: str


class FetchFromURLRequest(BaseModel):
    url: str
    schema_name: str = "generic"


class SearchRequest(BaseModel):
    query: str
    limit: int = Field(default=20, le=100)
    offset: int = Field(default=0)


class ChatRequest(BaseModel):
    query: str
    chat_history: Optional[list[dict]] = None
    document_ids: Optional[list[str]] = None  # Filter to only these documents


# Response schemas
class DocumentResponse(BaseModel):
    id: str
    filename: str
    original_filename: str
    content_type: Optional[str]
    file_size: Optional[int]
    source_type: str
    source_url: Optional[str]
    created_at: datetime

    class Config:
        from_attributes = True


class JobResponse(BaseModel):
    id: str
    document_id: str
    status: JobStatusEnum
    schema_name: Optional[str]
    error_message: Optional[str]
    started_at: Optional[datetime]
    completed_at: Optional[datetime]
    created_at: datetime

    class Config:
        from_attributes = True


class ExtractedDataResponse(BaseModel):
    id: str
    document_id: str
    schema_name: str
    data: dict
    confidence_scores: Optional[dict]
    citations: Optional[dict]
    created_at: datetime

    class Config:
        from_attributes = True


class SearchResultItem(BaseModel):
    document_id: str
    filename: str
    schema_name: str
    data: dict
    relevance_score: Optional[float] = None


class SearchResponse(BaseModel):
    results: list[SearchResultItem]
    total: int
    query: str


class ChatResponse(BaseModel):
    response: str
    sources: list[str] = []


class SchemaInfo(BaseModel):
    name: str
    description: str
    fields: list[str]
