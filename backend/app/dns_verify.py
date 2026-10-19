"""Proving a login domain with a DNS TXT record (wave 11).

An institution admin asks for an email domain; it waits for the system admin
(app/campus_setup.py). Or their IT people add one TXT record, and the rule
is approved at once: only whoever runs the domain's DNS can add it, so it
proves the domain is the institution's. The way Google, Microsoft and Brevo
prove a domain.

The lookup is DNS over HTTPS, as JSON, through the httpx client the app
already has: one fixed HTTPS address (no address from the user, so no
SSRF), and no DNS library. Anything unexpected in the answer reads as
"not found", never as proof.

Known weakness: it is checked once. A domain the institution loses later
keeps its rule until the system admin removes it.
"""

import json
import secrets

import httpx

RECORD_PREFIX = "_studyspot."
VALUE_PREFIX = "studyspot-verify="
TXT = 16  # the record type's number in DNS


def new_token() -> str:
    return secrets.token_hex(16)


def record_name(domain: str) -> str:
    return f"{RECORD_PREFIX}{domain}"


def record_value(token: str) -> str:
    return f"{VALUE_PREFIX}{token}"


def _texts(answer: dict) -> list[str]:
    """TXT data comes quoted, and a long one in several quoted pieces."""
    out = []
    for record in answer.get("Answer") or []:
        if not isinstance(record, dict) or record.get("type") != TXT or not isinstance(record.get("data"), str):
            continue
        data = record["data"].strip()
        pieces = [p for p in data.split('"') if p.strip()] if data.startswith('"') else [data]
        out.append("".join(pieces))
    return out


def has_proof(http: httpx.Client, resolver_url: str, domain: str, token: str) -> bool:
    try:
        response = http.get(
            resolver_url,
            params={"name": record_name(domain), "type": "TXT"},
            headers={"accept": "application/dns-json"},
            timeout=5,
        )
        if response.status_code != 200 or len(response.content) > 64_000:
            return False
        answer = response.json()
    except (httpx.HTTPError, json.JSONDecodeError, ValueError):
        return False
    if not isinstance(answer, dict) or answer.get("Status") != 0:
        return False
    return record_value(token) in _texts(answer)
