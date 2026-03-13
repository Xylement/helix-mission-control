import base64
import hashlib

from cryptography.fernet import Fernet

from app.core.config import settings


def _get_fernet() -> Fernet:
    key = hashlib.sha256(settings.JWT_SECRET.encode()).digest()
    fernet_key = base64.urlsafe_b64encode(key)
    return Fernet(fernet_key)


def encrypt_value(value: str) -> str:
    return _get_fernet().encrypt(value.encode()).decode()


def decrypt_value(encrypted: str) -> str:
    return _get_fernet().decrypt(encrypted.encode()).decode()
