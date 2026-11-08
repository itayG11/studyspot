# Decisions and trade-offs

For each major decision: what I chose, the alternative, my reasoning, and the cost.

## Data and server
| Decision | Alternative | Why | Cost |
|---|---|---|---|
| FastAPI | Django | I wanted to understand each layer myself. Input validation and API docs are built into the framework | More code of my own: permissions, structure |
| PostgreSQL | SQLite, MongoDB | Exclusion constraints, time ranges, row locks | A separate database server |
| Rules enforced in the database | Checks in code only | The database protects even when the code has a bug | Constraint errors need translating |
| Exclusion constraint | Locking in code | The database is the source of truth | Needs `btree_gist`; error `23P01` becomes a 409 |
| Composite foreign key with the institution | Plain key | The database prevents mixing institutions | An extra column in every table |
| Text with `CHECK` for fixed sets | PostgreSQL `ENUM` | Adding a value in a migration is easy; removing from an `ENUM` is not | Slightly more disk, negligible |
| 15-minute booking grid | Any minute | A freed slot stays bookable, no seven-minute gaps | Less flexibility |
| Time passed as a parameter | `datetime.now()` inside functions | Time-dependent code can be tested | One more argument |

## Sign-in and security
| Decision | Alternative | Why | Cost |
|---|---|---|---|
| OpenID Connect | Only our own passwords | I do not touch passwords, and the institution verifies people | Depends on Google and Microsoft |
| Institution by organisation ID | By email | The email claim is not verified at Microsoft (nOAuth) | Needs the institution's organisation IDs |
| 15-minute access token, rotating refresh token | One long session | A stolen access token is valid only for a short time; reuse of an old refresh token revokes the whole session | A database lookup per request, so "sign out everywhere" works at once |
| Access token in memory only | `localStorage` | The token is never stored in `localStorage`, so a script cannot read it from there | One refresh request after a page reload |
| Signed check-in codes | Plain place number | Cannot be forged or guessed | A server secret |
| Proof-of-work puzzle before an email code | CAPTCHA | No new vendor, no CSP change, no accessibility cost | It raises the cost of flooding but does not prove a human. The real defence is the rate limits |
| Short database wait and `503` | Wait up to 30 s | Failing fast lets the service recover | Some visitors see "busy" at the limit |

## Product
| Decision | Alternative | Why | Cost |
|---|---|---|---|
| No hardware | Sensors | No sensor hardware to buy or install, so a campus can start with printed signs | Occupancy depends on scans |
| One website | Mobile app | One codebase, no store approval, instant updates | Less access to the phone; on iPhone, notifications need "add to home screen" |
| Refresh every 30 seconds | Live push | Simple, fits a free server | Up to 30 seconds of delay |
| Everything belongs to an institution | One site per institution | A new institution needs no code or server | Every query filters by institution |
| "Maybe still taken" is a hint, never a block | Refusing a booking because someone might be there | The system does not measure physical presence; a block could hurt a real student | A student can still find the place taken, so there is a report |
| A report holds no name, and each institution picks its policy (none, reminders, reports) | Punishing a person by software, or one rule for all | The aim is to fix recurring problems at a place, not to identify or penalize individuals; institutions differ | The institution only sees a count by place and hour |
| Shared-sign mark is a hint only | Automatic block, or GPS | A block could hurt real students; GPS is a privacy cost | An admin has to look at it |
| A neutral, Apple-like look with the device's own font, restyled through design tokens only | Custom web fonts, or rewriting components in a CSS framework | No new dependency or font server, and the content security policy stays strict. A restyle cannot break behaviour, which I checked with a before/after inventory of every link, form and ID | Looks a little different on each operating system; blue as small text needed its own darker shade to pass contrast |

## What I decided not to build
| What | Why |
|---|---|
| Telegram bot | Web Push and email are enough, with no extra account |
| Holidays, noise, weather, buses | Not related to the core problem |
| Human verification (CAPTCHA, Turnstile) | Hurts accessibility; an external vendor changes the CSP and the privacy page. I may revisit it |
| Live updates without refresh | Not worth the complexity on a free server |
