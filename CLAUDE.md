# StudySpot – instructions for Claude

## Who the user is
- First-year software engineering student at Braude College (Karmiel, Israel). Knows Python and C. New to JavaScript/React, web backends, Docker.
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
- Use agents/skills where useful: code-reviewer and security-reviewer at the end of each stage, docs lookup for current library docs, TDD while coding.

## Source of truth
- Plan: `docs/PLAN.md` (Hebrew). Follow its stages in order.
- Competitive analysis: `docs/COMPETITIVE_ANALYSIS.md`.
- Keep `docs/INTERVIEW_REPORT.md` updated as we go (decisions + trade-offs, challenges, weaknesses and honest answers, competitors, expected interview questions with answers). It becomes the final summary report.

## Engineering rules
- Security is part of every stage (see "אבטחה" in the plan): no secrets in code, input validation, authorization checks with tests, rate limiting.
- Double-booking prevention must be enforced by the database (PostgreSQL exclusion constraint), with a concurrency test.
- Every stage ends with passing tests and a commit with a clear message.
