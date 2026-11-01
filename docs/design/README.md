# Design notes

Short notes on how StudySpot is built and why. Written for a reader who wants to judge the engineering, not just see the screens.

| Note | What it answers |
|---|---|
| [Architecture](architecture.md) | What runs where, and how a request travels |
| [Preventing double booking](preventing-double-booking.md) | The hardest correctness problem, and how the database solves it |
| [Decisions and trade-offs](decisions.md) | The choices I made, what I gave up, and what I did not build |
| [Testing](testing.md) | How I know it works, and what the tests do not prove |

## How I worked
I built StudySpot with an AI coding assistant (Claude Code). I decided what to build and in what order, chose between the options at each step, reviewed the results, and tested them, on the real site and in automated tests. Where a choice had a cost, I wrote the cost down in these notes. Where I did not verify something, I say so.

## What is honest to say up front
- The occupancy comes from check-ins (scanning a code on a sign) and bookings, not from sensors. It is only as good as the scans.
- The demo campus uses simulated students so the map is not empty. The mechanism is real; the numbers on the demo are not.
- Capacity was measured on one local machine (about 80 requests per second), not on the live free server.
