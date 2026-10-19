"""iCalendar (RFC 5545), written by hand: the little a subscribed feed needs.

Three rules carry it: text is escaped (section 3.3.11), every line ends in
CRLF, and a line longer than 75 bytes is folded onto the next one, which
starts with a space (section 3.1). Times are written in UTC, so the file
needs no VTIMEZONE: the local hour is worked out here (app/calendar_feed.py).
"""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import UTC, datetime

LINE_BYTES = 75


@dataclass(frozen=True)
class Event:
    uid: str  # the same every time, so a calendar updates the event, not adds one
    start: datetime
    end: datetime
    summary: str
    location: str
    description: str


def escape(text: str) -> str:
    text = text.replace("\\", "\\\\").replace(";", "\\;").replace(",", "\\,")
    return text.replace("\r\n", "\n").replace("\r", "\n").replace("\n", "\\n")


def fold(line: str) -> str:
    """At most 75 bytes a line, cut between letters: a Hebrew letter is two
    bytes, and half of one is not text."""
    parts, current, size = [], "", 0
    for char in line:
        width = len(char.encode())
        limit = LINE_BYTES if not parts else LINE_BYTES - 1  # the next ones start with a space
        if size + width > limit:
            parts.append(current)
            current, size = "", 0
        current += char
        size += width
    parts.append(current)
    return "\r\n ".join(parts)


def stamp(moment: datetime) -> str:
    return moment.astimezone(UTC).strftime("%Y%m%dT%H%M%SZ")


def calendar(name: str, events: Iterable[Event], now: datetime) -> str:
    lines = [
        "BEGIN:VCALENDAR",
        "VERSION:2.0",
        "PRODID:-//StudySpot//Calendar feed//HE",
        "CALSCALE:GREGORIAN",
        "METHOD:PUBLISH",
        f"X-WR-CALNAME:{escape(name)}",
        # A hint how often to read it again; each app decides for itself.
        "REFRESH-INTERVAL;VALUE=DURATION:PT1H",
        "X-PUBLISHED-TTL:PT1H",
    ]
    for event in events:
        lines += [
            "BEGIN:VEVENT",
            f"UID:{event.uid}",
            f"DTSTAMP:{stamp(now)}",
            f"DTSTART:{stamp(event.start)}",
            f"DTEND:{stamp(event.end)}",
            f"SUMMARY:{escape(event.summary)}",
            f"LOCATION:{escape(event.location)}",
        ]
        if event.description:
            lines.append(f"DESCRIPTION:{escape(event.description)}")
        lines.append("END:VEVENT")
    lines.append("END:VCALENDAR")
    return "".join(fold(line) + "\r\n" for line in lines)
