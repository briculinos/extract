"""
Multi-provider extraction service.

Provider priority (auto mode):
1. LlamaExtract API - if LLAMA_CLOUD_API_KEY is set
2. NuExtract API (NuMind platform) - fallback if NUMIND_API_KEY is set
3. NuExtract Local (Hugging Face model) - if nuextract_use_local is True

LlamaExtract is preferred because:
- Well-documented API with reliable responses
- Good integration with LlamaCloud ecosystem
- Robust error handling
"""

from pydantic import BaseModel, Field
from typing import Optional, Any
from abc import ABC, abstractmethod
import json
import logging
import tempfile
import os

from app.core.config import get_settings

settings = get_settings()
logger = logging.getLogger(__name__)


# ============ Extraction Schemas ============

class ProductPassport(BaseModel):
    """Digital Product Passport schema for EU DPP compliance."""
    product_name: Optional[str] = Field(None, description="Name of the product")
    manufacturer: Optional[str] = Field(None, description="Manufacturer or brand name")
    model_number: Optional[str] = Field(None, description="Model or part number")
    serial_number: Optional[str] = Field(None, description="Serial number if available")
    manufacturing_date: Optional[str] = Field(None, description="Date of manufacture")
    manufacturing_location: Optional[str] = Field(None, description="Location/country of manufacture")

    # Materials & Composition
    materials: Optional[list[str]] = Field(None, description="List of materials used")
    weight: Optional[str] = Field(None, description="Product weight with unit")
    dimensions: Optional[str] = Field(None, description="Product dimensions")

    # Environmental Data
    co2_footprint: Optional[str] = Field(None, description="Carbon footprint / CO2 emissions")
    energy_rating: Optional[str] = Field(None, description="Energy efficiency rating")
    recyclability: Optional[str] = Field(None, description="Recyclability information")
    hazardous_substances: Optional[list[str]] = Field(None, description="Hazardous substances if any")

    # Compliance & Certifications
    certifications: Optional[list[str]] = Field(None, description="Product certifications")
    compliance_standards: Optional[list[str]] = Field(None, description="Compliance standards met")

    # Lifecycle
    expected_lifespan: Optional[str] = Field(None, description="Expected product lifespan")
    warranty_period: Optional[str] = Field(None, description="Warranty period")
    repair_information: Optional[str] = Field(None, description="Repair and maintenance info")
    end_of_life_instructions: Optional[str] = Field(None, description="Disposal/recycling instructions")


class GenericDocument(BaseModel):
    """General-purpose document extraction schema."""
    title: Optional[str] = Field(None, description="Document title")
    document_type: Optional[str] = Field(None, description="Type of document")
    date: Optional[str] = Field(None, description="Document date")
    author: Optional[str] = Field(None, description="Author or organization")
    summary: Optional[str] = Field(None, description="Brief summary of contents")
    key_entities: Optional[list[str]] = Field(None, description="Key entities mentioned")
    key_values: Optional[dict] = Field(None, description="Key numerical values or metrics")
    categories: Optional[list[str]] = Field(None, description="Document categories/tags")


class LineItem(BaseModel):
    """Individual line item in an invoice."""
    product_name: Optional[str] = Field(None, description="Name or description of the product/service")
    quantity: Optional[str] = Field(None, description="Quantity of items")
    unit_price: Optional[str] = Field(None, description="Price per unit")
    total_price: Optional[str] = Field(None, description="Total price for this line item")
    vat_rate: Optional[str] = Field(None, description="VAT/tax rate percentage")
    vat_amount: Optional[str] = Field(None, description="VAT/tax amount for this line item")
    sku: Optional[str] = Field(None, description="Product SKU, article number, or code")
    description: Optional[str] = Field(None, description="Additional description or details")


class Invoice(BaseModel):
    """Invoice document extraction schema for extracting key invoice data with line items."""
    # Header / Document-level fields
    seller: Optional[str] = Field(None, description="Name of the seller, vendor, or company issuing the invoice")
    buyer: Optional[str] = Field(None, description="Name of the buyer, customer, or recipient")
    invoice_number: Optional[str] = Field(None, description="Invoice number, reference number, or document ID")
    invoice_date: Optional[str] = Field(None, description="Date the invoice was issued")
    due_date: Optional[str] = Field(None, description="Payment due date")

    # Line items - nested array of products/services
    line_items: Optional[list[LineItem]] = Field(None, description="List of individual products or services on the invoice")

    # Summary / Totals
    subtotal: Optional[str] = Field(None, description="Subtotal amount before taxes")
    total_vat: Optional[str] = Field(None, description="Total VAT/tax amount")
    total: Optional[str] = Field(None, description="Total amount including taxes")
    currency: Optional[str] = Field(None, description="Currency used (e.g., EUR, USD, SEK, GBP)")


SCHEMAS = {
    "product_passport": ProductPassport,
    "generic": GenericDocument,
    "invoice": Invoice,
}

# Cache for dynamically created custom schemas
_custom_schema_cache = {}


def create_custom_schema(fields: list[str]) -> type[BaseModel]:
    """Dynamically create a Pydantic schema from a list of field names."""
    # Create a unique key for caching
    cache_key = ",".join(sorted(fields))

    if cache_key in _custom_schema_cache:
        return _custom_schema_cache[cache_key]

    # Create field definitions for Pydantic's create_model
    field_definitions = {}
    for field in fields:
        # Convert field name to snake_case if needed
        field_name = field.strip().replace(" ", "_").lower()
        # Better descriptions for common invoice fields
        descriptions = {
            "seller": "Name of the seller, vendor, or company issuing the invoice",
            "product_name": "Name or description of the product or service",
            "price": "Price or amount for the item (including currency if shown)",
            "vat": "VAT/tax amount",
            "total": "Total amount",
            "invoice_number": "Invoice number or reference",
            "date": "Invoice date",
            "due_date": "Payment due date",
            "buyer": "Name of the buyer or customer",
            "quantity": "Quantity of items",
            "unit_price": "Price per unit",
            "discount": "Discount amount or percentage",
            "subtotal": "Subtotal before tax",
        }
        description = descriptions.get(field_name, f"The {field.replace('_', ' ')} value from the document")
        field_definitions[field_name] = (Optional[str], Field(default=None, description=description))

    # Use Pydantic's create_model for proper schema creation
    from pydantic import create_model
    CustomSchema = create_model(
        f"CustomSchema_{hash(cache_key) % 100000}",
        **field_definitions
    )

    _custom_schema_cache[cache_key] = CustomSchema
    logger.info(f"Created custom schema with fields: {list(field_definitions.keys())}")
    return CustomSchema


def get_schema_class(schema_name: str, custom_fields: list[str] | None = None) -> type[BaseModel]:
    """Get schema class - either predefined or dynamically created from custom fields."""
    if custom_fields and len(custom_fields) > 0:
        return create_custom_schema(custom_fields)
    return SCHEMAS.get(schema_name, GenericDocument)


def schema_to_template(schema_class: type[BaseModel]) -> dict:
    """Convert Pydantic schema to NuExtract template format.

    NuExtract expects type indicators in the template:
    - "string" or "verbatim-string" for text fields
    - "integer" for numbers
    - ["string"] for lists of strings
    - [{}] for lists of objects (nested models)
    - {} for dicts
    """
    template = {}
    for field_name, field_info in schema_class.model_fields.items():
        annotation = field_info.annotation
        # Handle Optional types
        origin = getattr(annotation, "__origin__", None)
        if origin is type(None) or str(annotation).startswith("typing.Optional"):
            # Get the inner type
            args = getattr(annotation, "__args__", ())
            if args:
                inner_type = args[0]
            else:
                inner_type = str
        else:
            inner_type = annotation

        # Map types to template values with NuExtract format
        if inner_type == list or (hasattr(inner_type, "__origin__") and inner_type.__origin__ == list):
            # Check if it's a list of BaseModel (nested objects)
            list_args = getattr(inner_type, "__args__", ())
            if list_args and len(list_args) > 0:
                list_item_type = list_args[0]
                # Check if the list item is a Pydantic model
                if hasattr(list_item_type, "model_fields"):
                    # Recursively convert nested model
                    template[field_name] = [schema_to_template(list_item_type)]
                else:
                    template[field_name] = ["verbatim-string"]
            else:
                template[field_name] = ["verbatim-string"]
        elif hasattr(inner_type, "model_fields"):
            # Single nested model (not a list)
            template[field_name] = schema_to_template(inner_type)
        elif inner_type == dict:
            template[field_name] = {}
        elif inner_type == int:
            template[field_name] = "integer"
        elif inner_type == float:
            template[field_name] = "number"
        elif inner_type == bool:
            template[field_name] = "boolean"
        else:
            template[field_name] = "verbatim-string"
    return template


# ============ Extraction Providers ============

class ExtractionProvider(ABC):
    """Base class for extraction providers."""

    @abstractmethod
    def extract(self, text: str, schema_name: str) -> dict:
        """Extract structured data from text."""
        pass

    @abstractmethod
    def is_available(self) -> bool:
        """Check if this provider is available."""
        pass


class NuExtractAPIProvider(ExtractionProvider):
    """NuMind platform API provider."""

    def __init__(self):
        self._client = None

    @property
    def client(self):
        if self._client is None:
            try:
                from numind import NuMind
                self._client = NuMind(api_key=settings.numind_api_key)
            except ImportError:
                logger.warning("numind package not installed")
                return None
            except Exception as e:
                logger.error(f"Failed to initialize NuMind client: {e}")
                return None
        return self._client

    def is_available(self) -> bool:
        return bool(settings.numind_api_key) and self.client is not None

    def extract(self, text: str, schema_name: str) -> dict:
        schema_class = SCHEMAS.get(schema_name, GenericDocument)
        template = schema_to_template(schema_class)

        logger.info(f"Extracting with NuExtract API using schema: {schema_name}")

        try:
            result = self.client.extract(
                input_text=text,
                template=template,
            )

            # Handle different response formats from NuMind SDK
            if isinstance(result, dict):
                data = result
            elif hasattr(result, 'model_dump'):
                data = result.model_dump()
            elif hasattr(result, 'result'):
                data = result.result
            else:
                data = {"raw": str(result)}

            return {
                "data": data,
                "confidence_scores": None,
                "citations": None,
                "provider": "nuextract_api",
            }

        except Exception as e:
            # Check if the exception message contains a successful result
            # NuMind SDK may throw an exception even for successful responses
            error_str = str(e)
            if '"status":"completed"' in error_str and '"outputData":' in error_str:
                try:
                    import re
                    # The error format is:
                    # {'event': 'result', 'data': '{"id":"...","outputData":"{\\"result\\":...}"}'}
                    # We need to extract the JSON from the 'data' field (single-quoted in Python repr)
                    # then parse outputData from that

                    # Extract the JSON string from 'data': '...'
                    data_match = re.search(r"'data':\s*'([^']+)'", error_str)
                    if data_match:
                        data_json_str = data_match.group(1)
                        # The string has escaped quotes like \" - parse as JSON
                        job_data = json.loads(data_json_str)

                        # outputData is also a JSON string inside job_data
                        output_data_str = job_data.get("outputData", "{}")
                        output_data = json.loads(output_data_str)
                        data = output_data.get("result", output_data)

                        logger.info(f"Successfully parsed NuMind result from error response")
                        return {
                            "data": data,
                            "confidence_scores": None,
                            "citations": None,
                            "provider": "nuextract_api",
                        }
                    else:
                        logger.warning(f"Could not find data pattern in error message")
                except Exception as parse_error:
                    logger.warning(f"Failed to parse NuMind result: {parse_error}")
            raise


class NuExtractLocalProvider(ExtractionProvider):
    """Local NuExtract model via Hugging Face transformers."""

    def __init__(self):
        self._model = None
        self._tokenizer = None

    def _load_model(self):
        if self._model is None:
            try:
                import torch
                from transformers import AutoModelForCausalLM, AutoTokenizer

                logger.info(f"Loading NuExtract model: {settings.nuextract_model}")

                self._tokenizer = AutoTokenizer.from_pretrained(
                    settings.nuextract_model,
                    trust_remote_code=True
                )
                self._model = AutoModelForCausalLM.from_pretrained(
                    settings.nuextract_model,
                    torch_dtype=torch.bfloat16,
                    trust_remote_code=True
                )

                device = settings.nuextract_device
                if device == "cuda" and not torch.cuda.is_available():
                    device = "cpu"
                    logger.warning("CUDA not available, falling back to CPU")

                self._model.to(device)
                self._model.eval()
                logger.info(f"NuExtract model loaded on {device}")

            except Exception as e:
                logger.error(f"Failed to load NuExtract model: {e}")
                raise

    def is_available(self) -> bool:
        if not settings.nuextract_use_local:
            return False
        try:
            import torch
            from transformers import AutoModelForCausalLM
            return True
        except ImportError:
            return False

    def extract(self, text: str, schema_name: str) -> dict:
        self._load_model()

        schema_class = SCHEMAS.get(schema_name, GenericDocument)
        template = schema_to_template(schema_class)
        template_str = json.dumps(template, indent=4)

        logger.info(f"Extracting with NuExtract Local using schema: {schema_name}")

        # Format prompt for NuExtract
        input_llm = f"<|input|>\n### Template:\n{template_str}\n### Text:\n{text}\n<|output|>\n"

        input_ids = self._tokenizer(
            input_llm,
            return_tensors="pt",
            truncation=True,
            max_length=4000
        ).to(self._model.device)

        with torch.no_grad():
            output_ids = self._model.generate(
                **input_ids,
                max_new_tokens=2000,
                temperature=0.0,  # NuExtract works best with temperature=0
                do_sample=False,
            )

        output = self._tokenizer.decode(output_ids[0], skip_special_tokens=True)

        # Parse output
        try:
            json_str = output.split("<|output|>")[1].split("<|end-output|>")[0].strip()
            data = json.loads(json_str)
        except (IndexError, json.JSONDecodeError) as e:
            logger.warning(f"Failed to parse NuExtract output: {e}")
            # Try to extract JSON from output
            try:
                import re
                json_match = re.search(r'\{[^{}]*\}', output, re.DOTALL)
                if json_match:
                    data = json.loads(json_match.group())
                else:
                    data = {"raw_output": output}
            except:
                data = {"raw_output": output}

        return {
            "data": data,
            "confidence_scores": None,
            "citations": None,
            "provider": "nuextract_local",
        }


class LlamaExtractProvider(ExtractionProvider):
    """LlamaExtract API provider - handles PDFs and other files directly."""

    def __init__(self):
        self._extractor = None
        self._agents = {}

    @property
    def extractor(self):
        if self._extractor is None:
            try:
                from llama_cloud_services import LlamaExtract
                self._extractor = LlamaExtract(api_key=settings.llama_cloud_api_key)
            except ImportError:
                logger.warning("llama-cloud-services package not installed")
                return None
            except Exception as e:
                logger.error(f"Failed to initialize LlamaExtract: {e}")
                return None
        return self._extractor

    def is_available(self) -> bool:
        return bool(settings.llama_cloud_api_key) and self.extractor is not None

    def _get_or_create_agent(self, schema_name: str, custom_fields: list[str] | None = None):
        # Version number - increment to force new agent creation when schema changes
        AGENT_VERSION = "v3"

        # Create a unique cache key for custom schemas
        if custom_fields and len(custom_fields) > 0:
            # Use a more unique agent name based on actual field names
            sorted_fields = sorted([f.strip().lower().replace(" ", "_") for f in custom_fields])
            cache_key = f"custom_{','.join(sorted_fields)}"
            # Create a deterministic hash from the fields
            import hashlib
            field_hash = hashlib.md5(','.join(sorted_fields).encode()).hexdigest()[:8]
            agent_name = f"extract-{AGENT_VERSION}-custom-{field_hash}"
            logger.info(f"Using custom schema with fields: {sorted_fields}, agent: {agent_name}")
        else:
            cache_key = f"{schema_name}_{AGENT_VERSION}"
            agent_name = f"extract-{AGENT_VERSION}-{schema_name}"
            logger.info(f"Using predefined schema: {schema_name}, agent: {agent_name}")

        if cache_key not in self._agents:
            schema_class = get_schema_class(schema_name, custom_fields)
            logger.info(f"Schema class fields: {list(schema_class.model_fields.keys())}")

            try:
                # Try to create new agent
                logger.info(f"Creating new LlamaExtract agent: {agent_name}")
                self._agents[cache_key] = self.extractor.create_agent(
                    name=agent_name,
                    data_schema=schema_class,
                )
                logger.info(f"Successfully created agent: {agent_name}")
            except Exception as e:
                # If agent already exists (409 conflict), try to get it
                if "409" in str(e) or "already exists" in str(e).lower():
                    logger.info(f"Agent {agent_name} already exists, fetching existing agent")
                    # Get existing agent by listing and finding by name
                    agents = self.extractor.list_agents()
                    for agent in agents:
                        if agent.name == agent_name:
                            self._agents[cache_key] = agent
                            logger.info(f"Found existing agent: {agent_name}")
                            break
                    if cache_key not in self._agents:
                        raise ValueError(f"Could not find or create agent: {agent_name}")
                else:
                    logger.error(f"Failed to create agent {agent_name}: {e}")
                    raise
        else:
            logger.info(f"Using cached agent for: {cache_key}")
        return self._agents[cache_key]

    def extract(self, text: str, schema_name: str, custom_fields: list[str] | None = None) -> dict:
        """Extract from text (writes to temp file)."""
        logger.info(f"Extracting with LlamaExtract using schema: {schema_name}")

        # LlamaExtract needs a file, so write text to temp file
        with tempfile.NamedTemporaryFile(mode='w', suffix='.txt', delete=False) as f:
            f.write(text)
            temp_path = f.name

        try:
            return self.extract_from_file(temp_path, schema_name, custom_fields)
        finally:
            os.unlink(temp_path)

    def extract_from_file(self, file_path: str, schema_name: str, custom_fields: list[str] | None = None) -> dict:
        """Extract directly from file - handles PDFs, images, etc."""
        logger.info(f"Extracting with LlamaExtract from file: {file_path}")

        agent = self._get_or_create_agent(schema_name, custom_fields)
        result = agent.extract(file_path)

        # Log the full result structure for debugging
        logger.info(f"LlamaExtract result type: {type(result)}")
        logger.info(f"LlamaExtract result attributes: {dir(result)}")
        if hasattr(result, '__dict__'):
            logger.info(f"LlamaExtract result __dict__: {result.__dict__}")

        # Try to get citations - check multiple possible attribute names
        citations = None
        for attr in ['citations', 'citation', 'source_citations', 'metadata']:
            if hasattr(result, attr):
                val = getattr(result, attr)
                logger.info(f"Found attribute '{attr}': {val}")
                if attr in ['citations', 'citation', 'source_citations'] and val:
                    citations = val

        return {
            "data": result.data if hasattr(result, "data") else result.model_dump(),
            "confidence_scores": getattr(result, "confidence_scores", None),
            "citations": citations,
            "provider": "llamaextract",
        }


# ============ Main Extraction Service ============

class ExtractionService:
    """
    Multi-provider extraction service with automatic fallback.

    Provider selection (auto mode):
    1. LlamaExtract - if LLAMA_CLOUD_API_KEY is configured
    2. NuExtract API - if NUMIND_API_KEY is configured
    3. NuExtract Local - if nuextract_use_local=True and model is loadable
    """

    def __init__(self):
        self.providers = {
            "llamaextract": LlamaExtractProvider(),
            "nuextract_api": NuExtractAPIProvider(),
            "nuextract_local": NuExtractLocalProvider(),
        }

    def _get_provider_order(self) -> list[str]:
        """Get provider order based on configuration."""
        provider = settings.extraction_provider

        if provider == "auto":
            # Auto mode: try providers in priority order (LlamaExtract first)
            return ["llamaextract", "nuextract_api", "nuextract_local"]
        elif provider in self.providers:
            # Specific provider requested, with fallbacks
            order = [provider]
            for p in ["llamaextract", "nuextract_api", "nuextract_local"]:
                if p not in order:
                    order.append(p)
            return order
        else:
            return ["llamaextract", "nuextract_api", "nuextract_local"]

    def _read_file_text(self, file_path: str) -> str:
        """Read text from various file formats."""
        ext = file_path.lower().split('.')[-1]

        if ext == 'pdf':
            try:
                # Try PyPDF2 first
                import PyPDF2
                with open(file_path, 'rb') as f:
                    reader = PyPDF2.PdfReader(f)
                    text = ""
                    for page in reader.pages:
                        text += page.extract_text() + "\n"
                    return text
            except ImportError:
                pass

            try:
                # Fallback to pdfplumber
                import pdfplumber
                with pdfplumber.open(file_path) as pdf:
                    text = ""
                    for page in pdf.pages:
                        text += (page.extract_text() or "") + "\n"
                    return text
            except ImportError:
                logger.warning("No PDF library available, treating as raw text")

        # Default: read as text
        with open(file_path, 'r', errors='ignore') as f:
            return f.read()

    async def extract_from_file(self, file_path: str, schema_name: str = "generic", custom_fields: list[str] | None = None) -> dict:
        """Extract structured data from a file."""
        provider_order = self._get_provider_order()
        last_error = None

        # First, try providers that support direct file extraction (like LlamaExtract)
        for provider_name in provider_order:
            provider = self.providers[provider_name]

            if not provider.is_available():
                logger.debug(f"Provider {provider_name} not available, skipping")
                continue

            # Check if provider supports direct file extraction
            if hasattr(provider, 'extract_from_file'):
                try:
                    logger.info(f"Attempting file extraction with {provider_name}")
                    # Pass custom_fields if provider supports it
                    if provider_name == "llamaextract":
                        result = provider.extract_from_file(file_path, schema_name, custom_fields)
                    else:
                        result = provider.extract_from_file(file_path, schema_name)
                    logger.info(f"Successfully extracted with {provider_name}")
                    return result
                except Exception as e:
                    logger.warning(f"Provider {provider_name} file extraction failed: {e}")
                    last_error = e
                    continue

        # Fallback: try text extraction for providers that don't support files directly
        try:
            text = self._read_file_text(file_path)
            if text.strip():
                return await self.extract_from_text(text, schema_name, custom_fields)
        except Exception as e:
            logger.warning(f"Text extraction failed: {e}")
            if last_error is None:
                last_error = e

        raise ValueError(f"Could not extract from file. Last error: {last_error}")

    async def extract_from_text(self, text: str, schema_name: str = "generic", custom_fields: list[str] | None = None) -> dict:
        """Extract structured data from text using available providers."""
        provider_order = self._get_provider_order()
        last_error = None

        for provider_name in provider_order:
            provider = self.providers[provider_name]

            if not provider.is_available():
                logger.debug(f"Provider {provider_name} not available, skipping")
                continue

            try:
                logger.info(f"Attempting extraction with {provider_name}")
                # Pass custom_fields if provider supports it
                if provider_name == "llamaextract" and custom_fields:
                    result = provider.extract(text, schema_name, custom_fields)
                else:
                    result = provider.extract(text, schema_name)
                logger.info(f"Successfully extracted with {provider_name}")
                return result

            except Exception as e:
                logger.warning(f"Provider {provider_name} failed: {e}")
                last_error = e
                continue

        # All providers failed
        raise RuntimeError(f"All extraction providers failed. Last error: {last_error}")

    async def extract_from_bytes(
        self,
        file_bytes: bytes,
        filename: str,
        schema_name: str = "generic",
        custom_fields: list[str] | None = None
    ) -> dict:
        """Extract structured data from file bytes."""
        ext = filename.split(".")[-1] if "." in filename else "txt"

        with tempfile.NamedTemporaryFile(suffix=f".{ext}", delete=False) as tmp:
            tmp.write(file_bytes)
            tmp_path = tmp.name

        try:
            return await self.extract_from_file(tmp_path, schema_name, custom_fields)
        finally:
            os.unlink(tmp_path)


# Global service instance
extraction_service = ExtractionService()
