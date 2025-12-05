from openai import OpenAI
from typing import Optional
import json

from app.core.config import get_settings

settings = get_settings()


class EmbeddingService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_embedding_model

    def create_embedding(self, text: str) -> list[float]:
        """Create embedding for a single text."""
        response = self.client.embeddings.create(
            model=self.model,
            input=text,
        )
        return response.data[0].embedding

    def create_embeddings(self, texts: list[str]) -> list[list[float]]:
        """Create embeddings for multiple texts."""
        response = self.client.embeddings.create(
            model=self.model,
            input=texts,
        )
        return [item.embedding for item in response.data]

    def chunk_text(self, text: str, chunk_size: int = 1000, overlap: int = 200) -> list[str]:
        """Split text into overlapping chunks."""
        if len(text) <= chunk_size:
            return [text]

        chunks = []
        start = 0
        while start < len(text):
            end = start + chunk_size
            chunk = text[start:end]
            chunks.append(chunk)
            start = end - overlap

        return chunks

    def prepare_document_for_embedding(self, extracted_data: dict, document_text: str = "") -> list[str]:
        """Prepare document content for embedding - both structured data and raw text."""
        chunks = []

        # Create a text representation of the extracted structured data
        if extracted_data:
            structured_text = json.dumps(extracted_data, indent=2, default=str)
            structured_chunks = self.chunk_text(f"Extracted Data:\n{structured_text}")
            chunks.extend(structured_chunks)

        # Also chunk the raw document text if provided
        if document_text:
            text_chunks = self.chunk_text(document_text)
            chunks.extend(text_chunks)

        return chunks


embedding_service = EmbeddingService()
