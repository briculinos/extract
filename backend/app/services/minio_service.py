from minio import Minio
from minio.error import S3Error
from io import BytesIO
import uuid

from app.core.config import get_settings

settings = get_settings()


class MinioService:
    def __init__(self):
        self.client = Minio(
            settings.minio_endpoint,
            access_key=settings.minio_access_key,
            secret_key=settings.minio_secret_key,
            secure=settings.minio_secure,
        )
        self.bucket = settings.minio_bucket
        self._ensure_bucket()

    def _ensure_bucket(self):
        try:
            if not self.client.bucket_exists(self.bucket):
                self.client.make_bucket(self.bucket)
        except S3Error as e:
            raise Exception(f"Failed to create bucket: {e}")

    def upload_file(self, file_data: bytes, original_filename: str, content_type: str) -> str:
        """Upload file to MinIO and return the object path."""
        file_ext = original_filename.split(".")[-1] if "." in original_filename else ""
        object_name = f"{uuid.uuid4()}.{file_ext}" if file_ext else str(uuid.uuid4())

        self.client.put_object(
            self.bucket,
            object_name,
            BytesIO(file_data),
            length=len(file_data),
            content_type=content_type,
        )
        return object_name

    def download_file(self, object_name: str) -> bytes:
        """Download file from MinIO."""
        response = self.client.get_object(self.bucket, object_name)
        try:
            return response.read()
        finally:
            response.close()
            response.release_conn()

    def get_presigned_url(self, object_name: str, expires_hours: int = 1) -> str:
        """Get a presigned URL for downloading a file."""
        from datetime import timedelta
        return self.client.presigned_get_object(
            self.bucket,
            object_name,
            expires=timedelta(hours=expires_hours),
        )

    def delete_file(self, object_name: str):
        """Delete file from MinIO."""
        self.client.remove_object(self.bucket, object_name)


minio_service = MinioService()
