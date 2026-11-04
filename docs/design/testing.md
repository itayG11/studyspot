# Testing

## Five layers
| Layer | Tool | Count | What it catches |
|---|---|---|---|
| Server tests | pytest on a real PostgreSQL | 1469 | Rules, permissions, constraints, concurrency |
| Web unit tests | vitest | 634 | One component or function, no server |
| Real browser | Playwright | 80 | A full path: click, server, database |
| Three devices | Playwright (`playwright.edge.config.ts`) | 45 (15 tests on 3 devices) | Desktop, iPad and phone: overflow, button size, accessibility |
| Real devices | BrowserStack, plus my own checks | | Real Safari on iPhone, camera, email |

Everything except the manual checks runs on GitHub on every push, together with CodeQL, a secret scan and linting. Counts as of 4 November 2026.

## How I test
- **Test first for fixes.** I write the failing test, then the fix, and where possible check the test against the old code to see it fail.
- **Mutation check on permissions.** Breaking the permission check on purpose made 27 of 30 cases in the access table fail.
- **One access table.** Every route has a row that says who may call it, and a test checks that no route is missing.
- **Time is a parameter,** so time-based rules are tested without waiting.
- **Concurrency.** Ten real threads race for one room (see [double booking](preventing-double-booking.md)).

## Load
A local test found about 80 requests per second on one machine, and a sharp failure above it. I changed the behaviour above the limit: a 5-second wait for a connection, then `503`. With 100 simulated visitors, 1,497 of 1,535 requests succeeded and 38 got a fast `503`. Scripts are in [`docs/load/`](../load/).

## Accessibility
Automated checks with axe, keyboard navigation, reflow at small sizes, and forced-colours mode. A real screen reader is still a manual check.

## What is not proven
- The live free server was not load-tested; it is weaker than the test machine.
- Sign-in with Microsoft and email codes were not load-tested.
- Occupancy accuracy depends on how many people scan, and no real campus has used it yet.
- A concurrency test shows the bug did not appear. It cannot show that it never will.

Device results: [`docs/browserstack/RESULTS.md`](../browserstack/RESULTS.md).
