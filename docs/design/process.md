# How I worked with AI

I built StudySpot with Claude Code, an AI coding assistant, over four weeks (277 commits since 7 October 2026). Most lines of code were written by the assistant. What I did was decide what to build, in what order and why, approve every plan before it ran, and check the results myself. This page describes the process, so that "I asked it to make me a website" is not the picture.

## Who did what

| Me | The assistant |
|---|---|
| Chose the problem and the product | Proposed structure, technologies and alternatives, with reasons |
| Collected the campus data on site, in a spreadsheet | Wrote the code, the tests and the documents |
| Approved every plan before every stage | Ran the tests, and code and security review agents |
| Tested by hand on a phone and a computer, and found problems | Fixed them, with a test that fails before the fix |
| Chose when there were several ways | Laid out the ways, with a recommendation |
| Ran the services: domain, hosting, email, DNS | Wrote step-by-step instructions |

## The process, for every stage

1. **A plan first.** The assistant explains what it is about to do and why, in plain language. I read it and approve, change or reject it. Nothing starts without that.
2. **Requirements and states.** For each page or feature we write down what it does and what it shows in every state: loading, empty, error, no network (see [Requirements](requirements.md) and [Pages](pages.md)).
3. **Tests with the code.** For a bug, the test is written first and must fail on the old code. For a rule that must never break (two people in one room), the database enforces it, and a test races real threads against it ([Preventing double booking](preventing-double-booking.md)).
4. **Review by agents.** At the end of each stage a code-review agent and a security-review agent read the change. A blocking finding is fixed, with a test, before moving on.
5. **My own check.** I open the real site, on a phone and a computer, and click through it. Most of the visible problems I found this way, not in tests.
6. **Documents updated** with the change, and a pull request that I merge. The assistant does not merge.

## Rules I set for the work

- Plain Hebrew, right to left, short, one step at a time.
- No new stage without my approval, and no cost, dependency, deployment or deletion without asking first.
- Security is part of every stage: no secrets in code, validated input, an authorization test for every route.
- A test is never edited to make it pass. If behaviour changed on purpose, the assistant says which test changed and why.
- Where something was not verified, the document says "not verified".

## How the plan changed

| Date | What happened |
|---|---|
| 7 October | A plan, an audit of the idea, and the first stages: database, occupancy, bookings, check-in |
| 8 to 11 October | The site, many institutions, self-service setup, timetable, load forecast |
| 12 October | **A full audit by four review agents**, and one report. The plan became 16 waves, ordered by risk |
| 13 to 20 October | Waves 4 to 14: automatic security checks, polish, performance, a domain and email, backups, reminders, passwords, a calendar feed, a screen by the door, an API |
| 25 October | A full test round on the live site, and its findings |
| late October to early November | Waves 15 to 18: the documents, monitoring and real devices on BrowserStack, a new look, and a round of technical debts (DNS rebinding closed, wrong-password counting moved into the database) |

## Three examples of my part

- **A bug I found by hand.** On my phone, a lecturer's title ("Dr.") appeared in front of course names that were saved before an earlier fix. The fix had been applied only when importing. The assistant moved the cleaning to where the names are read, with a test.
- **A decision I made.** For sign-in codes I first wanted a human-verification challenge (a CAPTCHA). When we looked at what it costs (it hurts accessibility, and an outside vendor changes the security policy and the privacy page), I decided against it. We added a small proof-of-work in the browser instead, and wrote down that it makes flooding expensive but does not prove a human. The reasoning is in [Decisions and trade-offs](decisions.md).
- **A mistake of the assistant that I caught.** On a phone, the list of places slid up over the map and covered it. It was the assistant's own design, from a new look. I said so, and it removed the overlap: the map, then the list.

## What I can and cannot say honestly

- I can explain every decision on these pages and in [Decisions and trade-offs](decisions.md), and why it was chosen over the alternative.
- I did not type most of the code, and I do not claim to. What I own is the product, the decisions, the checks and the result.
- Some areas I have used more than studied yet (for example the details of OpenID sign-in). [Decisions and trade-offs](decisions.md) and the "known limitations" in the README say what is not proven.
