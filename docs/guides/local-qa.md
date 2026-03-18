# Local QA for Mini App

## What works now

You can run the Mini App in a browser-like QA mode through Playwright without opening real Telegram.
This is the safest way to check screens, buttons, and regressions locally because the suite already mocks:

- Telegram WebApp environment
- Telegram auth request
- page-specific API responses

## Quick commands

From `frontend/`:

- `npm run qa:booking` — opens a headed browser and runs the manual booking regression
- `npm run qa:smoke` — opens a headed browser and runs the booking + rebooking smoke flows
- `npm run test:e2e:ui` — opens Playwright UI so you can rerun flows interactively

## Recommended workflow

1. Start with `npm run qa:booking` after any changes around calendar or booking creation.
2. Run `npm run qa:smoke` before deploy when touching calendar, rebooking, or auth-adjacent UI.
3. Use `npm run test:e2e:ui` when you want to inspect the page visually and rerun specific specs.

## Why not open plain localhost directly?

The Mini App expects Telegram WebApp context and Telegram-based auth.
A normal browser tab does not provide those values, so the app blocks access by design.

For true plain-browser manual exploration, the next step would be a dedicated localhost-only dev auth mode.
That is intentionally not enabled yet because it changes runtime auth behavior.

## Current critical regression covered

`frontend/e2e/manual-booking.spec.ts` verifies that:

- the master cannot confirm a booking until a client is chosen
- the booking request includes `clientId`
- the success alert appears after a valid manual booking
