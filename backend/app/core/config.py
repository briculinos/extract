from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://postgres:postgres@localhost:5432/extract_db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # MinIO
    minio_endpoint: str = "localhost:9000"
    minio_access_key: str = "minioadmin"
    minio_secret_key: str = "minioadmin"
    minio_bucket: str = "documents"
    minio_secure: bool = False

    # LlamaExtract (Primary)
    llama_cloud_api_key: str = ""

    # Extraction settings
    extraction_provider: str = "auto"  # auto, llamaextract, nuextract_api, nuextract_local

    # NuExtract (Fallback)
    numind_api_key: str = ""  # NuMind platform API key
    nuextract_model: str = "numind/NuExtract-1.5"  # Local model name
    nuextract_use_local: bool = False  # Use local model instead of API
    nuextract_device: str = "cuda"  # cuda, cpu, or mps

    # OpenAI
    openai_api_key: str = ""
    openai_model: str = "gpt-4o-mini"
    openai_embedding_model: str = "text-embedding-3-small"

    # App
    app_name: str = "Document Extract API"
    debug: bool = False

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache
def get_settings() -> Settings:
    return Settings()
