"""In-process serve-cache generation. Bumped when indexed state that affects serving changes.

The HTTP cache is still ``Cache-Control`` on the response; this counter is mixed into ETags
so a publisher takedown is visible within one indexer cycle plus ``ttl``.
"""

from __future__ import annotations

from threading import Lock

_lock = Lock()
_generation = 0


def bump(*_slot_ids: int) -> int:
    global _generation
    with _lock:
        _generation += 1
        return _generation


def generation() -> int:
    with _lock:
        return _generation
