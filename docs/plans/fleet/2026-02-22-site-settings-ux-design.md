# Site Settings UX Improvements

**Date**: 2026-02-22

## Problems

1. Site card links use CUID IDs in URL instead of slugs
2. Settings page lacks context — fields have no explanations
3. Save button buried at bottom of long page
4. Exponential backoff toggle has no explanation
5. Scheduled Retries section unclear
6. Circuit Breaker section uses jargon, unclear purpose

## Design

### 1. Fix URL slugs

**File**: `src/components/sites/site-card.tsx` line 41

Change `<Link href={/sites/${site.id}}>` to `<Link href={/sites/${site.slug}}>`. The `[slug]` route already exists and works — the site card just links with the wrong field.

### 2. Section descriptions + field tooltips

Each card in `site-settings-form.tsx` gets a `<p>` description under the `CardTitle`:

| Section | New Description |
|---------|----------------|
| Trigger Mode | "Controls when appeal jobs are sent to the municipal site. Immediate sends right away, Delayed adds a buffer, Windowed restricts to specific hours." |
| Fast Retries | "Automatic retries handled by the job queue when a submission fails (e.g. timeout, CAPTCHA error). These happen within minutes." |
| Scheduled Retries | "Long-term retry strategy for jobs that exhaust fast retries. Re-queues failed jobs hours or days later — useful when a site is temporarily down." |
| Site Protection (was Circuit Breaker) | "Automatically stops sending appeals to this site when it keeps failing. After the configured number of consecutive failures, all new jobs are paused. After the cooldown period, a single test job is sent — if it succeeds, normal processing resumes automatically." |
| Anti-Detection | "Controls how many browser sessions can run simultaneously against this site. Lower values reduce the chance of being flagged as automated traffic." |

Field-level `HelpTooltip`s added where not obvious:

| Field | Tooltip |
|-------|---------|
| Exponential Backoff | "Each retry waits 2x longer than the previous. E.g., with a 600s base delay: 1st retry at 10min, 2nd at 20min, 3rd at 40min." |
| Max Retries | "Maximum number of immediate retry attempts before the job is marked as failed" |
| Retry Delay | "Base wait time between retries. With backoff enabled, each retry doubles this value." |
| Spacing (windowed) | "Minimum minutes between consecutive job submissions within the window" |
| Respect Window | "When enabled, scheduled retries only fire during the configured time window" |

### 3. Sticky save bar

Replace the bottom save button with a sticky bar that pins to the viewport bottom. Appears only when there are unsaved changes (dirty state = current config differs from initial). Contains:
- "You have unsaved changes" text (left)
- Save button (right)

Implementation: Compare `JSON.stringify(config)` vs `JSON.stringify(initialConfig)` for dirty detection.

### 4. Circuit Breaker → Site Protection rename

- Section title: "Circuit Breaker" → **"Site Protection"**
- "Failure Threshold" → **"Failures before pause"** — hint: "Consecutive failures that trigger an automatic pause"
- "Reset Timeout (seconds)" → **"Cooldown period (seconds)"** — hint: "Wait time before sending a test job to check if the site recovered"

## Files to modify

| File | Change |
|------|--------|
| `src/components/sites/site-card.tsx` | `site.id` → `site.slug` in Link href |
| `src/components/sites/site-settings-form.tsx` | Section descriptions, tooltips, sticky save bar, rename circuit breaker fields |

## Out of scope

- No changes to API routes or backend logic
- No changes to general-settings.tsx (separate page)
- No i18n/Hebrew — English only for now
