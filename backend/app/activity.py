"""Whether people are using the site right now.

The free server is kept awake by an uptime monitor that asks /health every
few minutes. The background sweep would otherwise query the database every
minute around the clock, so the database (which sleeps after 5 idle
minutes) would never sleep and would use up its free compute hours. The
sweep therefore runs only while there were real visits recently.
"""

import time
from collections.abc import Callable

IDLE_AFTER_SECONDS = 600.0  # ten minutes without a visit: quiet


class Activity:
    def __init__(self, idle_after: float = IDLE_AFTER_SECONDS, clock: Callable[[], float] = time.monotonic) -> None:
        self._idle_after = idle_after
        self._clock = clock
        self._last_visit: float | None = None

    def busy(self) -> bool:
        return self._last_visit is not None and self._clock() - self._last_visit < self._idle_after

    def visit(self) -> bool:
        """Record a visit. True when it ends a quiet spell, the server's
        first visit included: the caller then catches up on the sweep."""
        was_busy = self.busy()
        self._last_visit = self._clock()
        return not was_busy
