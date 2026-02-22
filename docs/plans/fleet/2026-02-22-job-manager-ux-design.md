# Job Manager UX Enhancement Design

Date: 2026-02-22

## Overview

Enhance the Fleet service UI with better job management UX: site identity system, keyboard navigation, toast notifications, contextual help tooltips, inline form validation, and improved error display.

Approach: Direct enhancement of existing components (no wrapper layer, no feature flags).

## 1. Site Identity System

New `SiteBadge` component replacing current plain badge everywhere.

| Site | Color | Icon (lucide) | Badge Style |
|------|-------|----------------|-------------|
| Metropark | `bg-blue-100 text-blue-700` | `ParkingCircle` | Blue pill |
| Lola/Mileon | `bg-purple-100 text-purple-700` | `Scale` | Purple pill |
| Unknown/Other | `bg-gray-100 text-gray-700` | `Building2` | Gray pill |

**Usage locations:** Jobs table (Site column), Job detail (Appeal Info), Site cards, Site detail header, Jobs filters (site dropdown), Test form (site selector).

Site cards on the Sites page get a subtle left-border accent in the site's color.

## 2. Keyboard Navigation

`useKeyboardNav` hook at layout level. Two-key sequences with 500ms window.

| Shortcut | Action |
|----------|--------|
| `g` then `d` | Go to Dashboard |
| `g` then `j` | Go to Jobs |
| `g` then `s` | Go to Sites |
| `g` then `t` | Go to Settings |
| `?` | Toggle shortcut help overlay |

- Small floating "g..." indicator during pending state
- Suppressed when focus is inside input/textarea/select
- `?` opens a minimal help dialog (also accessible via keyboard icon in header)

## 3. Toast Notifications

Integrate `sonner` (shadcn-recommended) for action feedback.

| Action | Type | Example |
|--------|------|---------|
| Retry job OK | Success | "Job abc123 queued for retry" |
| Retry job fail | Error | "Failed to retry job: [message]" |
| Cancel job OK | Info | "Job abc123 cancelled" |
| Cancel job fail | Error | "Failed to cancel: [message]" |
| Save settings OK | Success | "Settings saved" |
| Save settings fail | Error | "Failed to save settings: [message]" |
| Toggle site OK | Success | "Metropark enabled/disabled" |
| API/network error | Error | "Connection error — check your network" |
| Test started | Info | "Test job created — monitoring progress" |

**Placement:** Bottom-right, auto-dismiss 4s (errors persist). Max 3 visible.

Replaces all `alert()` calls.

## 4. Contextual Help Tooltips

`HelpTooltip` component: `<HelpTooltip text="..." />` — renders 14px muted `Info` icon with Radix tooltip. Max width 280px.

| Page | Field/Section | Help Text |
|------|--------------|-----------|
| Jobs | Status filter | "Filter by one or more job statuses. Jobs progress: Pending → Queued → Processing → Success/Failed" |
| Jobs | Duration column | "Total processing time from first attempt start to completion" |
| Jobs | Deadline badge | "Days remaining until the legal deadline for appeal submission" |
| Job Detail | Error guidance | "Suggested next steps based on the error type" |
| Job Detail | CAPTCHA cost | "Amount charged by 2captcha for solving this job's CAPTCHA" |
| Job Detail | Attempts | "Number of times this job has been attempted (including retries)" |
| Sites | Health dot | "Green: healthy, Yellow: degraded, Red: unhealthy (circuit breaker open)" |
| Sites | Circuit breaker | "Automatically stops sending requests to a failing site. Resets after configured timeout." |
| Settings | Auto-retry | "Automatically retry failed jobs up to the configured max attempts" |
| Settings | Rate limit | "Maximum appeals submitted per minute per site" |
| Settings | Auto-pause threshold | "Pause all jobs if the failure rate exceeds this percentage" |
| Dashboard | Success rate | "Percentage of completed jobs that resulted in a successful appeal submission" |
| Test | Stop before submit | "Run the full flow but halt before the final submit — useful for dry runs" |

## 5. Inline Form Validation

Lightweight `useValidation` hook (no library dependency).

```
const { errors, validate, clearError } = useValidation(rules)
```

**Test Form rules:**

| Field | Rule |
|-------|------|
| Report Number | Required, alphanumeric, 4-20 chars |
| Vehicle Plate | Required, 5-10 chars |
| Owner ID | Required, exactly 9 digits (Israeli ID) |
| Phone | Required, Israeli phone (05X-XXXXXXX) |
| Email | Required, valid email |
| Name | Required |
| Site | Required |
| Authority | Required |

**Settings form rules:**

| Field | Rule |
|-------|------|
| Webhook URL | Valid URL (when enabled) |
| Digest Email | Valid email (when enabled) |
| Numeric inputs | Visual error if out of min/max range |

**Error display:** `text-sm text-destructive` below input, `border-destructive` on input. Clear on change. Scroll to first error on submit.

## 6. Improved Error Display (Job Detail)

**Error severity indicator:** Left border color — red for fatal (BOT_DETECTED, CAPTCHA_ERROR), yellow for retryable (SITE_UNAVAILABLE, CRAWLER_ERROR, REPORT_NOT_FOUND).

**Actionable buttons in error card:** "Retry Now" for retryable errors, "Clone & Edit" for report-not-found.

**Expanded error guidance:**

| Code | Guidance |
|------|----------|
| TIMEOUT | "The site took too long to respond. Try again during off-peak hours." |
| VALIDATION_ERROR | "The submitted data was rejected by the site. Check the appeal details." |
| NETWORK_ERROR | "Network connectivity issue. Check your connection and retry." |
| ALREADY_SUBMITTED | "An appeal was already submitted for this ticket." |

**Status banner:** Full-width colored banner at top of detail page — green for SUCCESS, red for FAILED, blue for PROCESSING, yellow for QUEUED/PENDING.

## Files to Create/Modify

**New files:**
- `src/components/ui/site-badge.tsx` — SiteBadge component
- `src/components/ui/help-tooltip.tsx` — HelpTooltip component
- `src/hooks/use-keyboard-nav.ts` — Keyboard navigation hook
- `src/hooks/use-validation.ts` — Form validation hook

**Modified files:**
- `src/app/layout.tsx` — Add Toaster, useKeyboardNav
- `src/components/layout/header.tsx` — Add keyboard shortcut help button
- `src/components/jobs/jobs-table.tsx` — SiteBadge, HelpTooltip
- `src/components/jobs/job-detail.tsx` — SiteBadge, HelpTooltip, improved error card, status banner
- `src/components/jobs/job-actions.tsx` — Toast on retry/cancel
- `src/components/jobs/jobs-filters.tsx` — HelpTooltip on status filter
- `src/components/sites/site-card.tsx` — SiteBadge, left-border accent
- `src/components/sites/site-health.tsx` — HelpTooltip on health/CB
- `src/components/settings/general-settings.tsx` — HelpTooltip, toast on save, validation
- `src/components/settings/circuit-breaker-settings.tsx` — HelpTooltip, toast on save
- `src/components/settings/notification-settings.tsx` — HelpTooltip, toast on save, validation
- `src/components/settings/guardrails.tsx` — HelpTooltip, toast on save
- `src/components/dashboard/kpi-cards.tsx` — HelpTooltip on success rate
- `src/components/test/test-form.tsx` — Validation, SiteBadge, toast
- `src/components/test/test-progress.tsx` — Toast on completion

**New dependency:**
- `sonner` — Toast notification library
