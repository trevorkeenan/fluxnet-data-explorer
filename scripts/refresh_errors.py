"""Expected upstream failures, distinct from parser and programming errors."""


class SourceUnavailableError(RuntimeError):
    def __init__(self, message: str, *, endpoint: str = "", status_code: int | None = None):
        super().__init__(message)
        self.endpoint = endpoint
        self.status_code = status_code

    def details(self) -> dict:
        return {"reason": str(self), "endpoint": self.endpoint, "http_status": self.status_code}
