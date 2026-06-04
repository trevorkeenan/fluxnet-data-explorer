"""Small logging helpers for scheduled snapshot refresh scripts."""

from __future__ import annotations

import time
from contextlib import contextmanager
from datetime import datetime, timezone
from typing import Iterator


def utc_timestamp() -> str:
    return datetime.now(timezone.utc).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def log(message: str) -> None:
    print(f"[{utc_timestamp()}] {message}", flush=True)


def elapsed_seconds(started_at: float) -> str:
    return f"{time.monotonic() - started_at:.1f}s"


@contextmanager
def phase(label: str) -> Iterator[None]:
    started_at = time.monotonic()
    log(f"START {label}")
    try:
        yield
    except Exception as exc:
        log(f"FAIL {label} elapsed={elapsed_seconds(started_at)} error={compact_error(exc)}")
        raise
    else:
        log(f"END {label} elapsed={elapsed_seconds(started_at)}")


def compact_text(value: object, limit: int = 500) -> str:
    text = " ".join(str(value or "").split())
    if len(text) <= limit:
        return text
    return text[: max(0, limit - 3)] + "..."


def compact_error(error: BaseException | object, limit: int = 500) -> str:
    return compact_text(error, limit=limit)
