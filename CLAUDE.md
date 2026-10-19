# StudySpot – instructions for Claude

## Who the user is
- Second-year software engineering student at Braude College (Karmiel, Israel). Knows Python and C. New to JavaScript/React, web backends, Docker.
- This is a portfolio project for the CV (1–2 weeks of work). The user must be able to explain every part in a job interview.

## How to work with the user
- Communicate in Hebrew. The user reads with a global right-to-left mod, so every Hebrew output must be RTL-friendly. This applies to chat replies, tool-question text, plans and docs alike:
  - Start every line, bullet, heading and table cell with Hebrew, never with an English word, a code span or a number.
  - Put English terms, commands and file names in `code`, or in a separate table cell.
  - Avoid switching languages mid-sentence; no English inside parentheses in a Hebrew sentence.
  - Prefer short lines and tables over long mixed sentences.
- Before each stage: explain in simple Hebrew what we are about to do and why. After each stage: short summary of what was done and what was learned.
- Do not start a new stage without the user's approval.
- Rely on official, current documentation before and during work. Answer only when sure; say clearly when something is not verified.
- Never guess facts about the Braude campus (building names, floors, which buildings have computer labs). Ask the user.
- Warn the user when token usage is running fast, and stop before it runs out.
- Save usage (the user's request, 19 Oct 2026):
  - No side tasks (videos, images, posts) in the middle of a wave.
  - Run the full test suites only at the end of each step; while fixing, run only the affected tests.
  - Keep replies short.
- Follow `docs/ROADMAP.md` in order, waves 13 to 16, with nothing cut. The weekly usage resets on 25 Oct at 03:00; if it runs out first, continue after that.
- Use agents/skills where useful: code-reviewer and security-reviewer at the end of each stage, docs lookup for current library docs, TDD while coding.

## Source of truth
- Plan: `docs/PLAN.md` (Hebrew). Follow its stages in order.
- Remaining work, from the 12 Oct 2026 audit to the end: `docs/ROADMAP.md`, 16 waves in order. It overrides the order in `PLAN.md`. Each wave needs the user's approval; mark it done there when finished. Audit findings: `docs/AUDIT_2026-10-12.md`.
- After every push, check that the GitHub CI run is green (it was red for 16 runs unnoticed once).
- Competitive analysis: `docs/COMPETITIVE_ANALYSIS.md`.
- Keep `docs/INTERVIEW_REPORT.md` updated as we go (decisions + trade-offs, challenges, weaknesses and honest answers, competitors, expected interview questions with answers). It becomes the final summary report.

## Engineering rules
- Security is part of every stage (see "אבטחה" in the plan): no secrets in code, input validation, authorization checks with tests, rate limiting.
- Double-booking prevention must be enforced by the database (PostgreSQL exclusion constraint), with a concurrency test.
- Every stage ends with passing tests and a commit with a clear message.

## When a wave is done
A wave starts with a plan the user approves (plan mode), and is done only when every item below holds. Then explain it to the user and stop for approval.
1. All tests: `pytest`, `vitest`, `Playwright`, and the edge tests on three devices (`-c playwright.edge.config.ts`).
2. `ruff check`, `tsc -b`, `oxlint`, `alembic check`, and `npm run build` within the bundle cap.
3. A code + security review agent; every blocking finding fixed, with a test.
4. Docs updated: `docs/INTERVIEW_REPORT.md`, `docs/DEPLOY.md`, `docs/SERVICES.md`, `docs/ROADMAP.md`; the privacy page if new data is handled, the licenses page if a library was added.
5. Committed and pushed; every GitHub check green, CodeQL included.
6. On the live site: the new version is up and the feature checked. What Claude cannot check, the user checks from a short list.
7. A pull request to `main`, which the user merges.
8. Harvest to `knowledge/` (session-harvest), `knowledge/NEXT.md` updated, and the progress file `knowledge/progress.json`.

## Between waves
Harvest at the end of a wave, never mid-wave. Then the user starts a new session (cheaper) or runs COMPACT, and the next session reads only `knowledge/NEXT.md` and `TODO.md` before proposing the next wave's plan.
