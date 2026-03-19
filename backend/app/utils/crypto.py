import base64
import json

from cryptography.fernet import Fernet
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.pbkdf2 import PBKDF2HMAC

from app.core.config import settings


def _get_encryption_key(org_id: int) -> bytes:
    secret = (settings.JWT_SECRET or "helix-default-secret").encode()
    salt = f"helix-plugin-{org_id}".encode()
    kdf = PBKDF2HMAC(algorithm=hashes.SHA256(), length=32, salt=salt, iterations=100_000)
    return base64.urlsafe_b64encode(kdf.derive(secret))


def encrypt_credentials(org_id: int, credentials: dict) -> bytes:
    f = Fernet(_get_encryption_key(org_id))
    return f.encrypt(json.dumps(credentials).encode())


def decrypt_credentials(org_id: int, encrypted: bytes) -> dict:
    f = Fernet(_get_encryption_key(org_id))
    return json.loads(f.decrypt(encrypted).decode())


def mask_credentials(credentials: dict) -> dict:
    masked = {}
    for key, value in credentials.items():
        if isinstance(value, str) and len(value) > 4:
            masked[key] = value[:2] + "****" + value[-4:]
        else:
            masked[key] = "****"
    return masked
