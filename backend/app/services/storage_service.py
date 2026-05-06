import uuid
from pathlib import Path
from typing import Protocol

import aiofiles
import aiofiles.os
import structlog

from app.config import get_settings
from app.exceptions import StorageError

logger = structlog.get_logger()
settings = get_settings()


class StorageBackend(Protocol):
    async def save(self, file_bytes: bytes, filename: str, subdir: str) -> str:
        """Persist bytes; returns the storage path/key to store in DB."""
        ...

    async def load(self, path: str) -> bytes:
        """Retrieve file bytes by storage path/key."""
        ...

    async def delete(self, path: str) -> None:
        """Delete the file at the given storage path/key."""
        ...


class LocalStorageBackend:
    """Stores files on the local filesystem under UPLOAD_DIR."""

    def __init__(self, base_dir: str):
        self._base = Path(base_dir).resolve()
        self._base.mkdir(parents=True, exist_ok=True)

    async def save(self, file_bytes: bytes, filename: str, subdir: str) -> str:
        dest = self._base / subdir
        await aiofiles.os.makedirs(dest, exist_ok=True)
        safe_name = f"{uuid.uuid4().hex}_{Path(filename).name}"
        file_path = dest / safe_name
        try:
            async with aiofiles.open(file_path, "wb") as f:
                await f.write(file_bytes)
        except OSError as e:
            raise StorageError(f"Failed to write file: {e}") from e
        logger.info("file_saved", path=str(file_path), size=len(file_bytes))
        return str(file_path)

    async def load(self, path: str) -> bytes:
        try:
            async with aiofiles.open(path, "rb") as f:
                return await f.read()
        except OSError as e:
            raise StorageError(f"Failed to read file '{path}': {e}") from e

    async def delete(self, path: str) -> None:
        try:
            await aiofiles.os.remove(path)
            logger.info("file_deleted", path=path)
        except FileNotFoundError:
            logger.warning("file_not_found_on_delete", path=path)
        except OSError as e:
            raise StorageError(f"Failed to delete file '{path}': {e}") from e


class S3StorageBackend:
    """
    Drop-in S3 replacement using aioboto3.
    Install aioboto3 and set STORAGE_BACKEND=s3 with S3_BUCKET, S3_REGION,
    AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY to activate.
    """

    def __init__(self, bucket: str, region: str, access_key: str, secret_key: str):
        self._bucket = bucket
        self._region = region
        self._access_key = access_key
        self._secret_key = secret_key

    def _get_session(self):
        import aioboto3  # type: ignore
        return aioboto3.Session(
            aws_access_key_id=self._access_key,
            aws_secret_access_key=self._secret_key,
            region_name=self._region,
        )

    async def save(self, file_bytes: bytes, filename: str, subdir: str) -> str:
        key = f"{subdir}/{uuid.uuid4().hex}_{filename}"
        async with self._get_session().client("s3") as s3:
            await s3.put_object(Bucket=self._bucket, Key=key, Body=file_bytes)
        logger.info("s3_file_saved", key=key, size=len(file_bytes))
        return key

    async def load(self, path: str) -> bytes:
        async with self._get_session().client("s3") as s3:
            resp = await s3.get_object(Bucket=self._bucket, Key=path)
            return await resp["Body"].read()

    async def delete(self, path: str) -> None:
        async with self._get_session().client("s3") as s3:
            await s3.delete_object(Bucket=self._bucket, Key=path)
        logger.info("s3_file_deleted", key=path)


def get_storage_service() -> StorageBackend:
    """Factory that returns the configured storage backend."""
    if settings.STORAGE_BACKEND == "s3":
        return S3StorageBackend(
            bucket=settings.S3_BUCKET,
            region=settings.S3_REGION,
            access_key=settings.AWS_ACCESS_KEY_ID,
            secret_key=settings.AWS_SECRET_ACCESS_KEY,
        )
    return LocalStorageBackend(base_dir=settings.UPLOAD_DIR)
