"""Local load test for StudySpot: many virtual visitors against one server.

Run it ONLY against a local server (see docs/load/README.md), never the live
site: the live one is a free service, and a test like this would slow it for
real people and trigger the uptime alerts.

Each virtual visitor gets its own made-up address in X-Forwarded-For, so the
per-address rate limits treat them as separate people, like a real crowd.
The server must run with TRUSTED_PROXY_HOPS=1 for that.

Phases:
  0. (not here) a crowd logging in at once is a separate check, see README.
  1. reads:   the screens a student opens (finder, place, availability,
              forecast), at rising numbers of visitors.
  2. race:    N visitors book the same room at the same minute. The database
              must accept exactly one.
  3. limits:  one address hammering a public read gets refused (429).
"""

import argparse
import asyncio
import json
import random
import statistics
import time
from datetime import datetime, timedelta, timezone

import httpx
from zoneinfo import ZoneInfo

ORIGIN = "http://localhost:5174"


def fake_ip(n: int) -> str:
    return f"10.{(n >> 16) & 255}.{(n >> 8) & 255}.{n & 255}"


def pct(values: list[float], p: float) -> float:
    if not values:
        return 0.0
    ordered = sorted(values)
    return ordered[min(len(ordered) - 1, int(len(ordered) * p))]


async def login(client: httpx.AsyncClient, ip: str) -> str:
    response = await client.post(
        "/auth/demo/login", json={"persona": "student"}, headers={"X-Forwarded-For": ip, "Origin": ORIGIN}
    )
    response.raise_for_status()
    return response.json()["access_token"]


async def reads(base: str, visitors: int, seconds: float, think: float, ramp: float, tokens: list[str]) -> dict:
    """Each visitor loops over the student screens for `seconds`, as its own
    student (a token from make_users.py): the demo login is one shared user,
    so a crowd logging in at once would test that row, not the site."""
    latencies: dict[str, list[float]] = {}
    statuses: dict[int, int] = {}
    limits = httpx.Limits(max_connections=visitors + 10, max_keepalive_connections=visitors + 10)
    async with httpx.AsyncClient(base_url=base, timeout=30, limits=limits) as probe:
        places = (await probe.get("/institutions/demo/places")).json()
    ids = [p["id"] for p in places]
    today = datetime.now(timezone.utc).date().isoformat()
    stop = time.monotonic() + ramp + seconds

    async def visitor(n: int) -> None:
        ip = fake_ip(n + 1)
        async with httpx.AsyncClient(base_url=base, timeout=30, limits=limits, headers={"X-Forwarded-For": ip}) as client:
            token = tokens[n % len(tokens)]
            auth = {"Authorization": f"Bearer {token}"}
            await asyncio.sleep(random.random() * ramp)  # arrivals spread over the ramp
            while time.monotonic() < stop:
                place = random.choice(ids)
                for name, path, headers in (
                    ("finder", "/institutions/demo/places", {}),
                    ("place", f"/places/{place}", {}),
                    ("availability", f"/places/{place}/availability?date={today}", {}),
                    ("forecast", f"/places/{place}/forecast?weekday=2", {}),
                    ("my bookings", "/me/bookings", auth),
                ):
                    started = time.perf_counter()
                    try:
                        response = await client.get(path, headers=headers)
                        code = response.status_code
                    except httpx.HTTPError:
                        code = -1
                    latencies.setdefault(name, []).append((time.perf_counter() - started) * 1000)
                    statuses[code] = statuses.get(code, 0) + 1
                    await asyncio.sleep(think * (0.5 + random.random()))

    started = time.perf_counter()
    await asyncio.gather(*(visitor(n) for n in range(visitors)))
    elapsed = time.perf_counter() - started
    total = sum(len(v) for v in latencies.values())
    return {"visitors": visitors, "elapsed": elapsed, "requests": total, "rps": total / elapsed, "latencies": latencies, "statuses": statuses}


async def race(base: str, tokens: list[str]) -> dict:
    """Many different students book the same room for the same hour at once."""
    async with httpx.AsyncClient(base_url=base, timeout=30) as probe:
        places = (await probe.get("/institutions/demo/places")).json()
    room = next(p for p in places if p["kind"] == "group_room")
    # 10:00 local time on a weekday (Sunday to Thursday), three or more days
    # ahead: inside the opening hours, or the server refuses every one.
    zone = ZoneInfo("Asia/Jerusalem")
    day = datetime.now(zone).date() + timedelta(days=3)
    while day.weekday() in (4, 5):
        day += timedelta(days=1)
    start = datetime(day.year, day.month, day.day, 10, 0, tzinfo=zone)
    body = {"place_id": room["id"], "starts_at": start.isoformat(), "ends_at": (start + timedelta(hours=1)).isoformat()}
    limits = httpx.Limits(max_connections=len(tokens) + 10)
    outcomes: dict[int, int] = {}
    booked: list[tuple[str, int]] = []
    async with httpx.AsyncClient(base_url=base, timeout=30, limits=limits) as client:

        async def one(n: int, token: str) -> None:
            response = await client.post(
                "/bookings", json=body, headers={"Authorization": f"Bearer {token}", "X-Forwarded-For": fake_ip(901_000 + n)}
            )
            outcomes[response.status_code] = outcomes.get(response.status_code, 0) + 1
            if response.status_code == 201:
                booked.append((token, response.json()["id"]))

        await asyncio.gather(*(one(n, t) for n, t in enumerate(tokens)))
        # Clean up, so a rerun starts clean.
        for token, booking_id in booked:
            await client.post(f"/bookings/{booking_id}/cancel", headers={"Authorization": f"Bearer {token}"})
    return {"contenders": len(tokens), "outcomes": outcomes, "room": room["name"]}


async def limits_check(base: str) -> dict:
    """One address, a public read, far past its limit."""
    statuses: dict[int, int] = {}
    async with httpx.AsyncClient(base_url=base, timeout=30, headers={"X-Forwarded-For": fake_ip(950_000)}) as client:
        for _ in range(1000):
            code = (await client.get("/institutions/demo/places")).status_code
            statuses[code] = statuses.get(code, 0) + 1
    return {"statuses": statuses}


def show_reads(result: dict) -> None:
    print(f"\n== {result['visitors']} visitors, {result['elapsed']:.0f} s: {result['requests']} requests, {result['rps']:.0f} per second")
    print("   statuses:", dict(sorted(result["statuses"].items())))
    print(f"   {'screen':<13}{'count':>7}{'median ms':>11}{'95% ms':>9}{'99% ms':>9}")
    for name, values in result["latencies"].items():
        print(f"   {name:<13}{len(values):>7}{statistics.median(values):>11.0f}{pct(values, 0.95):>9.0f}{pct(values, 0.99):>9.0f}")


async def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--base", default="http://localhost:8002")
    parser.add_argument("--levels", default="10,50,100,200")
    parser.add_argument("--seconds", type=float, default=20)
    parser.add_argument("--tokens", required=True, help="JSON list of access tokens from make_users.py")
    parser.add_argument("--ramp", type=float, default=10, help="seconds over which the visitors arrive (0: all at once)")
    parser.add_argument("--think", type=float, default=0.3, help="seconds between a visitor's requests")
    args = parser.parse_args()
    if "getstudyspot" in args.base:
        raise SystemExit("Refusing to run against the live site.")
    for level in (int(x) for x in args.levels.split(",")):
        show_reads(await reads(args.base, level, args.seconds, args.think, args.ramp, json.load(open(args.tokens))))
    with open(args.tokens) as handle:
        print("\n== race:", await race(args.base, json.load(handle)[:100]))
    print("\n== one address, 1000 reads:", await limits_check(args.base))


asyncio.run(main())
