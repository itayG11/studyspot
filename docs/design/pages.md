# Pages

Every page of the web app, who can open it, and what it does. The routes are defined in `frontend/src/router.tsx`. Every page is loaded only when someone opens it (lazy loading), so the first script stays small.

On a phone, the home page, `/me` and `/institutions` also have a tab bar at the bottom (search, map, my area, and institutions for a guest). The root address `/` sends a visitor to their institution; `/signed-in` is where Google and Microsoft sign-in return to; and `/places/<id>` and `/spaces/<id>` are old addresses that redirect to the place page.

## For students and guests

| Address | Who | What it shows | What you can do |
|---|---|---|---|
| `/<institution>` | everyone | A map coloured by how full each building is, search and filters, a card for every place, and today's load for the whole campus | Search, filter, "where to study right now" |
| `/<institution>/spaces/<id>` | everyone | One place: details, opening hours, a live and a usual load chart, a small map of its building, and a seat map in computer labs | Book ahead (signed in, from the institution) |
| `/scan` | signed in | The result of scanning a code on a sign: you are checked in, or why not | Check in, check out |
| `/me` | signed in | My bookings (with "someone is in my place" when the institution takes reports), my active check-in (with "going on a break"), my waiting list, my timetable, "between classes", my calendar, notices, my password | Cancel, extend, import a timetable, delete my account |
| `/s/<token>` | anyone with the link | "I'm studying here": where, and until when | Nothing (a read-only page) |
| `/login` | guests | Google, Microsoft, an email code, a password, and a demo login | Sign in |
| `/institutions` | everyone | All institutions on the site | Go to one |

## For managers

| Address | Who | What it shows |
|---|---|---|
| `/<institution>/admin` | that institution's admin, or the system admin | Six tabs: **Setup** (sign-in rules, proving an email domain through DNS, what is missing before the start), **Printable signs** (a QR sign per place, or a screen by the door), **Place buildings** (click on the map), **Add** (a building or place by hand, or a table from Excel), **Connections** (widget, API keys, webhooks), **Staying after time** (the institution's policy, reports by place and hour, advice, open reports) |
| `/system` | the system admin only | A new institution, an invitation for its admin, sign-in rules to approve, and all institutions |
| `/invite` | whoever got an invitation link | Joining as an institution admin |
| `/screen` | a screen by the door: opened with a link that carries a token, no sign-in | A code that changes every minute, and the free places |

The files are `frontend/src/admin/AdminPage.tsx`, `frontend/src/system/SystemPage.tsx`, `frontend/src/pages/InvitePage.tsx` and `frontend/src/screen/ScreenPage.tsx`.

**Permissions.** The site hides what you may not use (`RequireAuth`, `RequireAdmin`, `RequireSystemAdmin` in `frontend/src/auth/guards.tsx`), but that is only a convenience. The real protection is on the server, on every route, and a test goes over all of them with each role (`backend/tests/test_access_matrix.py`).

## Information pages

| Address | What |
|---|---|
| `/privacy` | What is kept, why, and by whom |
| `/terms` | Terms of use |
| `/accessibility` | The accessibility statement |
| `/developers` | The API for institutions, in short |
| `/licenses` | Licenses of the libraries and fonts |
| `/unsubscribe` | Stop emails, from a signed link |

## What the pages do in each state

The texts on the site are in Hebrew; they are described here in English.

| State | What the person sees | Where |
|---|---|---|
| Loading | "Loading…", or a grey outline in the shape of the content | `frontend/src/ui/PageLoading.tsx`, `frontend/src/ui/Skeleton.tsx` |
| Empty | A heading, an explanation and the next step ("No bookings", with "Find a place") | `EmptyState` in `frontend/src/ui/States.tsx` |
| Error | A message in Hebrew chosen by the error code, and a "try again" button | `ErrorState` in `frontend/src/ui/States.tsx`, `frontend/src/i18n/errors.ts` |
| No network | The booking form asks the server again for the times, because the request may have arrived | `frontend/src/features/booking/BookingForm.tsx` |
| A page that does not exist | "Not found", inside the site's frame | `frontend/src/pages/NotFoundPage.tsx` |

**How I checked the pages.** One test (`frontend/e2e/sweep.spec.ts`) opens the main pages (14 as a guest, 6 as a student, and five of the six admin tabs (the newest, "Staying after time", has its own browser test, `frontend/e2e/overstay.spec.ts`)) on a computer, a tablet and a phone, and fails on any unexpected error. Some pages, such as `/system`, `/screen` and `/unsubscribe`, are not in it. Another (`frontend/e2e/a11y.spec.ts`) runs an accessibility scan on the main pages, in the light and the dark theme. See [Testing](testing.md).
