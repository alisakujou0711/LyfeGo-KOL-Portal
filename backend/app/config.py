from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path

from dotenv import dotenv_values

ENV_FILE = Path(__file__).resolve().parent.parent / ".env"
REQUIRED_KEYS = ("DB_HOST", "DB_PORT", "DB_USER", "DB_PASSWORD", "DB_NAME")


@dataclass(frozen=True)
class Settings:
    db_host: str
    db_port: int
    db_user: str
    db_password: str
    db_name: str


def load_settings(env_file: Path = ENV_FILE) -> Settings:
    """Read database settings from the env file only (never the process env)."""
    if not env_file.exists():
        raise RuntimeError(
            f"{env_file} not found. Copy backend/.env.example to backend/.env and fill it in."
        )
    values = dotenv_values(env_file)
    missing = [key for key in REQUIRED_KEYS if values.get(key) is None]
    if missing:
        raise RuntimeError(f"{env_file} is missing: {', '.join(missing)}")
    return Settings(
        db_host=values["DB_HOST"],
        db_port=int(values["DB_PORT"]),
        db_user=values["DB_USER"],
        db_password=values["DB_PASSWORD"],
        db_name=values["DB_NAME"],
    )


@lru_cache
def get_settings() -> Settings:
    return load_settings()
