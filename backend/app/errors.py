"""A refused action, with a stable machine-readable reason."""


class Refusal(Exception):
    """The request was valid but a rule refused it.

    `code` is a stable English identifier (for example "slot_taken"); the
    web app turns it into a Hebrew message.
    """

    def __init__(self, status: int, code: str):
        super().__init__(code)
        self.status = status
        self.code = code


EXCLUSION_VIOLATION = "23P01"  # PostgreSQL error code of an EXCLUDE constraint


def sqlstate(error: Exception) -> str | None:
    return getattr(getattr(error, "orig", None), "sqlstate", None)
