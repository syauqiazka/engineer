"""
SecretStore: Penyimpanan kredensial mandiri dengan enkripsi AES-GCM.
Sesuai AGENTS.md Bagian 7.1:
- AES-GCM via library `cryptography` (berlisensi Apache-2.0 / BSD)
- Master key diambil dari environment `ENGINEER_SECRET_KEY` atau file master key lokal
- Mendukung rotasi kunci tanpa membocorkan plaintext
- Kredensial tidak pernah disimpan dalam plaintext atau dikirim ke log/frontend
"""

from __future__ import annotations

import base64
import json
import os
import secrets
from pathlib import Path

from cryptography.hazmat.primitives.ciphers.aead import AESGCM


class SecretStore:
    """Penyimpanan rahasia terenkripsi AES-GCM 256-bit."""

    def __init__(self, key_dir: str | Path | None = None) -> None:
        if key_dir is None:
            # Simpan master key di direktori workspace_data
            base_dir = Path(__file__).resolve().parent.parent.parent / "workspace_data"
            base_dir.mkdir(parents=True, exist_ok=True)
            self._key_dir = base_dir
        else:
            self._key_dir = Path(key_dir)
            self._key_dir.mkdir(parents=True, exist_ok=True)

        self._master_key = self._load_or_generate_master_key()
        self._store_file = self._key_dir / "secrets.enc.json"

    def _load_or_generate_master_key(self) -> bytes:
        """
        Ambil master key dari:
        1. Environment variable ENGINEER_SECRET_KEY (base64)
        2. File .secret_master.key di folder data aman
        """
        env_key = os.environ.get("ENGINEER_SECRET_KEY")
        if env_key:
            try:
                decoded = base64.b64decode(env_key.strip())
                if len(decoded) == 32:
                    return decoded
            except Exception:
                pass

        key_file = self._key_dir / ".secret_master.key"
        if key_file.exists():
            try:
                key_content = key_file.read_bytes().strip()
                if len(key_content) == 32:
                    return key_content
                decoded = base64.b64decode(key_content)
                if len(decoded) == 32:
                    return decoded
            except Exception:
                pass

        # Buat key baru 256-bit secara aman
        new_key = AESGCM.generate_key(bit_length=256)
        key_file.write_bytes(base64.b64encode(new_key))
        try:
            # Set permission hanya owner pada sistem POSIX jika didukung
            key_file.chmod(0o600)
        except Exception:
            pass
        return new_key

    def encrypt(self, plaintext: str) -> str:
        """Enkripsi teks biasa menjadi payload string base64 berisi nonce + ciphertext."""
        if not plaintext:
            return ""
        aesgcm = AESGCM(self._master_key)
        # Nonce 12-byte direkomendasikan untuk AES-GCM
        nonce = secrets.token_bytes(12)
        ciphertext = aesgcm.encrypt(nonce, plaintext.encode("utf-8"), None)
        # Gabungkan nonce (12 byte) + ciphertext
        payload = nonce + ciphertext
        return base64.b64encode(payload).decode("ascii")

    def decrypt(self, encrypted_payload: str) -> str:
        """Dekripsi payload string base64 menjadi teks biasa."""
        if not encrypted_payload:
            return ""
        try:
            raw = base64.b64decode(encrypted_payload.encode("ascii"))
            if len(raw) < 13:
                return ""
            nonce = raw[:12]
            ciphertext = raw[12:]
            aesgcm = AESGCM(self._master_key)
            decrypted = aesgcm.decrypt(nonce, ciphertext, None)
            return decrypted.decode("utf-8")
        except Exception as e:
            raise ValueError(f"Gagal mendekripsi rahasia: {e}") from e

    def save_secret(self, key: str, value: str) -> None:
        """Simpan rahasia terenkripsi ke file persisten."""
        encrypted = self.encrypt(value)
        data = self._read_all_encrypted()
        data[key] = encrypted
        self._write_all_encrypted(data)

    def get_secret(self, key: str, default: str = "") -> str:
        """Ambil dan dekripsi rahasia dari penyimpanan."""
        data = self._read_all_encrypted()
        if key not in data:
            return default
        return self.decrypt(data[key])

    def delete_secret(self, key: str) -> bool:
        """Hapus rahasia."""
        data = self._read_all_encrypted()
        if key in data:
            del data[key]
            self._write_all_encrypted(data)
            return True
        return False

    def rotate_master_key(self, new_key_bytes: bytes) -> None:
        """Rotasi master key dengan mendekripsi semua rahasia dan mengenkripsi ulang dengan kunci baru."""
        if len(new_key_bytes) != 32:
            raise ValueError("Master key harus 32 byte (256-bit)")

        old_data = self._read_all_encrypted()
        plain_map: dict[str, str] = {}

        # Dekripsi dengan master key saat ini
        for k, enc_val in old_data.items():
            plain_map[k] = self.decrypt(enc_val)

        # Ubah master key
        self._master_key = new_key_bytes
        new_aes = AESGCM(new_key_bytes)

        # Enkripsi ulang
        new_data: dict[str, str] = {}
        for k, plain_val in plain_map.items():
            nonce = secrets.token_bytes(12)
            ct = new_aes.encrypt(nonce, plain_val.encode("utf-8"), None)
            new_data[k] = base64.b64encode(nonce + ct).decode("ascii")

        self._write_all_encrypted(new_data)

        # Perbarui file master key
        key_file = self._key_dir / ".secret_master.key"
        key_file.write_bytes(base64.b64encode(new_key_bytes))

    def _read_all_encrypted(self) -> dict[str, str]:
        if not self._store_file.exists():
            return {}
        try:
            return json.loads(self._store_file.read_text(encoding="utf-8"))
        except Exception:
            return {}

    def _write_all_encrypted(self, data: dict[str, str]) -> None:
        self._store_file.write_text(json.dumps(data, indent=2), encoding="utf-8")


# Singleton instance
_instance: SecretStore | None = None


def get_secret_store() -> SecretStore:
    global _instance
    if _instance is None:
        _instance = SecretStore()
    return _instance
