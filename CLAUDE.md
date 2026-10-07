# StudySpot – instructions for Claude

## Who the user is
- First-year software engineering student at Braude College (Karmiel, Israel). Knows Python and C. New to JavaScript/React, web backends, Docker.
- This is a portfolio project for the CV (1–2 weeks of work). The user must be able to explain every part in a job interview.

## How to work with the user
- Communicate in Hebrew. Keep Hebrew text right-to-left friendly: start lines with Hebrew, put English terms in `code` or in separate table cells, avoid mixing languages mid-sentence when possible.
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
