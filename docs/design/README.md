# Design notes

Short notes on how StudySpot is built and why. Written for a reader who wants to judge the engineering, not just see the screens.

| Note | What it answers |
|---|---|
| [Requirements](requirements.md) | What I set out to build, what I built, and what I did not |
| [Database](database.md) | The core tables, the terms, and the rules the database enforces |
| [Pages](pages.md) | Every page, who can open it, and what it shows in each state |
| [How I built it](process.md) | My process, what I decided and checked, and examples with proof |
| [Architecture](architecture.md) | What runs where, and how a request travels |
| [Preventing double booking](preventing-double-booking.md) | The hardest correctness problem, and how the database solves it |
| [Decisions and trade-offs](decisions.md) | The choices I made, what I gave up, and what I did not build |
| [Testing](testing.md) | How I know it works, and what the tests do not prove |

## How I worked
I used Claude Code, an AI coding tool, and most of the code was written with its help. What is mine is the product, the specification, the decisions, the order of the work, and the checks, on the real site and in automated tests. Where a choice had a cost, I wrote the cost down in these notes. Where I did not verify something, I say so.

## What is honest to say up front
- The occupancy comes from check-ins (scanning a code on a sign) and bookings, not from sensors. It is only as good as the scans.
- The demo campus uses simulated students so the map is not empty. The mechanism is real; the numbers on the demo are not.
- Capacity was measured on one local machine (about 80 requests per second), not on the live free server.
