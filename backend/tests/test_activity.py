"""The background sweep runs only while people use the site.

An uptime monitor keeps the free server awake around the clock. If the
sweep ran every minute regardless, the database would never get to sleep
and its free compute hours would run out in about two weeks.
"""

import asyncio

from fastapi.testclient import TestClient

from app import main
from app.activity import Activity
from app.sweeper import run_forever


class FakeClock:
    def __init__(self) -> None:
        self.now = 1000.0

    def __call__(self) -> float:
        return self.now


def test_a_new_server_is_quiet_until_someone_visits():
    activity = Activity(idle_after=600, clock=FakeClock())
    assert not activity.busy()
    assert activity.visit() is True  # the first visit ends the quiet
    assert activity.busy()
    assert activity.visit() is False  # later ones do not


def test_ten_quiet_minutes_make_the_site_quiet_again():
    clock = FakeClock()
    activity = Activity(idle_after=600, clock=clock)
    activity.visit()
    clock.now += 599
    assert activity.busy()
    clock.now += 2
    assert not activity.busy()
    assert activity.visit() is True


def test_the_sweep_waits_while_the_site_is_quiet():
    activity = Activity(idle_after=600, clock=FakeClock())
    rounds: list[int] = []

    async def scenario() -> None:
        task = asyncio.create_task(run_forever(0.001, activity, sweep=lambda: rounds.append(1)))
        await asyncio.sleep(0.05)
        assert rounds == []  # quiet: the database is left alone
        activity.visit()
        await asyncio.sleep(0.05)
        task.cancel()

    asyncio.run(scenario())
    assert rounds  # busy: it sweeps again


def test_the_health_check_is_not_a_visit(monkeypatch):
    activity = Activity(idle_after=600, clock=FakeClock())
    monkeypatch.setattr(main, "activity", activity)
    client = TestClient(main.app)
    assert client.get("/health").status_code == 200
    assert not activity.busy()
    client.get("/institutions/nowhere")
    assert activity.busy()


def test_the_first_visit_after_a_quiet_spell_sweeps_first(monkeypatch):
    # Otherwise a no-show's booking would still look taken until the next round.
    activity = Activity(idle_after=600, clock=FakeClock())
    sweeps: list[int] = []
    monkeypatch.setattr(main, "activity", activity)
    monkeypatch.setattr(main, "run_once", lambda: sweeps.append(1))
    monkeypatch.setattr(main.app.state, "sweeping", True, raising=False)
    client = TestClient(main.app)
    client.get("/institutions/nowhere")
    client.get("/institutions/nowhere")
    assert sweeps == [1]  # once, for the visit that ended the quiet


def test_no_wake_sweep_when_the_background_sweep_is_off(monkeypatch):
    activity = Activity(idle_after=600, clock=FakeClock())
    sweeps: list[int] = []
    monkeypatch.setattr(main, "activity", activity)
    monkeypatch.setattr(main, "run_once", lambda: sweeps.append(1))
    monkeypatch.setattr(main.app.state, "sweeping", False, raising=False)
    TestClient(main.app).get("/institutions/nowhere")
    assert sweeps == []


def test_the_health_check_answers_head_too():
    # Uptime monitors often ask with HEAD; a 405 would read as "down".
    client = TestClient(main.app)
    assert client.head("/health").status_code == 200


def test_only_the_health_address_itself_is_left_out(monkeypatch):
    # A monitor set to another address must not quietly keep the database awake.
    activity = Activity(idle_after=600, clock=FakeClock())
    monkeypatch.setattr(main, "activity", activity)
    TestClient(main.app).get("/places/health")
    assert activity.busy()


def test_a_slow_catch_up_sweep_does_not_hold_the_visit(monkeypatch):
    import time

    activity = Activity(idle_after=600, clock=FakeClock())
    monkeypatch.setattr(main, "activity", activity)
    monkeypatch.setattr(main, "run_once", lambda: time.sleep(2))
    monkeypatch.setattr(main, "WAKE_SWEEP_TIMEOUT", 0.2)
    monkeypatch.setattr(main, "SWEEP_INTERVAL", 0)  # no background loop in this test
    # One client for the whole test: like the real server, its event loop
    # stays up while the slow sweep finishes in its thread.
    with TestClient(main.app) as client:
        main.app.state.sweeping = True
        started = time.monotonic()
        client.get("/institutions/nowhere")
        assert time.monotonic() - started < 1.5
