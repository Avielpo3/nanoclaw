# Site Settings UX Improvements — Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Make the site settings page clear and usable — fix slug URLs, add descriptions/tooltips to every section, rename circuit breaker to plain language, and add a sticky save bar.

**Architecture:** Pure frontend changes to two components. No API or backend changes.

**Tech Stack:** Next.js, React, shadcn/ui (Card, HelpTooltip, Button, Label), Tailwind CSS, lucide-react icons.

**Design doc:** `docs/plans/fleet/2026-02-22-site-settings-ux-design.md`

---

### Task 1: Fix site card URL to use slug instead of ID

**Files:**
- Modify: `src/components/sites/site-card.tsx:41`

**Step 1: Fix the Link href**

In `src/components/sites/site-card.tsx` line 41, change:
```tsx
<Link href={`/sites/${site.id}`} className="block">
```
to:
```tsx
<Link href={`/sites/${site.slug}`} className="block">
```

**Step 2: Verify in browser**

Run: `npm run dev`
Navigate to `/sites` — click a site card. URL should show `/sites/metropark` not `/sites/cmlw...`.

**Step 3: Commit**

```bash
git add src/components/sites/site-card.tsx
git commit -m "fix: use slug instead of ID in site card URLs"
```

---

### Task 2: Add section descriptions to site settings form

**Files:**
- Modify: `src/components/sites/site-settings-form.tsx`

**Step 1: Add CardDescription import**

Add `CardDescription` to the existing card import:
```tsx
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
```

**Step 2: Add description under each CardTitle**

Add a `<CardDescription>` after each `<CardTitle>` in every card:

**Trigger Mode** (after line 78):
```tsx
<CardTitle className="text-base">Trigger Mode</CardTitle>
<CardDescription>
  Controls when appeal jobs are sent to the municipal site. Immediate sends right away, Delayed adds a buffer, Windowed restricts to specific hours.
</CardDescription>
```

**Fast Retries** (after line 153):
```tsx
<CardTitle className="text-base">Fast Retries</CardTitle>
<CardDescription>
  Automatic retries handled by the job queue when a submission fails (e.g. timeout, CAPTCHA error). These happen within minutes.
</CardDescription>
```

**Scheduled Retries** (after line 196):
```tsx
<CardTitle className="text-base">Scheduled Retries</CardTitle>
<CardDescription>
  Long-term retry strategy for jobs that exhaust fast retries. Re-queues failed jobs hours or days later — useful when a site is temporarily down.
</CardDescription>
```

**Site Protection** (was "Circuit Breaker", after line 252):
```tsx
<CardTitle className="text-base">Site Protection</CardTitle>
<CardDescription>
  Automatically stops sending appeals to this site when it keeps failing. After the configured number of consecutive failures, all new jobs are paused. After the cooldown period, a single test job is sent — if it succeeds, normal processing resumes automatically.
</CardDescription>
```

**Anti-Detection** (after line 289):
```tsx
<CardTitle className="text-base">Anti-Detection</CardTitle>
<CardDescription>
  Controls how many browser sessions can run simultaneously against this site. Lower values reduce the chance of being flagged as automated traffic.
</CardDescription>
```

**Step 3: Verify in browser**

Each card should now have a muted description paragraph under the title.

**Step 4: Commit**

```bash
git add src/components/sites/site-settings-form.tsx
git commit -m "feat: add section descriptions to site settings form"
```

---

### Task 3: Add field-level HelpTooltips

**Files:**
- Modify: `src/components/sites/site-settings-form.tsx`

**Step 1: Add HelpTooltip import**

```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

**Step 2: Add tooltips to field labels**

Wrap each label with a flex container and add HelpTooltip. For each field:

**Max Retries** — change the Label:
```tsx
<Label htmlFor="maxRetries" className="flex items-center gap-1">
  Max Retries <HelpTooltip text="Maximum number of immediate retry attempts before the job is marked as failed" />
</Label>
```

**Retry Delay** — change the Label:
```tsx
<Label htmlFor="retryDelaySeconds" className="flex items-center gap-1">
  Retry Delay (seconds) <HelpTooltip text="Base wait time between retries. With backoff enabled, each retry doubles this value." />
</Label>
```

**Exponential Backoff** — change the Label:
```tsx
<Label htmlFor="useBackoff" className="flex items-center gap-1">
  Exponential Backoff <HelpTooltip text="Each retry waits 2x longer than the previous. E.g., with a 600s base delay: 1st retry at 10min, 2nd at 20min, 3rd at 40min." />
</Label>
```

**Spacing (minutes)** in windowed mode — change the Label:
```tsx
<Label htmlFor="spacingMinutes" className="flex items-center gap-1">
  Spacing (minutes) <HelpTooltip text="Minimum minutes between consecutive job submissions within the window" />
</Label>
```

**Respect Window** — change the Label:
```tsx
<Label htmlFor="respectWindow" className="flex items-center gap-1">
  Respect Window <HelpTooltip text="When enabled, scheduled retries only fire during the configured time window" />
</Label>
```

**Step 3: Verify in browser**

Hover over each info icon — tooltip should appear with the help text.

**Step 4: Commit**

```bash
git add src/components/sites/site-settings-form.tsx
git commit -m "feat: add help tooltips to site settings fields"
```

---

### Task 4: Rename Circuit Breaker to Site Protection with plain language labels

**Files:**
- Modify: `src/components/sites/site-settings-form.tsx`

**Step 1: Rename section and field labels**

The title was already changed in Task 2. Now rename the field labels and hint text.

Change "Failure Threshold" label (line 257):
```tsx
<Label htmlFor="cbFailureThreshold">Failures before pause</Label>
```

Change its hint text (line 267):
```tsx
<p className="text-xs text-muted-foreground">Consecutive failures that trigger an automatic pause</p>
```

Change "Reset Timeout (seconds)" label (line 270):
```tsx
<Label htmlFor="cbResetTimeoutSec">Cooldown period (seconds)</Label>
```

Change its hint text (line 280):
```tsx
<p className="text-xs text-muted-foreground">Wait time before sending a test job to check if the site recovered</p>
```

**Step 2: Verify in browser**

The circuit breaker card should now read "Site Protection" with the plain language labels.

**Step 3: Commit**

```bash
git add src/components/sites/site-settings-form.tsx
git commit -m "feat: rename circuit breaker to site protection with plain language"
```

---

### Task 5: Add sticky save bar with dirty detection

**Files:**
- Modify: `src/components/sites/site-settings-form.tsx`

**Step 1: Add useMemo import and dirty detection**

Update the React import:
```tsx
import { useState, useMemo } from "react";
```

Inside the component, after the `message` state, add:
```tsx
const isDirty = useMemo(
  () => JSON.stringify(config) !== JSON.stringify(initialConfig),
  [config, initialConfig]
);
```

**Step 2: Replace the bottom save section**

Remove the existing save div (the `{/* Save */}` section at the bottom, lines 308-323).

Replace with a sticky bottom bar:
```tsx
{/* Sticky Save Bar */}
{isDirty && (
  <div className="fixed bottom-0 left-0 right-0 z-50 border-t bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/80">
    <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-3">
      <p className="text-sm text-muted-foreground">You have unsaved changes</p>
      <div className="flex items-center gap-3">
        {message && (
          <p className={`text-sm ${message.type === "success" ? "text-green-600" : "text-red-600"}`}>
            {message.text}
          </p>
        )}
        <Button onClick={handleSave} disabled={saving}>
          {saving ? (
            <Loader2 className="mr-2 size-4 animate-spin" />
          ) : (
            <Save className="mr-2 size-4" />
          )}
          {saving ? "Saving..." : "Save Settings"}
        </Button>
      </div>
    </div>
  </div>
)}
```

**Step 3: Add bottom padding to the form container**

Change the outermost div from:
```tsx
<div className="space-y-6">
```
to:
```tsx
<div className="space-y-6 pb-20">
```

This prevents content from being hidden behind the sticky bar.

**Step 4: Verify in browser**

1. Navigate to a site settings page
2. Sticky bar should NOT be visible (no changes yet)
3. Change any field — sticky bar appears at bottom with "You have unsaved changes" + Save button
4. Click Save — success message appears in the bar
5. After save, if config matches initial, bar disappears

**Step 5: Commit**

```bash
git add src/components/sites/site-settings-form.tsx
git commit -m "feat: add sticky save bar with unsaved changes detection"
```

---

### Task 6: Final visual check and cleanup commit

**Step 1: Full visual walkthrough**

Run: `npm run dev`

Check each page:
1. `/sites` — cards link to `/sites/metropark` and `/sites/mileon`
2. `/sites/metropark/settings` — all 5 cards have descriptions
3. Hover tooltips on: Max Retries, Retry Delay, Exponential Backoff, Spacing, Respect Window
4. "Site Protection" section has plain language labels
5. Sticky save bar appears on change, disappears after save

**Step 2: Run lint**

```bash
npm run lint
```

Fix any issues.

**Step 3: Run tests**

```bash
npm run test
```

Fix any failures.

**Step 4: Final commit if needed**

```bash
git add -A
git commit -m "chore: lint and test fixes for site settings UX"
```
