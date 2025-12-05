from openai import OpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from typing import AsyncGenerator
import json
import logging
import time

from app.core.config import get_settings
from app.models.document import ExtractedData, Document

settings = get_settings()
logger = logging.getLogger(__name__)

# Force logging to show
logging.basicConfig(level=logging.INFO)
logger.setLevel(logging.INFO)


class ChatService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model

    async def get_extracted_data_context(
        self,
        db: AsyncSession,
        limit: int = 50
    ) -> str:
        """Get all extracted structured data from documents - fast direct query."""
        start = time.time()
        logger.info(f"[CHAT] Starting DB query for extracted data...")

        result = await db.execute(
            select(ExtractedData, Document)
            .join(Document, ExtractedData.document_id == Document.id)
            .order_by(ExtractedData.created_at.desc())
            .limit(limit)
        )
        rows = result.all()

        db_time = time.time() - start
        logger.info(f"[CHAT] DB query completed in {db_time:.3f}s - Found {len(rows)} rows")

        if not rows:
            logger.info("[CHAT] No extracted data found")
            return "No extracted data found in the database."

        context_parts = []
        for extracted, document in rows:
            # Format extracted data as readable text
            data_str = json.dumps(extracted.data, indent=2, default=str)
            context_parts.append(
                f"[Document: {document.original_filename}]\n{data_str}"
            )

        context = "\n\n---\n\n".join(context_parts)
        logger.info(f"[CHAT] Context built: {len(context)} chars")
        return context

    async def chat(
        self,
        db: AsyncSession,
        query: str,
        chat_history: list[dict] = None
    ) -> str:
        """Chat with insights based on extracted document data."""
        context = await self.get_extracted_data_context(db)

        system_prompt = """You are a fast assistant that answers questions about extracted document data.
You have access to structured data extracted from invoices and other documents.
Answer questions directly and concisely based on the provided data.
If asked about specific documents, reference them by filename.
Keep responses brief unless asked for detail."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Extracted data from documents:\n{context}\n\nQuestion: {query}"}
        ]

        if chat_history:
            messages = [messages[0]] + chat_history + [messages[-1]]

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.3,
            max_tokens=16384,
        )

        return response.choices[0].message.content

    async def chat_stream(
        self,
        db: AsyncSession,
        query: str,
        chat_history: list[dict] = None
    ) -> AsyncGenerator[str, None]:
        """Stream chat responses for better UX."""
        total_start = time.time()
        logger.info(f"[CHAT] ========== CHAT STREAM START ==========")
        logger.info(f"[CHAT] Query: {query[:100]}...")
        logger.info(f"[CHAT] Model: {self.model}")

        context = await self.get_extracted_data_context(db)

        system_prompt = """You are a fast assistant that answers questions about extracted document data.
You have access to structured data extracted from invoices and other documents.
Answer questions directly and concisely based on the provided data.
If asked about specific documents, reference them by filename.
Keep responses brief unless asked for detail."""

        messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": f"Extracted data from documents:\n{context}\n\nQuestion: {query}"}
        ]

        if chat_history:
            messages = [messages[0]] + chat_history + [messages[-1]]

        logger.info(f"[CHAT] Calling OpenAI API...")
        api_start = time.time()

        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.3,
                max_tokens=16384,
                stream=True,
            )

            first_chunk = True
            chunk_count = 0
            for chunk in stream:
                if first_chunk:
                    first_token_time = time.time() - api_start
                    logger.info(f"[CHAT] First token received in {first_token_time:.3f}s")
                    first_chunk = False

                if chunk.choices[0].delta.content:
                    chunk_count += 1
                    yield chunk.choices[0].delta.content

            total_time = time.time() - total_start
            logger.info(f"[CHAT] Stream complete: {chunk_count} chunks in {total_time:.3f}s total")
            logger.info(f"[CHAT] ========== CHAT STREAM END ==========")

        except Exception as e:
            logger.error(f"[CHAT] OpenAI API error: {e}")
            raise


chat_service = ChatService()
