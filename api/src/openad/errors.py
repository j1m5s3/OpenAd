"""Domain exceptions raised by services and translated to HTTP in ``main.py``."""

from __future__ import annotations


class DomainError(Exception):
    status_code = 400
    code = "domain_error"
    # Extra response headers (e.g. ``Retry-After``); None for most errors.
    headers: dict[str, str] | None = None

    def __init__(self, message: str) -> None:
        super().__init__(message)
        self.message = message


class UnauthorizedError(DomainError):
    status_code = 401
    code = "unauthorized"


class NotFoundError(DomainError):
    status_code = 404
    code = "not_found"


class SlotNotFoundError(NotFoundError):
    code = "slot_not_found"


class ForbiddenError(DomainError):
    status_code = 403
    code = "forbidden"


class ConflictError(DomainError):
    status_code = 409
    code = "conflict"


class InvalidWindowError(DomainError):
    status_code = 422
    code = "invalid_window"


class InvalidListingError(DomainError):
    status_code = 422
    code = "invalid_listing"


class InvalidRequestError(DomainError):
    """422 for an auth request body that fails schema validation (``main.py``)."""

    status_code = 422
    code = "invalid_request"


class RateLimitedError(DomainError):
    """429 with ``Retry-After`` (whole seconds): the per-instance auth rate limit was hit."""

    status_code = 429
    code = "rate_limited"

    def __init__(self, message: str, *, retry_after: int) -> None:
        super().__init__(message)
        self.retry_after = retry_after
        self.headers = {"Retry-After": str(retry_after)}
