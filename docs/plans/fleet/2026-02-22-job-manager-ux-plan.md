# Job Manager UX Enhancement Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Enhance the Fleet UI with site identity badges, keyboard navigation, toast notifications, contextual help tooltips, inline form validation, and improved error display.

**Architecture:** Direct enhancement of existing components. Four new shared components/hooks (`SiteBadge`, `HelpTooltip`, `useKeyboardNav`, `useValidation`) plus `sonner` toast library. All changes are additive — no existing APIs or data structures change.

**Tech Stack:** React 19, Next.js 16, shadcn/ui, Radix UI, Tailwind CSS 4, sonner, lucide-react

---

### Task 1: Install sonner dependency

**Files:**
- Modify: `package.json`

**Step 1: Install sonner**

Run: `cd /Users/avielpoliak/nanoclaw/fleet && npm install sonner`

**Step 2: Verify installation**

Run: `cd /Users/avielpoliak/nanoclaw/fleet && node -e "require('sonner')"`
Expected: No error

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add package.json package-lock.json
git commit -m "chore: add sonner toast library"
```

---

### Task 2: Create SiteBadge component

**Files:**
- Create: `src/components/ui/site-badge.tsx`

**Step 1: Create the SiteBadge component**

```tsx
// src/components/ui/site-badge.tsx
"use client";

import { ParkingCircle, Scale, Building2 } from "lucide-react";
import { cn } from "@/lib/utils";

const SITE_CONFIG: Record<string, { icon: typeof ParkingCircle; classes: string }> = {
  metropark: {
    icon: ParkingCircle,
    classes: "bg-blue-100 text-blue-700 dark:bg-blue-950 dark:text-blue-300",
  },
  mileon: {
    icon: Scale,
    classes: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  },
  lola: {
    icon: Scale,
    classes: "bg-purple-100 text-purple-700 dark:bg-purple-950 dark:text-purple-300",
  },
};

const DEFAULT_CONFIG = {
  icon: Building2,
  classes: "bg-gray-100 text-gray-700 dark:bg-gray-800 dark:text-gray-300",
};

interface SiteBadgeProps {
  slug: string;
  name: string;
  className?: string;
}

export function SiteBadge({ slug, name, className }: SiteBadgeProps) {
  const config = SITE_CONFIG[slug.toLowerCase()] ?? DEFAULT_CONFIG;
  const Icon = config.icon;

  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium",
        config.classes,
        className
      )}
    >
      <Icon className="size-3" />
      {name}
    </span>
  );
}

/** Returns the accent border color for a site slug (used on site cards) */
export function siteBorderColor(slug: string): string {
  switch (slug.toLowerCase()) {
    case "metropark":
      return "border-l-blue-500";
    case "mileon":
    case "lola":
      return "border-l-purple-500";
    default:
      return "border-l-gray-400";
  }
}
```

**Step 2: Verify it compiles**

Run: `cd /Users/avielpoliak/nanoclaw/fleet && npx tsc --noEmit --strict src/components/ui/site-badge.tsx 2>&1 | head -20`

Note: If tsc flags import paths, just ensure the file has no syntax errors. The full build will validate aliases.

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/ui/site-badge.tsx
git commit -m "feat: add SiteBadge component with per-site colors and icons"
```

---

### Task 3: Create HelpTooltip component

**Files:**
- Create: `src/components/ui/help-tooltip.tsx`

**Step 1: Create the HelpTooltip component**

```tsx
// src/components/ui/help-tooltip.tsx
"use client";

import { Info } from "lucide-react";
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip";

interface HelpTooltipProps {
  text: string;
}

export function HelpTooltip({ text }: HelpTooltipProps) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Info className="inline size-3.5 text-muted-foreground cursor-help shrink-0" />
      </TooltipTrigger>
      <TooltipContent className="max-w-[280px] text-xs">
        {text}
      </TooltipContent>
    </Tooltip>
  );
}
```

**Step 2: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/ui/help-tooltip.tsx
git commit -m "feat: add HelpTooltip component for contextual help"
```

---

### Task 4: Create useKeyboardNav hook + shortcut help dialog

**Files:**
- Create: `src/hooks/use-keyboard-nav.ts`
- Create: `src/components/layout/keyboard-help.tsx`

**Step 1: Create the keyboard navigation hook**

```ts
// src/hooks/use-keyboard-nav.ts
"use client";

import { useEffect, useState, useCallback } from "react";
import { useRouter } from "next/navigation";

const NAV_KEYS: Record<string, string> = {
  d: "/dashboard",
  j: "/jobs",
  s: "/sites",
  t: "/settings",
};

function isInputFocused(): boolean {
  const el = document.activeElement;
  if (!el) return false;
  const tag = el.tagName.toLowerCase();
  return tag === "input" || tag === "textarea" || tag === "select" || (el as HTMLElement).isContentEditable;
}

export function useKeyboardNav(onToggleHelp: () => void) {
  const router = useRouter();
  const [pending, setPending] = useState(false);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (isInputFocused()) return;

      if (e.key === "?") {
        e.preventDefault();
        onToggleHelp();
        return;
      }

      if (e.key === "g" && !pending) {
        setPending(true);
        return;
      }

      if (pending) {
        setPending(false);
        const path = NAV_KEYS[e.key];
        if (path) {
          e.preventDefault();
          router.push(path);
        }
      }
    },
    [pending, router, onToggleHelp]
  );

  // Reset pending state after 500ms timeout
  useEffect(() => {
    if (!pending) return;
    const timer = setTimeout(() => setPending(false), 500);
    return () => clearTimeout(timer);
  }, [pending]);

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  return { pending };
}
```

**Step 2: Create the keyboard help dialog component**

```tsx
// src/components/layout/keyboard-help.tsx
"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const SHORTCUTS = [
  { keys: "g → d", description: "Go to Dashboard" },
  { keys: "g → j", description: "Go to Jobs" },
  { keys: "g → s", description: "Go to Sites" },
  { keys: "g → t", description: "Go to Settings" },
  { keys: "?", description: "Toggle this help" },
];

interface KeyboardHelpProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function KeyboardHelp({ open, onOpenChange }: KeyboardHelpProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Keyboard Shortcuts</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {SHORTCUTS.map((s) => (
            <div key={s.keys} className="flex items-center justify-between text-sm">
              <span className="text-muted-foreground">{s.description}</span>
              <kbd className="rounded border bg-muted px-1.5 py-0.5 text-xs font-mono">
                {s.keys}
              </kbd>
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
}
```

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/hooks/use-keyboard-nav.ts src/components/layout/keyboard-help.tsx
git commit -m "feat: add keyboard navigation hook and help dialog"
```

---

### Task 5: Create useValidation hook

**Files:**
- Create: `src/hooks/use-validation.ts`

**Step 1: Create the validation hook**

```ts
// src/hooks/use-validation.ts
"use client";

import { useState, useCallback } from "react";

type ValidationRule = (value: unknown) => string | null;

export type ValidationRules = Record<string, ValidationRule>;

export function useValidation(rules: ValidationRules) {
  const [errors, setErrors] = useState<Record<string, string>>({});

  const validateField = useCallback(
    (field: string, value: unknown): boolean => {
      const rule = rules[field];
      if (!rule) return true;
      const error = rule(value);
      setErrors((prev) => {
        if (error) return { ...prev, [field]: error };
        const next = { ...prev };
        delete next[field];
        return next;
      });
      return !error;
    },
    [rules]
  );

  const validate = useCallback(
    (data: Record<string, unknown>): boolean => {
      const newErrors: Record<string, string> = {};
      for (const [field, rule] of Object.entries(rules)) {
        const error = rule(data[field]);
        if (error) newErrors[field] = error;
      }
      setErrors(newErrors);
      if (Object.keys(newErrors).length > 0) {
        // Scroll to first error
        const firstKey = Object.keys(newErrors)[0];
        const el = document.getElementById(firstKey);
        el?.scrollIntoView({ behavior: "smooth", block: "center" });
        el?.focus();
      }
      return Object.keys(newErrors).length === 0;
    },
    [rules]
  );

  const clearError = useCallback((field: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[field];
      return next;
    });
  }, []);

  return { errors, validate, validateField, clearError };
}

// --- Common validation rules ---

export function required(label: string): ValidationRule {
  return (v) => (v ? null : `${label} is required`);
}

export function minLength(label: string, min: number): ValidationRule {
  return (v) => {
    const s = String(v ?? "");
    return s.length >= min ? null : `${label} must be at least ${min} characters`;
  };
}

export function maxLength(label: string, max: number): ValidationRule {
  return (v) => {
    const s = String(v ?? "");
    return s.length <= max ? null : `${label} must be at most ${max} characters`;
  };
}

export function pattern(label: string, re: RegExp, hint: string): ValidationRule {
  return (v) => {
    const s = String(v ?? "");
    return re.test(s) ? null : `${label}: ${hint}`;
  };
}

export function compose(...fns: ValidationRule[]): ValidationRule {
  return (v) => {
    for (const fn of fns) {
      const err = fn(v);
      if (err) return err;
    }
    return null;
  };
}

export function isEmail(label: string): ValidationRule {
  return pattern(label, /^[^\s@]+@[^\s@]+\.[^\s@]+$/, "must be a valid email");
}

export function isUrl(label: string): ValidationRule {
  return pattern(label, /^https?:\/\/.+/, "must be a valid URL starting with http(s)://");
}

export function isIsraeliId(label: string): ValidationRule {
  return compose(
    required(label),
    pattern(label, /^\d{9}$/, "must be exactly 9 digits")
  );
}

export function isIsraeliPhone(label: string): ValidationRule {
  return compose(
    required(label),
    pattern(label, /^05\d{8}$/, "must be Israeli mobile (05XXXXXXXX)")
  );
}
```

**Step 2: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/hooks/use-validation.ts
git commit -m "feat: add useValidation hook with common validation rules"
```

---

### Task 6: Wire Toaster + keyboard nav into layout and providers

**Files:**
- Modify: `src/components/layout/providers.tsx` (add Toaster, KeyboardHelp, useKeyboardNav, pending indicator)
- Modify: `src/components/layout/header.tsx` (add keyboard help button)

**Step 1: Update providers.tsx**

Replace the entire content of `src/components/layout/providers.tsx` with:

```tsx
"use client";

import { useState } from "react";
import { ThemeProvider } from "next-themes";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import { useKeyboardNav } from "@/hooks/use-keyboard-nav";
import { KeyboardHelp } from "@/components/layout/keyboard-help";

export function Providers({ children }: { children: React.ReactNode }) {
  const [helpOpen, setHelpOpen] = useState(false);
  const { pending } = useKeyboardNav(() => setHelpOpen((v) => !v));

  return (
    <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
      <TooltipProvider>
        {children}
        <Toaster position="bottom-right" richColors closeButton visibleToasts={3} />
        <KeyboardHelp open={helpOpen} onOpenChange={setHelpOpen} />
        {pending && (
          <div className="fixed bottom-4 left-4 z-50 rounded-md bg-foreground/90 px-2 py-1 text-xs text-background">
            g...
          </div>
        )}
      </TooltipProvider>
    </ThemeProvider>
  );
}
```

**Step 2: Update header.tsx — add keyboard help button**

In `src/components/layout/header.tsx`, add import for `Keyboard` icon:

Change line 5 from:
```tsx
import { Sun, Moon } from "lucide-react";
```
to:
```tsx
import { Sun, Moon, Keyboard } from "lucide-react";
```

Then add a `KeyboardHintButton` component after the `ThemeToggle` function (after line 50), and add it to the header between the HealthDot and the Separator:

Add after the `ThemeToggle` function:
```tsx
function KeyboardHintButton() {
  return (
    <Button
      variant="ghost"
      size="icon"
      onClick={() => window.dispatchEvent(new KeyboardEvent("keydown", { key: "?" }))}
      aria-label="Keyboard shortcuts"
      title="Keyboard shortcuts (?)"
    >
      <Keyboard className="h-4 w-4" />
    </Button>
  );
}
```

Then in the `Header` function, insert `<KeyboardHintButton />` between `<HealthDot />` and the `<Separator>`:

Change lines 66-68 from:
```tsx
      <div className="flex items-center gap-3">
        <HealthDot />
        <Separator orientation="vertical" className="h-5" />
```
to:
```tsx
      <div className="flex items-center gap-3">
        <HealthDot />
        <KeyboardHintButton />
        <Separator orientation="vertical" className="h-5" />
```

**Step 3: Verify build**

Run: `cd /Users/avielpoliak/nanoclaw/fleet && npm run build 2>&1 | tail -20`

**Step 4: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/layout/providers.tsx src/components/layout/header.tsx
git commit -m "feat: wire toast notifications and keyboard navigation into layout"
```

---

### Task 7: Integrate SiteBadge into jobs table and job detail

**Files:**
- Modify: `src/components/jobs/jobs-table.tsx`
- Modify: `src/components/jobs/job-detail.tsx`

**Step 1: Update jobs-table.tsx**

Add import at top (after line 37):
```tsx
import { SiteBadge } from "@/components/ui/site-badge";
```

Replace line 167:
```tsx
                  <Badge variant="outline">{job.site.name}</Badge>
```
with:
```tsx
                  <SiteBadge slug={job.site.slug} name={job.site.name} />
```

**Step 2: Update job-detail.tsx**

Add import at top (after line 9):
```tsx
import { SiteBadge } from "@/components/ui/site-badge";
```

Replace line 132:
```tsx
            <Row label="Site" value={<Badge variant="outline">{job.site.name}</Badge>} />
```
with:
```tsx
            <Row label="Site" value={<SiteBadge slug={job.site.slug} name={job.site.name} />} />
```

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/jobs/jobs-table.tsx src/components/jobs/job-detail.tsx
git commit -m "feat: use SiteBadge in jobs table and job detail"
```

---

### Task 8: Integrate SiteBadge into site cards

**Files:**
- Modify: `src/components/sites/site-card.tsx`

**Step 1: Update site-card.tsx**

Replace import line 7:
```tsx
import { Globe, Building2 } from "lucide-react";
```
with:
```tsx
import { Globe, Building2 } from "lucide-react";
import { SiteBadge, siteBorderColor } from "@/components/ui/site-badge";
```

Add `slug` field to the `SiteCardProps` site interface — change the `site` type (currently the `site` object in the interface doesn't have `slug`). Add it:

In the interface at line 9-20, the `site` object needs a `slug` field. Add `slug: string;` after `name: string;` (line 12):

```
    slug: string;
```

Delete the `typeBadgeVariant` function (lines 34-44) — it's replaced by SiteBadge.

In the Card component (line 52), add the left border accent:
Change:
```tsx
      <Card className="transition-shadow hover:shadow-md cursor-pointer">
```
to:
```tsx
      <Card className={`transition-shadow hover:shadow-md cursor-pointer border-l-4 ${siteBorderColor(site.slug)}`}>
```

Replace line 76:
```tsx
            <Badge variant={typeBadgeVariant(site.type)}>{site.type}</Badge>
```
with:
```tsx
            <SiteBadge slug={site.slug} name={site.type} />
```

**Step 2: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/sites/site-card.tsx
git commit -m "feat: use SiteBadge and accent border on site cards"
```

---

### Task 9: Add toast notifications to job actions

**Files:**
- Modify: `src/components/jobs/job-actions.tsx`

**Step 1: Update job-actions.tsx**

Add import at top (after line 6):
```tsx
import { toast } from "sonner";
```

Replace the `handleAction` function (lines 21-37) with:

```tsx
  async function handleAction(action: "retry" | "cancel") {
    setLoading(action);
    try {
      const res = await fetch(`/api/jobs/${jobId}/${action}`, {
        method: "POST",
      });
      if (!res.ok) {
        const body = await res.json();
        throw new Error(body.error?.message || `Failed to ${action}`);
      }
      if (action === "retry") {
        toast.success(`Job ${jobId.slice(0, 8)} queued for retry`);
      } else {
        toast.info(`Job ${jobId.slice(0, 8)} cancelled`);
      }
      onMutate?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to ${action}`;
      toast.error(`Failed to ${action} job: ${msg}`);
    } finally {
      setLoading(null);
    }
  }
```

**Step 2: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/jobs/job-actions.tsx
git commit -m "feat: add toast notifications to job retry/cancel actions"
```

---

### Task 10: Add toast notifications to all settings pages

**Files:**
- Modify: `src/components/settings/general-settings.tsx`
- Modify: `src/components/settings/circuit-breaker-settings.tsx`
- Modify: `src/components/settings/notification-settings.tsx`
- Modify: `src/components/settings/guardrails.tsx`

**Step 1: Update general-settings.tsx**

Add import after line 10:
```tsx
import { toast } from "sonner";
```

Replace the `handleSave` function (lines 62-75):
```tsx
  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        maxConcurrentJobs,
        defaultTimeout,
        rateLimitPerSite,
        retryEnabled,
        piiEncryptionEnabled,
      });
      toast.success("Settings saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save settings: ${msg}`);
    } finally {
      setSaving(false);
    }
  }
```

**Step 2: Update circuit-breaker-settings.tsx**

Add import after line 10:
```tsx
import { toast } from "sonner";
```

Replace the `handleSave` function (lines 35-48):
```tsx
  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        circuitBreaker: {
          failureThreshold,
          resetTimeout,
          halfOpenMaxProbes,
        },
      });
      toast.success("Circuit breaker settings saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save settings: ${msg}`);
    } finally {
      setSaving(false);
    }
  }
```

**Step 3: Update notification-settings.tsx**

Add import after line 11:
```tsx
import { toast } from "sonner";
```

Replace the `handleSave` function (lines 38-52):
```tsx
  async function handleSave() {
    setSaving(true);
    try {
      await onSave({
        notifications: {
          webhookUrl,
          digestEmail,
          webhookEnabled,
          digestEnabled,
        },
      });
      toast.success("Notification settings saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save settings: ${msg}`);
    } finally {
      setSaving(false);
    }
  }
```

**Step 4: Update guardrails.tsx**

Add import after line 24:
```tsx
import { toast } from "sonner";
```

Replace the `doSave` function (lines 71-80):
```tsx
  async function doSave(updates: Record<string, unknown>) {
    setSaving(true);
    try {
      await onSave(updates);
      toast.success("Guardrail settings saved");
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Unknown error";
      toast.error(`Failed to save settings: ${msg}`);
    } finally {
      setSaving(false);
      setShowConfirm(false);
      setPendingUpdates(null);
    }
  }
```

**Step 5: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/settings/general-settings.tsx src/components/settings/circuit-breaker-settings.tsx src/components/settings/notification-settings.tsx src/components/settings/guardrails.tsx
git commit -m "feat: add toast notifications to all settings save actions"
```

---

### Task 11: Add HelpTooltips to Jobs page

**Files:**
- Modify: `src/components/jobs/jobs-filters.tsx`
- Modify: `src/components/jobs/jobs-table.tsx`

**Step 1: Update jobs-filters.tsx**

Add import after line 20:
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

Add a HelpTooltip next to the Status dropdown button text. Change line 107:
```tsx
            Status
```
to:
```tsx
            Status <HelpTooltip text="Filter by one or more job statuses. Jobs progress: Pending → Queued → Processing → Success/Failed" />
```

**Step 2: Update jobs-table.tsx — add HelpTooltip to Duration column**

Add import (after the SiteBadge import added in Task 7):
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

In the Duration column within `SORTABLE_COLUMNS` (line 75), we can't easily add JSX. Instead, add the tooltip in the table header rendering. After the `{label}` on line 137, add a conditional tooltip for `processingTime`:

Replace lines 133-139:
```tsx
              <button
                  onClick={() => toggleSort(key)}
                  className="inline-flex items-center hover:text-foreground"
                >
                  {label}
                  <SortIcon column={key} />
                </button>
```
with:
```tsx
              <button
                  onClick={() => toggleSort(key)}
                  className="inline-flex items-center gap-1 hover:text-foreground"
                >
                  {label}
                  {key === "processingTime" && (
                    <HelpTooltip text="Total processing time from first attempt start to completion" />
                  )}
                  <SortIcon column={key} />
                </button>
```

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/jobs/jobs-filters.tsx src/components/jobs/jobs-table.tsx
git commit -m "feat: add help tooltips to jobs table and filters"
```

---

### Task 12: Add HelpTooltips to Job Detail page

**Files:**
- Modify: `src/components/jobs/job-detail.tsx`

**Step 1: Add HelpTooltip import**

Add after the SiteBadge import:
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

**Step 2: Add tooltips to specific rows**

Change the Attempts row (lines 111-114):
```tsx
            <Row
              label="Attempts"
              value={`${job.attempts}/${job.maxAttempts}`}
            />
```
to:
```tsx
            <Row
              label={<span className="flex items-center gap-1">Attempts <HelpTooltip text="Number of times this job has been attempted (including retries)" /></span>}
              value={`${job.attempts}/${job.maxAttempts}`}
            />
```

Change the CAPTCHA Cost row (lines 121-123):
```tsx
            {job.captchaCost != null && (
              <Row label="CAPTCHA Cost" value={`$${job.captchaCost.toFixed(3)}`} />
            )}
```
to:
```tsx
            {job.captchaCost != null && (
              <Row label={<span className="flex items-center gap-1">CAPTCHA Cost <HelpTooltip text="Amount charged by 2captcha for solving this job's CAPTCHA" /></span>} value={`$${job.captchaCost.toFixed(3)}`} />
            )}
```

Add tooltip to error guidance section. Change line 162-164:
```tsx
            {errorGuidance[job.error.code] && (
              <p className="text-muted-foreground italic">
                {errorGuidance[job.error.code]}
```
to:
```tsx
            {errorGuidance[job.error.code] && (
              <p className="text-muted-foreground italic flex items-start gap-1">
                <HelpTooltip text="Suggested next steps based on the error type" />
                {errorGuidance[job.error.code]}
```

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/jobs/job-detail.tsx
git commit -m "feat: add help tooltips to job detail page"
```

---

### Task 13: Add HelpTooltips to Sites page

**Files:**
- Modify: `src/components/sites/site-health.tsx`

**Step 1: Add import**

Add after line 12:
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

**Step 2: Add tooltip to health section label**

Change line 82:
```tsx
        <CardTitle className="text-base">Health Status</CardTitle>
```
to:
```tsx
        <CardTitle className="text-base flex items-center gap-1">Health Status <HelpTooltip text="Green: healthy, Yellow: degraded (some failures), Red: unhealthy (circuit breaker open)" /></CardTitle>
```

Change line 117:
```tsx
            <p className="text-xs text-muted-foreground">Circuit Breaker</p>
```
to:
```tsx
            <p className="text-xs text-muted-foreground flex items-center gap-1">Circuit Breaker <HelpTooltip text="Automatically stops sending requests to a failing site. Resets after the configured timeout." /></p>
```

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/sites/site-health.tsx
git commit -m "feat: add help tooltips to site health section"
```

---

### Task 14: Add HelpTooltips to Settings pages

**Files:**
- Modify: `src/components/settings/general-settings.tsx`
- Modify: `src/components/settings/guardrails.tsx`

**Step 1: Update general-settings.tsx**

Add import after the toast import:
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

Change line 129-131 (Auto-Retry label area):
```tsx
            <Label>Auto-Retry Enabled</Label>
            <p className="text-xs text-muted-foreground">
              Automatically retry failed jobs
```
to:
```tsx
            <Label className="flex items-center gap-1">Auto-Retry Enabled <HelpTooltip text="Automatically retry failed jobs up to the configured max attempts" /></Label>
            <p className="text-xs text-muted-foreground">
              Automatically retry failed jobs
```

Change line 111 (Rate Limit label):
```tsx
            <Label htmlFor="rateLimit">Rate Limit Per Site</Label>
```
to:
```tsx
            <Label htmlFor="rateLimit" className="flex items-center gap-1">Rate Limit Per Site <HelpTooltip text="Maximum appeals submitted per minute per site" /></Label>
```

**Step 2: Update guardrails.tsx**

Add import after the toast import:
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

Change line 137 (Auto-Pause label):
```tsx
              <Label>Auto-Pause Threshold (Failure Rate %)</Label>
```
to:
```tsx
              <Label className="flex items-center gap-1">Auto-Pause Threshold (Failure Rate %) <HelpTooltip text="Pause all jobs if the failure rate exceeds this percentage" /></Label>
```

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/settings/general-settings.tsx src/components/settings/guardrails.tsx
git commit -m "feat: add help tooltips to settings pages"
```

---

### Task 15: Add HelpTooltip to Dashboard + Test page

**Files:**
- Modify: `src/components/dashboard/kpi-cards.tsx`
- Modify: `src/components/test/test-form.tsx`

**Step 1: Update kpi-cards.tsx**

Add import after line 16:
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

Change the Success Rate card label (line 129):
```tsx
      label: "Success Rate",
```
to:
```tsx
      label: "Success Rate ⓘ",
```

Actually, since `label` is a string and `KpiCard` renders it as text, let's update the `KpiCardProps` to accept `ReactNode` for label.

Change the `KpiCardProps` interface (line 19):
```tsx
  label: string;
```
to:
```tsx
  label: React.ReactNode;
```

Then change line 129:
```tsx
      label: "Success Rate",
```
to:
```tsx
      label: <span className="flex items-center gap-1">Success Rate <HelpTooltip text="Percentage of completed jobs that resulted in a successful appeal submission" /></span>,
```

**Step 2: Update test-form.tsx**

Add import after line 12:
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
```

Change line 179 (Stop Before Submit label):
```tsx
              <Label htmlFor="stopBeforeSubmit" className="font-medium">Stop Before Submit</Label>
```
to:
```tsx
              <Label htmlFor="stopBeforeSubmit" className="font-medium flex items-center gap-1">Stop Before Submit <HelpTooltip text="Run the full flow but halt before the final submit — useful for dry runs" /></Label>
```

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/dashboard/kpi-cards.tsx src/components/test/test-form.tsx
git commit -m "feat: add help tooltips to dashboard and test page"
```

---

### Task 16: Add inline validation to test form

**Files:**
- Modify: `src/components/test/test-form.tsx`

**Step 1: Add validation imports and rules**

Add import after the HelpTooltip import:
```tsx
import {
  useValidation,
  compose,
  required,
  minLength,
  maxLength,
  isEmail,
  isIsraeliId,
  isIsraeliPhone,
  type ValidationRules,
} from "@/hooks/use-validation";
```

Add validation rules constant before the `TestForm` component (after DEFAULTS, around line 37):
```tsx
const VALIDATION_RULES: ValidationRules = {
  siteSlug: required("Site"),
  authorityId: required("Authority"),
  reportNumber: compose(required("Report Number"), minLength("Report Number", 4), maxLength("Report Number", 20)),
  vehicleNumber: compose(required("Vehicle Plate"), minLength("Vehicle Plate", 5), maxLength("Vehicle Plate", 10)),
  idNumber: isIsraeliId("Owner ID"),
  phone: isIsraeliPhone("Phone"),
  email: compose(required("Email"), isEmail("Email")),
  firstName: required("First Name"),
  lastName: required("Last Name"),
};
```

**Step 2: Wire validation into TestForm**

Inside `TestForm`, after `const [form, setForm] = useState(DEFAULTS);` (line 40), add:
```tsx
  const { errors, validate, clearError } = useValidation(VALIDATION_RULES);
```

Change the `update` function to clear errors on change:
```tsx
  function update(field: string, value: string | boolean) {
    setForm((prev) => ({ ...prev, [field]: value }));
    clearError(field);
  }
```

Change `handleSubmit` to validate before running:
```tsx
  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!validate(form)) return;
    onRun(form);
  }
```

**Step 3: Add error display to each input**

For each validated field, add an error message below the Input. The pattern is to add after each `<Input>`:

```tsx
{errors.fieldName && <p className="text-xs text-destructive">{errors.fieldName}</p>}
```

And add `border-destructive` class to inputs with errors:

For example, the Report Number input (line 108):
```tsx
              <Input id="reportNumber" value={form.reportNumber} onChange={(e) => update("reportNumber", e.target.value)} className={errors.reportNumber ? "border-destructive" : ""} />
              {errors.reportNumber && <p className="text-xs text-destructive">{errors.reportNumber}</p>}
```

Apply the same pattern to: `vehicleNumber`, `idNumber`, `firstName`, `lastName`, `phone`, `email`.

**Step 4: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/test/test-form.tsx
git commit -m "feat: add inline validation to test form"
```

---

### Task 17: Add validation to notification settings

**Files:**
- Modify: `src/components/settings/notification-settings.tsx`

**Step 1: Add imports**

Add after the toast import:
```tsx
import { HelpTooltip } from "@/components/ui/help-tooltip";
import { useValidation, isUrl, isEmail, type ValidationRules } from "@/hooks/use-validation";
```

**Step 2: Add validation inside the component**

Inside `NotificationSettings`, after the state declarations (after line 26), add:
```tsx
  const rules: ValidationRules = {
    ...(webhookEnabled ? { webhookUrl: isUrl("Webhook URL") } : {}),
    ...(digestEnabled ? { digestEmail: isEmail("Digest Email") } : {}),
  };
  const { errors, validate, clearError } = useValidation(rules);
```

Update `setWebhookUrl` and `setDigestEmail` handlers to clear errors:

Change the webhook URL input (line 84):
```tsx
                onChange={(e) => setWebhookUrl(e.target.value)}
```
to:
```tsx
                onChange={(e) => { setWebhookUrl(e.target.value); clearError("webhookUrl"); }}
```

Add error display after the webhook URL input (after line 85):
```tsx
              {errors.webhookUrl && <p className="text-xs text-destructive">{errors.webhookUrl}</p>}
```

Same for digest email input (line 113):
```tsx
                onChange={(e) => setDigestEmail(e.target.value)}
```
to:
```tsx
                onChange={(e) => { setDigestEmail(e.target.value); clearError("digestEmail"); }}
```

Add error after digest email input:
```tsx
              {errors.digestEmail && <p className="text-xs text-destructive">{errors.digestEmail}</p>}
```

Update `handleSave` to validate first:
```tsx
  async function handleSave() {
    if (!validate({ webhookUrl, digestEmail })) return;
    setSaving(true);
    // ... rest of function
```

**Step 3: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/settings/notification-settings.tsx
git commit -m "feat: add inline validation to notification settings"
```

---

### Task 18: Improve error display on job detail page

**Files:**
- Modify: `src/components/jobs/job-detail.tsx`

**Step 1: Expand errorGuidance map**

Add new entries after `CRAWLER_ERROR` (after line 71):
```tsx
  TIMEOUT:
    "The site took too long to respond. Try again during off-peak hours.",
  VALIDATION_ERROR:
    "The submitted data was rejected by the site. Check the appeal details.",
  NETWORK_ERROR:
    "Network connectivity issue. Check your connection and retry.",
  ALREADY_SUBMITTED:
    "An appeal was already submitted for this ticket.",
```

**Step 2: Add error severity classification**

Add a helper function after `errorGuidance` (before the `JobDetail` component):
```tsx
const FATAL_ERRORS = new Set(["BOT_DETECTED", "CAPTCHA_ERROR", "ALREADY_SUBMITTED"]);

function errorSeverityBorder(code: string): string {
  return FATAL_ERRORS.has(code) ? "border-l-4 border-l-red-500" : "border-l-4 border-l-yellow-500";
}
```

**Step 3: Add status banner at top of detail page**

After the header section (after line 92), add:
```tsx
      {/* Status banner */}
      {job.status === "SUCCESS" && (
        <div className="rounded-md bg-green-50 dark:bg-green-950 border border-green-200 dark:border-green-800 px-4 py-3 text-sm text-green-800 dark:text-green-200">
          Appeal submitted successfully
          {job.result?.referenceNumber && ` — Reference: ${job.result.referenceNumber}`}
        </div>
      )}
      {job.status === "FAILED" && (
        <div className="rounded-md bg-red-50 dark:bg-red-950 border border-red-200 dark:border-red-800 px-4 py-3 text-sm text-red-800 dark:text-red-200">
          Job failed after {job.attempts} attempt{job.attempts !== 1 ? "s" : ""}
          {job.failureReason && ` — ${job.failureReason}`}
        </div>
      )}
      {["PROCESSING", "QUEUED"].includes(job.status) && (
        <div className="rounded-md bg-blue-50 dark:bg-blue-950 border border-blue-200 dark:border-blue-800 px-4 py-3 text-sm text-blue-800 dark:text-blue-200">
          Job is {job.status.toLowerCase()}...
        </div>
      )}
      {job.status === "PENDING" && (
        <div className="rounded-md bg-yellow-50 dark:bg-yellow-950 border border-yellow-200 dark:border-yellow-800 px-4 py-3 text-sm text-yellow-800 dark:text-yellow-200">
          Job is pending
          {job.scheduledFor && ` — scheduled ${job.scheduledFor}`}
        </div>
      )}
```

**Step 4: Update error card with severity border and actionable buttons**

Replace the error card section (lines 152-168):
```tsx
      {/* Error guidance for failed jobs */}
      {job.status === "FAILED" && job.error && (
        <Card className="border-destructive">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-medium text-destructive">
              Error: {job.error.code}
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{job.error.message}</p>
            {errorGuidance[job.error.code] && (
              <p className="text-muted-foreground italic">
                {errorGuidance[job.error.code]}
              </p>
            )}
          </CardContent>
        </Card>
      )}
```

with:

```tsx
      {/* Error guidance for failed jobs */}
      {job.status === "FAILED" && job.error && (
        <Card className={`border-destructive ${errorSeverityBorder(job.error.code)}`}>
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-sm font-medium text-destructive">
                Error: {job.error.code}
              </CardTitle>
              <div className="flex gap-2">
                {job.error.retryable && (
                  <JobActions jobId={job.id} status={job.status} onMutate={onMutate} />
                )}
              </div>
            </div>
          </CardHeader>
          <CardContent className="space-y-2 text-sm">
            <p>{job.error.message}</p>
            {errorGuidance[job.error.code] && (
              <p className="text-muted-foreground italic flex items-start gap-1">
                <HelpTooltip text="Suggested next steps based on the error type" />
                {errorGuidance[job.error.code]}
              </p>
            )}
          </CardContent>
        </Card>
      )}
```

**Step 5: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/jobs/job-detail.tsx
git commit -m "feat: improve error display with severity indicators, status banner, and actionable buttons"
```

---

### Task 19: Add toast to test progress completion

**Files:**
- Modify: `src/components/test/test-progress.tsx`

**Step 1: Add toast import and effect**

Add import after line 9:
```tsx
import { toast } from "sonner";
```

Add `useEffect` import — change line 4:
```tsx
import { Badge } from "@/components/ui/badge";
```
Wait, we need to add useEffect. Add to the top:
```tsx
import { useEffect, useRef } from "react";
```

Inside the `TestProgress` component, after `const progress = data?.data;` (line 41), add:
```tsx
  const prevStatusRef = useRef<string | null>(null);
  useEffect(() => {
    if (!progress) return;
    if (prevStatusRef.current === progress.status) return;
    prevStatusRef.current = progress.status;
    if (progress.status === "SUCCESS") {
      toast.success("Test completed successfully");
    } else if (progress.status === "FAILED") {
      toast.error("Test failed");
    }
  }, [progress]);
```

**Step 2: Commit**

```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add src/components/test/test-progress.tsx
git commit -m "feat: add toast notification on test completion"
```

---

### Task 20: Final build verification

**Step 1: Run full build**

Run: `cd /Users/avielpoliak/nanoclaw/fleet && npm run build 2>&1 | tail -30`

Expected: Build succeeds with no errors.

**Step 2: Run tests**

Run: `cd /Users/avielpoliak/nanoclaw/fleet && npm run test 2>&1 | tail -30`

Expected: All existing tests pass. (No new tests added — this is a UI-only enhancement with no new business logic.)

**Step 3: Fix any issues**

If build or tests fail, fix the issues and commit the fixes.

**Step 4: Final commit if needed**

If any fixups were needed:
```bash
cd /Users/avielpoliak/nanoclaw/fleet
git add -A
git commit -m "fix: resolve build issues from UX enhancement"
```
