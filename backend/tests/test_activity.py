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
