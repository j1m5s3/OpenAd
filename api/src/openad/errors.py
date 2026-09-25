"""Domain exceptions raised by services and translated to HTTP in ``main.py``."""

from __future__ import annotations


class DomainError(Exception):
    status_code = 400
    code = "domain_error"

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
