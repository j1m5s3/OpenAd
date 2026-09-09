"""Column types for chain data that behave identically on Postgres and SQLite.

- ``Uint256``: stored as a zero-padded 78-char decimal string (sortable, exact). Python ``int``.
- ``Address``: stored lowercase ``0x`` + 40 hex. Python ``str`` (lowercase). Checksum only at
  the HTTP boundary (schemas).
- ``Bytes32``: stored lowercase ``0x`` + 64 hex. Python ``str``.
"""

from __future__ import annotations

from typing import Any

from sqlalchemy import String
from sqlalchemy.engine import Dialect
from sqlalchemy.types import TypeDecorator

UINT256_MAX = 2**256 - 1
_UINT256_WIDTH = 78  # len(str(2**256 - 1))


class Uint256(TypeDecorator[int]):
    impl = String(_UINT256_WIDTH)
    cache_ok = True

    def process_bind_param(self, value: int | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        if not 0 <= value <= UINT256_MAX:
            raise ValueError(f"uint256 out of range: {value}")
        return str(value).zfill(_UINT256_WIDTH)

    def process_result_value(self, value: Any, dialect: Dialect) -> int | None:
        return None if value is None else int(value)


class Address(TypeDecorator[str]):
    impl = String(42)
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        v = value.lower()
        if len(v) != 42 or not v.startswith("0x"):
            raise ValueError(f"not an address: {value}")
        return v

    def process_result_value(self, value: Any, dialect: Dialect) -> str | None:
        return None if value is None else str(value)


class Bytes32(TypeDecorator[str]):
    impl = String(66)
    cache_ok = True

    def process_bind_param(self, value: str | None, dialect: Dialect) -> str | None:
        if value is None:
            return None
        v = value.lower()
        if len(v) != 66 or not v.startswith("0x"):
            raise ValueError(f"not a bytes32 hex string: {value}")
        return v

    def process_result_value(self, value: Any, dialect: Dialect) -> str | None:
        return None if value is None else str(value)
