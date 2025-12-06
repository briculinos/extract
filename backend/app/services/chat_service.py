from openai import OpenAI
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, text
from sqlalchemy.orm import selectinload
from typing import AsyncGenerator
import json
import logging
import time

from app.core.config import get_settings
from app.models.document import ExtractedData, Document, DocumentChunk
from app.services.embedding_service import EmbeddingService

settings = get_settings()
logger = logging.getLogger(__name__)

# Force logging to show
logging.basicConfig(level=logging.INFO)
logger.setLevel(logging.INFO)


# Improved system prompt for accuracy
SYSTEM_PROMPT = """You are a precise assistant for document/invoice data queries.

RULES:
1. ONLY use data provided in the context - never guess or make up information
2. Match product names carefully - search for the closest match to what the user asked
3. If no matching data found, say "I couldn't find any [X] in the extracted documents"
4. Always cite the source document filename when providing information
5. For prices and amounts, always include the currency
6. If there are multiple matches, list all of them

When answering about products or line items:
- Look for matches in product_name and description fields
- Be precise - don't confuse different products
- If the exact product isn't found, say so clearly

Format your responses clearly and concisely."""


class ChatService:
    def __init__(self):
        self.client = OpenAI(api_key=settings.openai_api_key)
        self.model = settings.openai_model
        self.embedding_service = EmbeddingService()

    async def analyze_query(self, query: str) -> dict:
        """Use LLM to extract search intent from user question."""
        logger.info(f"[CHAT] Analyzing query: {query}")

        analysis_prompt = """Analyze this question about invoice/document data and extract search parameters.

Return a JSON object with these fields:
- search_terms: list of product names, company names, or specific items to search for
- search_fields: list of fields to search in (product_name, description, seller, buyer, invoice_number, total, etc.)
- query_type: one of "product_lookup", "aggregation", "comparison", "list_all", "general"
- needs_line_items: boolean - true if searching for specific products/items within invoices

Examples:
- "how much was the display" → {"search_terms": ["display"], "search_fields": ["product_name", "description"], "query_type": "product_lookup", "needs_line_items": true}
- "total spent on all invoices" → {"search_terms": [], "search_fields": ["total"], "query_type": "aggregation", "needs_line_items": false}
- "list all invoices from Amazon" → {"search_terms": ["Amazon"], "search_fields": ["seller"], "query_type": "list_all", "needs_line_items": false}

Return ONLY valid JSON, no other text."""

        try:
            response = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": "You extract search parameters from user questions. Return only valid JSON."},
                    {"role": "user", "content": f"{analysis_prompt}\n\nQuestion: {query}"}
                ],
                temperature=0,
                max_tokens=500,
            )

            result_text = response.choices[0].message.content.strip()
            # Clean up potential markdown code blocks
            if result_text.startswith("```"):
                result_text = result_text.split("```")[1]
                if result_text.startswith("json"):
                    result_text = result_text[4:]
            result_text = result_text.strip()

            analysis = json.loads(result_text)
            analysis["original_query"] = query
            logger.info(f"[CHAT] Query analysis: {analysis}")
            return analysis

        except Exception as e:
            logger.error(f"[CHAT] Query analysis failed: {e}")
            # Fallback to general search
            return {
                "search_terms": query.split()[:5],  # Use first 5 words as search terms
                "search_fields": ["product_name", "description", "seller"],
                "query_type": "general",
                "needs_line_items": True,
                "original_query": query
            }

    async def search_line_items(
        self,
        db: AsyncSession,
        search_terms: list[str],
        limit: int = 100,
        document_ids: list[str] = None
    ) -> list[dict]:
        """Search within line_items JSON array using PostgreSQL JSONB."""
        if not search_terms:
            return []

        logger.info(f"[CHAT] Searching line items for: {search_terms} (filtered to {len(document_ids) if document_ids else 'all'} docs)")
        start = time.time()

        # Build OR conditions for each search term
        like_conditions = []
        for term in search_terms:
            term_lower = term.lower().replace("'", "''")  # Escape single quotes
            like_conditions.append(f"LOWER(li.value->>'product_name') LIKE '%{term_lower}%'")
            like_conditions.append(f"LOWER(li.value->>'description') LIKE '%{term_lower}%'")
            like_conditions.append(f"LOWER(li.value->>'sku') LIKE '%{term_lower}%'")

        where_clause = " OR ".join(like_conditions)

        # Add document_ids filter if provided
        doc_filter = ""
        if document_ids:
            doc_ids_str = ",".join(f"'{doc_id}'" for doc_id in document_ids)
            doc_filter = f"AND ed.document_id IN ({doc_ids_str})"

        # Use raw SQL for JSONB array search with LATERAL join
        # Note: data column is JSON (not JSONB), so cast it
        query = text(f"""
            SELECT
                ed.id as extracted_id,
                ed.document_id,
                ed.schema_name,
                d.original_filename,
                li.value as line_item,
                ed.data as full_data
            FROM extracted_data ed
            JOIN documents d ON ed.document_id = d.id
            CROSS JOIN LATERAL jsonb_array_elements(
                CASE
                    WHEN (ed.data::jsonb)->'line_items' IS NOT NULL
                         AND jsonb_typeof((ed.data::jsonb)->'line_items') = 'array'
                    THEN (ed.data::jsonb)->'line_items'
                    ELSE '[]'::jsonb
                END
            ) AS li(value)
            WHERE ({where_clause}) {doc_filter}
            LIMIT {limit}
        """)

        try:
            result = await db.execute(query)
            rows = result.fetchall()

            elapsed = time.time() - start
            logger.info(f"[CHAT] Line item search found {len(rows)} results in {elapsed:.3f}s")

            results = []
            for row in rows:
                results.append({
                    "extracted_id": row.extracted_id,
                    "document_id": row.document_id,
                    "filename": row.original_filename,
                    "schema_name": row.schema_name,
                    "line_item": row.line_item,
                    "invoice_data": {
                        "seller": row.full_data.get("seller"),
                        "buyer": row.full_data.get("buyer"),
                        "invoice_number": row.full_data.get("invoice_number"),
                        "invoice_date": row.full_data.get("invoice_date"),
                        "total": row.full_data.get("total"),
                        "currency": row.full_data.get("currency"),
                    }
                })
            return results

        except Exception as e:
            logger.error(f"[CHAT] Line item search error: {e}")
            return []

    async def search_documents(
        self,
        db: AsyncSession,
        search_terms: list[str],
        search_fields: list[str],
        limit: int = 50,
        document_ids: list[str] = None
    ) -> list[dict]:
        """Search document-level fields (seller, buyer, etc.)."""
        if not search_terms:
            # Return recent documents if no search terms
            return await self.get_recent_documents(db, limit=limit, document_ids=document_ids)

        logger.info(f"[CHAT] Searching documents for: {search_terms} in fields: {search_fields} (filtered to {len(document_ids) if document_ids else 'all'} docs)")
        start = time.time()

        # Build dynamic JSONB search conditions
        conditions = []
        for field in search_fields:
            for term in search_terms:
                conditions.append(f"LOWER(ed.data->>'{field}') LIKE '%{term.lower()}%'")

        where_clause = " OR ".join(conditions) if conditions else "1=1"

        # Add document_ids filter if provided
        doc_filter = ""
        if document_ids:
            doc_ids_str = ",".join(f"'{doc_id}'" for doc_id in document_ids)
            doc_filter = f"AND ed.document_id IN ({doc_ids_str})"

        query = text(f"""
            SELECT
                ed.id as extracted_id,
                ed.document_id,
                ed.schema_name,
                ed.data,
                d.original_filename
            FROM extracted_data ed
            JOIN documents d ON ed.document_id = d.id
            WHERE ({where_clause}) {doc_filter}
            ORDER BY ed.created_at DESC
            LIMIT :limit
        """)

        try:
            result = await db.execute(query, {"limit": limit})
            rows = result.fetchall()

            elapsed = time.time() - start
            logger.info(f"[CHAT] Document search found {len(rows)} results in {elapsed:.3f}s")

            return [
                {
                    "extracted_id": row.extracted_id,
                    "document_id": row.document_id,
                    "filename": row.original_filename,
                    "schema_name": row.schema_name,
                    "data": row.data
                }
                for row in rows
            ]

        except Exception as e:
            logger.error(f"[CHAT] Document search error: {e}")
            return []

    async def search_similar_chunks(
        self,
        db: AsyncSession,
        query: str,
        limit: int = 10,
        document_ids: list[str] = None
    ) -> list[dict]:
        """Use pgvector for semantic similarity search."""
        logger.info(f"[CHAT] Semantic search for: {query[:50]}... (filtered to {len(document_ids) if document_ids else 'all'} docs)")
        start = time.time()

        try:
            # Create embedding for query
            query_embedding = self.embedding_service.create_embedding(query)

            # Convert embedding list to PostgreSQL array format
            embedding_str = "[" + ",".join(str(x) for x in query_embedding) + "]"

            # Add document_ids filter if provided
            doc_filter = ""
            if document_ids:
                doc_ids_str = ",".join(f"'{doc_id}'" for doc_id in document_ids)
                doc_filter = f"WHERE dc.document_id IN ({doc_ids_str})"

            # pgvector cosine similarity search
            vector_query = text(f"""
                SELECT
                    dc.id,
                    dc.document_id,
                    dc.content,
                    dc.chunk_metadata,
                    d.original_filename,
                    1 - (dc.embedding <=> '{embedding_str}'::vector) as similarity
                FROM document_chunks dc
                JOIN documents d ON dc.document_id = d.id
                {doc_filter}
                ORDER BY dc.embedding <=> '{embedding_str}'::vector
                LIMIT {limit}
            """)

            result = await db.execute(vector_query)
            rows = result.fetchall()

            elapsed = time.time() - start
            logger.info(f"[CHAT] Semantic search found {len(rows)} results in {elapsed:.3f}s")

            return [
                {
                    "document_id": row.document_id,
                    "filename": row.original_filename,
                    "content": row.content,
                    "metadata": row.chunk_metadata,
                    "similarity": float(row.similarity) if row.similarity else 0.0
                }
                for row in rows
            ]

        except Exception as e:
            logger.error(f"[CHAT] Semantic search error: {e}")
            return []

    async def get_recent_documents(
        self,
        db: AsyncSession,
        limit: int = 20,
        document_ids: list[str] = None
    ) -> list[dict]:
        """Get recent extracted documents for general queries."""
        logger.info(f"[CHAT] Getting {limit} recent documents (filtered to {len(document_ids) if document_ids else 'all'} docs)")

        query = select(ExtractedData, Document).join(Document, ExtractedData.document_id == Document.id)

        # Filter by document_ids if provided
        if document_ids:
            query = query.where(ExtractedData.document_id.in_(document_ids))

        query = query.order_by(ExtractedData.created_at.desc()).limit(limit)

        result = await db.execute(query)
        rows = result.all()

        return [
            {
                "extracted_id": extracted.id,
                "document_id": extracted.document_id,
                "filename": document.original_filename,
                "schema_name": extracted.schema_name,
                "data": extracted.data
            }
            for extracted, document in rows
        ]

    async def smart_search(
        self,
        db: AsyncSession,
        analysis: dict,
        document_ids: list[str] = None
    ) -> dict:
        """Route to appropriate search based on query analysis."""
        query_type = analysis.get("query_type", "general")
        search_terms = analysis.get("search_terms", [])
        search_fields = analysis.get("search_fields", [])
        needs_line_items = analysis.get("needs_line_items", False)
        original_query = analysis.get("original_query", "")

        logger.info(f"[CHAT] Smart search - type: {query_type}, needs_line_items: {needs_line_items}, doc_filter: {len(document_ids) if document_ids else 'none'}")

        results = {
            "line_items": [],
            "documents": [],
            "semantic": [],
            "query_type": query_type
        }

        # Product lookups need line-item level search
        if needs_line_items and search_terms:
            results["line_items"] = await self.search_line_items(db, search_terms, document_ids=document_ids)

        # Also search document-level fields if specified
        if search_fields and search_terms:
            doc_fields = [f for f in search_fields if f not in ["product_name", "description", "sku"]]
            if doc_fields:
                results["documents"] = await self.search_documents(db, search_terms, doc_fields, document_ids=document_ids)

        # For general queries or if no structured results, use semantic search
        if query_type == "general" or (not results["line_items"] and not results["documents"]):
            results["semantic"] = await self.search_similar_chunks(db, original_query, document_ids=document_ids)

        # Fallback: get recent documents if nothing found
        if not results["line_items"] and not results["documents"] and not results["semantic"]:
            results["documents"] = await self.get_recent_documents(db, limit=10, document_ids=document_ids)

        return results

    def _format_search_results(self, results: dict) -> str:
        """Format search results for the LLM context."""
        context_parts = []

        # Format line item results
        if results["line_items"]:
            context_parts.append("=== MATCHING LINE ITEMS ===")
            for item in results["line_items"]:
                li = item["line_item"]
                inv = item["invoice_data"]
                context_parts.append(f"""
[Document: {item['filename']}]
Invoice: {inv.get('invoice_number', 'N/A')} | Date: {inv.get('invoice_date', 'N/A')}
Seller: {inv.get('seller', 'N/A')} | Buyer: {inv.get('buyer', 'N/A')}
Product: {li.get('product_name', 'N/A')}
Description: {li.get('description', 'N/A')}
Quantity: {li.get('quantity', 'N/A')} | Unit Price: {li.get('unit_price', 'N/A')}
Total Price: {li.get('total_price', 'N/A')} | VAT: {li.get('vat_amount', 'N/A')}
SKU: {li.get('sku', 'N/A')}""")

        # Format document results
        if results["documents"]:
            context_parts.append("\n=== MATCHING DOCUMENTS ===")
            for doc in results["documents"]:
                data_str = json.dumps(doc["data"], indent=2, default=str, ensure_ascii=False)
                context_parts.append(f"\n[Document: {doc['filename']}]\n{data_str}")

        # Format semantic results
        if results["semantic"] and not results["line_items"] and not results["documents"]:
            context_parts.append("\n=== RELEVANT CONTENT (Semantic Search) ===")
            for chunk in results["semantic"]:
                context_parts.append(f"\n[Document: {chunk['filename']} - Relevance: {chunk['similarity']:.2f}]\n{chunk['content'][:500]}...")

        return "\n".join(context_parts) if context_parts else "No relevant data found."

    async def chat(
        self,
        db: AsyncSession,
        query: str,
        chat_history: list[dict] = None,
        document_ids: list[str] = None
    ) -> str:
        """Smart chat with intelligent search."""
        # Step 1: Analyze query
        analysis = await self.analyze_query(query)

        # Step 2: Smart search (filtered to specific documents if provided)
        search_results = await self.smart_search(db, analysis, document_ids=document_ids)

        # Step 3: Format context
        context = self._format_search_results(search_results)

        # Step 4: Generate response
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        if chat_history:
            messages.extend(chat_history)

        messages.append({
            "role": "user",
            "content": f"Relevant data from search:\n{context}\n\nQuestion: {query}"
        })

        response = self.client.chat.completions.create(
            model=self.model,
            messages=messages,
            temperature=0.1,
            max_tokens=16384,
        )

        return response.choices[0].message.content

    async def chat_stream(
        self,
        db: AsyncSession,
        query: str,
        chat_history: list[dict] = None,
        document_ids: list[str] = None
    ) -> AsyncGenerator[str, None]:
        """Stream smart chat responses for better UX."""
        total_start = time.time()
        logger.info(f"[CHAT] ========== SMART CHAT STREAM START ==========")
        logger.info(f"[CHAT] Query: {query}")
        logger.info(f"[CHAT] Model: {self.model}")
        logger.info(f"[CHAT] Document filter: {len(document_ids) if document_ids else 'none (searching all)'}")

        # Step 1: Analyze query
        analysis = await self.analyze_query(query)

        # Step 2: Smart search (filtered to specific documents if provided)
        search_results = await self.smart_search(db, analysis, document_ids=document_ids)

        # Step 3: Format context
        context = self._format_search_results(search_results)
        logger.info(f"[CHAT] Context length: {len(context)} chars")
        logger.info(f"[CHAT] Results: {len(search_results.get('line_items', []))} line items, {len(search_results.get('documents', []))} docs")

        # Step 4: Build messages
        messages = [
            {"role": "system", "content": SYSTEM_PROMPT},
        ]

        if chat_history:
            messages.extend(chat_history)

        messages.append({
            "role": "user",
            "content": f"Relevant data from search:\n{context}\n\nQuestion: {query}"
        })

        logger.info(f"[CHAT] Calling OpenAI API...")
        api_start = time.time()

        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=messages,
                temperature=0.1,
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
            logger.info(f"[CHAT] ========== SMART CHAT STREAM END ==========")

        except Exception as e:
            logger.error(f"[CHAT] OpenAI API error: {e}")
            raise


chat_service = ChatService()
