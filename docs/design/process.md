# How I built it

StudySpot is my first complete web project, built during my second year of software engineering at Braude College. I used Claude Code, an AI coding tool, and most of the code was written with its help. My part was defining the product and its requirements, planning the order of the work, reviewing and approving each plan, making the design decisions, and testing the results. I can explain each decision on these pages and why I chose it over the alternative.

This page describes how I worked. The examples below link to the pull request or test behind them.

## What I decided and what I checked

- **The problem and the product.** I chose what to build, for whom, and what to leave out (see [Requirements](requirements.md) and [Decisions and trade-offs](decisions.md)).
- **The campus data.** I collected it on site, in a spreadsheet, and I never let the tool guess a building or a floor.
- **The plan for every stage.** I read the plan before it ran. I approved it, changed it or rejected it. Nothing started without that.
- **The checks.** I opened the real site, on a phone and on a computer, and clicked through it. Most of the visible problems I found this way, not in tests.
- **The services.** I set up the domain, hosting, email and DNS myself, from step-by-step instructions.
- **The merge.** I merge every pull request myself.

## The process, for every stage

1. **A plan first,** in plain language: what is about to change, and why.
2. **Requirements and states.** For each page or feature, what it does and what it shows in every state: loading, empty, error, no network ([Requirements](requirements.md), [Pages](pages.md)).
3. **Tests with the code.** For a bug, the test is written first and, when possible, must fail on the old code. For a rule that must never break (two people in one room), the database enforces it, and a test races real threads against it ([Preventing double booking](preventing-double-booking.md)).
4. **Review.** At the end of a stage, a code-review pass and a security-review pass read the change. A blocking finding is fixed, with a test, before I move on.
5. **My own check** on the live site.
6. **Documents updated,** and a pull request that I merge.

## Rules I set

- No new stage without my approval, and no cost, dependency, deployment or deletion without asking first.
- Security is part of every stage: no secrets in code, validated input, an authorization test for every route.
- A test is never weakened to make it pass. When behaviour changed on purpose, the pull request says which test changed and why.
- Where something was not verified, the document says "not verified".

## Timeline

| When | What happened |
|---|---|
| First week | The idea, an audit of it, and the database: places, occupancy, bookings, check-in |
| Second week | The site, many institutions on one site, self-service setup, timetable, load forecast |
| Middle weeks | A full audit of everything built so far, which turned the plan into sixteen waves ordered by risk; then the waves: automatic security checks, performance, a domain and email, backups, reminders, passwords, a calendar feed, a screen by the door, an API |
| Final weeks | Documents, monitoring and real devices, a new look, technical debts (DNS rebinding closed, wrong-password counting moved into the database), and a last wave on people who stay after their time |

## Four examples from development

**1. A problem I noticed myself: someone stays after their time (the last wave).** The system assumed that when a booking ends, the student leaves. The software cannot verify whether someone has physically left, so the assumption can be wrong, and the next student finds the room taken. I looked for a way an institution could handle this without hardware and without automatically penalizing anyone. I chose layers: prevention, detection, immediate help, and an interface for the institution.

| Layer | Before | After | Proof |
|---|---|---|---|
| Prevention | No warning when a booking ends | A reminder five minutes before the end; a room whose time just ran out is shown "free, maybe still taken" for a grace period the institution sets (0 to 15 minutes, 5 by default). `free_now` itself does not change, so the API and the webhooks keep their contract | [PR 34](https://github.com/itayG11/studyspot/pull/34), `backend/tests/test_lingering.py` and `test_reminders.py` |
| Keeping a place for a moment | Leaving for ten minutes meant losing the place, or leaving it blocked | "Going on a break": 20 minutes by default (the institution sets 0 to 60), once per stay. Coming back means scanning the sign again (a button could be pressed from home). If the break runs out, the place is let go at once, without waiting for the background task | [PR 34](https://github.com/itayG11/studyspot/pull/34), `backend/tests/test_break.py` |
| Immediate help | A student who found their room taken had nowhere to go | One tap says "someone is in my place" and returns up to three free places nearby: rooms by walking time, seats in the same lab first. The report holds no name | [PR 35](https://github.com/itayG11/studyspot/pull/35), `backend/tests/test_reports.py` |
| The institution | Nothing | A policy per institution (none, reminders, reports), a table of reports by place and hour, advice after three reports in a week, and a webhook event. No automatic punishment | [PR 36](https://github.com/itayG11/studyspot/pull/36), `backend/tests/test_overstay_admin.py` |

Three decisions inside it, with their cost:

- *A hint, not a block.* I could not know that someone is still there, so the site says "maybe" and never refuses a booking because of it. The cost: a student can still find the place taken. That is why the report exists.
- *Reports without names.* The report points at the booking of the person who reports, never at the person who stayed. I would rather the institution fix a place than chase a person.
- *Repeated reports that turn out wrong.* A person whose reports were closed as "nobody was there" three times in thirty days stops counting in the table, so the feature cannot be used for revenge. The reporter is not told.

I dropped two things I first planned: a second "still here?" question during long stays (a check-in already ends after two hours, and the question that exists already covers a stay without a booking), and moving the student to another booking automatically (that is a new booking with its own rules, so the site gives a link instead).

**2. A bug I found during manual testing.** On my phone, a lecturer's title ("Dr.") appeared in front of course names that had been saved before an earlier fix. The fix ran only when importing. I moved the title cleaning from import time to the point where names are read. Proof: `test_a_class_saved_before_the_fix_with_a_lecturers_title_is_shown_without_it` in `backend/tests/test_classes.py`.

**3. CAPTCHA or proof-of-work.** For sign-in codes I first wanted a human-verification challenge. Then I looked at the cost: it hurts accessibility, and an outside vendor changes the security policy and the privacy page. I decided against it and added a small proof-of-work in the browser. It makes flooding expensive, but it cannot verify that the visitor is human. The reasoning is in [Decisions and trade-offs](decisions.md) and the test is `backend/tests/test_pow.py`.

**4. A layout problem I caught in review, and an older bug a new test found.** On a phone, the list of places slid up over the map and covered it. It came with the new look. I flagged the overlap during review, and it was fixed: the map first, then the list. Later, the browser test I wrote for the new report button found an accessibility error that had been there before: the "My area" link in the header had an accessible name that left out the number shown on it. I rebuilt the name from the visible text. Proof: `frontend/e2e/report.spec.ts` and PR 35.

## What I learned, and what is still unverified

- I can explain every decision on these pages and why it was chosen over the alternative.
- Some areas I have used more than studied (for example the details of OpenID sign-in). [Decisions and trade-offs](decisions.md) and the known limitations in the [README](../../README.md) say what is not proven.
- No real campus has used the site yet. The numbers on the demo campus are simulated.
