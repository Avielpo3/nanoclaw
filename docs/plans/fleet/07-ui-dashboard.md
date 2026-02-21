# 07 - UI Dashboard

## Tech Stack
- **Next.js 15** App Router with Server Components
- **shadcn/ui** component library (Radix UI primitives + Tailwind)
- **Tailwind CSS** for styling
- **Recharts** for charts/graphs
- **SWR** for data fetching with auto-refresh
- **Lucide React** for icons

## Layout

```
┌──────────────────────────────────────────────────────────┐
│  Fleet Service                              [user] [⚙]  │
├──────────┬───────────────────────────────────────────────┤
│          │                                               │
│  🏠 Dashboard │   [Active Tab Content Area]              │
│          │                                               │
│  📋 Jobs     │                                           │
│          │                                               │
│  🌐 Sites    │                                           │
│          │                                               │
│  📊 Logs     │                                           │
│          │                                               │
│  ⚙ Settings │                                           │
│          │                                               │
├──────────┴───────────────────────────────────────────────┤
│  Status: Worker running | Queue: 3 pending | v1.0.0     │
└──────────────────────────────────────────────────────────┘
```

Fixed sidebar navigation. Content area fills remaining space. Bottom status bar shows system health.

---

## Tab 1: Dashboard (`/dashboard`)

Overview of system health and performance.

```
┌─────────────────────────────────────────────────────────┐
│  Dashboard                                    [Refresh] │
├─────────┬──────────┬──────────┬────────────────────────┤
│ Total   │ Today    │ Success  │ Avg Processing         │
│ 1,234   │ 45       │ 94.8%    │ 38s                    │
│ jobs    │ submitted│ rate     │ per job                │
├─────────┴──────────┴──────────┴────────────────────────┤
│                                                         │
│  [Success/Failure Chart - Last 7 Days]                  │
│  ████████████████████░░                                 │
│  ████████████████░░░░░░                                 │
│  ██████████████████████                                 │
│                                                         │
├────────────────────────┬────────────────────────────────┤
│  By Site               │  Recent Activity               │
│  ┌──────────────────┐  │  10:05 ✅ Job #abc - Success   │
│  │ Metropark   1100 │  │  10:03 ❌ Job #def - Failed    │
│  │ Lola         134 │  │  10:01 ⏳ Job #ghi - Processing│
│  │ Mitar          0 │  │  09:58 ✅ Job #jkl - Success   │
│  └──────────────────┘  │  09:55 📥 Job #mno - Queued    │
└────────────────────────┴────────────────────────────────┘
```

**Components:**
- `StatsCards` — 5 KPI cards with trend indicators (up/down arrow vs last week, not yesterday — review finding: daily is too noisy)
  - Total Jobs | Today | Success Rate | Avg Processing Time | **CAPTCHA Cost Today** (review C2)
- `SuccessChart` — Recharts area chart, daily success vs failure, 7/30 day toggle
- `SiteBreakdown` — Bar chart or table showing per-site volume and success rate
- `IssuerBreakdown` — Sortable table of issuers ranked by success rate (review I4)
- `FailureReasons` — Pie/donut chart of failure categories (review I5)
- `CostChart` — CAPTCHA spending trend over time (review C2)
- `RecentActivity` — Live feed, auto-refreshes every 10 seconds via SWR

---

## Tab 2: Jobs (`/jobs`)

Job management with powerful filtering.

```
┌─────────────────────────────────────────────────────────┐
│  Jobs                                                    │
├─────────────────────────────────────────────────────────┤
│  [🔍 Search...]  [Status ▾] [Site ▾] [Date Range]      │
│                  [+ New Job]  [Bulk Import]              │
├─────────────────────────────────────────────────────────┤
│  ☐ │ ID      │ Report  │ Site      │ Issuer   │ Status │
│  ──┼─────────┼─────────┼───────────┼──────────┼────────│
│  ☐ │ abc123  │ 1234567 │ Metropark │ בת ים    │ ✅ OK  │
│  ☐ │ def456  │ 7654321 │ Metropark │ ראשון    │ ❌ Fail│
│  ☐ │ ghi789  │ 1111111 │ Lola      │ הרצליה   │ ⏳ Run │
│  ☐ │ jkl012  │ 2222222 │ Metropark │ נתניה    │ 📥 Q'd │
│                                                         │
│  [◀ Prev]  Page 1 of 5  [Next ▶]                       │
├─────────────────────────────────────────────────────────┤
│  Selected: 2  [🔄 Retry Selected] [🚫 Cancel Selected] │
└─────────────────────────────────────────────────────────┘
```

**Features:**
- Full-text search across report number, external ID, issuer name
- Multi-select status filter (checkboxes)
- Site filter dropdown
- Date range picker
- Sortable columns (click header)
- Bulk actions: retry, cancel
- Pagination with configurable page size
- Color-coded status badges

### Job Detail (`/jobs/[id]`)

```
┌─────────────────────────────────────────────────────────┐
│  [← Prev] Back to Jobs [Next →]                          │  (review N4: keyboard nav)
│  Job abc123              [📋 Clone & Edit] [🔄 Retry] [🚫 Cancel] [✅ Resolve]│
├──────────────────────┬──────────────────────────────────┤
│  Status: ✅ SUCCESS   │  Site: Metropark                │
│  Report: 12345678    │  Issuer: בת ים (ID: 8)          │
│  Type: Parking       │  Attempts: 1/3                   │
│  Created: 10:00:00   │  Duration: 38s                   │
│  Completed: 10:00:38 │  Reference: 98765                │
├──────────────────────┴──────────────────────────────────┤
│                                                         │
│  Timeline                                               │
│  ──────────                                             │
│  10:00:00  📥 CREATED      Job created from API         │
│  10:00:00  ✓  VALIDATED    Input validated               │
│  10:00:01  📤 QUEUED       Sent to processing queue      │
│  10:00:05  ⚙  PROCESSING   Worker picked up job          │
│  10:00:08  🌐 PAGE_LOADED  Navigated to appeal form      │
│  10:00:15  📝 FORM_FILLED  All fields populated          │
│  10:00:16  🔐 CAPTCHA_REQ  Requesting CAPTCHA solution   │
│  10:00:35  ✓  CAPTCHA_OK   CAPTCHA solved (19s)          │
│  10:00:36  📤 SUBMITTED    Appeal form submitted          │
│  10:00:38  ✅ SUCCESS      Reference: 98765              │
│                                                         │
├─────────────────────────────────────────────────────────┤
│  Screenshots                                            │
│  [page-loaded] [after-search] [before-submit] [result]  │
│  (clickable thumbnails opening full-size modal)         │
├─────────────────────────────────────────────────────────┤
│  Input Data                    │  Result Data            │
│  reportNumber: 12345678        │  referenceNumber: 98765 │
│  firstName: ישראל              │  message: Success       │
│  lastName: ישראלי              │  completedAt: 10:00:38  │
│  ...                           │  ...                    │
└────────────────────────────────┴────────────────────────┘
```

**Components:**
- `JobTimeline` — vertical timeline with icons per event type, timestamps, color-coded
- `ScreenshotGallery` — thumbnail grid, click to open full-size in modal
- `JobDataPanels` — two-column display of input and result JSON, formatted
- `JobActions` — context-aware action buttons:
  - **Clone & Edit** (review C1): Pre-fills New Job dialog with this job's input. Available on FAILED and MANUALLY_RESOLVED jobs.
  - **Resolve Manually** (review C5): Opens dialog for operator to enter reference number and note. Marks job as MANUALLY_RESOLVED.
  - **Suggested Next Steps** (review C5): For FAILED jobs, shows actionable guidance based on error code:
    - `REPORT_NOT_FOUND` → "Report not found. Verify the report number is correct, or try a different appeal type."
    - `CAPTCHA_ERROR` → "CAPTCHA verification failed. The system will retry automatically."
    - `BOT_DETECTED` → "The site blocked access. Will retry with different browser settings."
    - `SITE_UNAVAILABLE` → "The municipal site is currently down. Job will be retried when it recovers."
    - `CRAWLER_ERROR` → "Unexpected page structure. This may indicate a site update — contact support."
- `DeadlineBadge` (review C3): Shows days remaining if deadline is set. Red badge for <3 days, yellow for <7 days.

---

## Tab 3: Sites (`/sites`)

Registered sites and their health.

```
┌─────────────────────────────────────────────────────────┐
│  Sites                                                   │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  ┌─────────────────┐  ┌─────────────────┐              │
│  │ 🟢 Metropark     │  │ 🟡 Lola          │              │
│  │ 1,100 total     │  │ 134 total       │              │
│  │ 95% success     │  │ 88% success     │              │
│  │ 15 issuers      │  │ 10 issuers      │              │
│  │ [View Details]  │  │ [View Details]  │              │
│  └─────────────────┘  └─────────────────┘              │
│                                                         │
│  ┌─────────────────┐                                    │
│  │ ⚪ Mitar         │                                    │
│  │ 0 total         │                                    │
│  │ Not configured  │                                    │
│  │ [Configure]     │                                    │
│  └─────────────────┘                                    │
│                                                         │
└─────────────────────────────────────────────────────────┘
```

### Site Detail (`/sites/[slug]`)

- Issuer list table (authority ID, name, enabled toggle)
- Site-specific stats chart
- **Test Form**: manually submit a test job for this site
- Configuration panel (timeouts, concurrency, etc.)

---

## Tab 4: Logs — DEFERRED to Phase 6

> **Review decision (I2)**: The separate Logs tab and SystemLog DB table are deferred to Phase 6. For Phase 1-5, debugging is handled through:
> - **Job Timeline** on the job detail page (JobEvent audit trail — covers 95% of debugging needs)
> - **Pino stdout** via `docker logs` for real-time system debugging
> - **CAPTCHA cost** visible in Settings tab and Dashboard stats
>
> The Logs tab will be implemented when there is real production data volume that justifies a dedicated log viewer.

---

## Tab 4: Settings (`/settings`)

```
┌─────────────────────────────────────────────────────────┐
│  Settings                                                │
├─────────────────────────────────────────────────────────┤
│                                                         │
│  Worker Control (review I7)                             │
│  ├─ Status: [🟢 Running] [⏸ Pause] [▶ Resume]          │
│  ├─ Concurrency: [2] (range: 1-5)                       │
│  │   ⚠ Higher values may trigger anti-bot detection     │
│  ├─ Default retry limit: [3] (range: 1-10)              │
│  ├─ Retry delay: [600] seconds (min: 300)               │
│  │   ⚠ Municipal sites may throttle rapid retries       │
│  └─ Screenshot retention: [30] days                     │
│                                                         │
│  Notifications (env-driven for Phase 1)                 │
│  ├─ Email on failure: [✓] → [admin@company.com]         │
│  ├─ Webhook on completion: [✓] → [https://fleet...]     │
│  └─ Daily report: [✓] → [8:00 AM]                      │
│                                                         │
│  CAPTCHA (review C2: cost tracking)                     │
│  ├─ Provider: 2captcha                                  │
│  ├─ API Key: [•••••••••] [Show]                         │
│  ├─ Balance: $12.50 [Check]                             │
│  ├─ Spent today: $3.50                                  │
│  ├─ Spent this week: $18.20                             │
│  └─ Avg cost per job: $0.037                            │
│                                                         │
│  Circuit Breakers (review I3)                           │
│  ├─ Metropark: 🟢 Closed (0 consecutive failures)      │
│  └─ Lola: 🔴 Open since 10:15 (5 failures)             │
│                                                         │
│  [Save Changes]                                         │
└─────────────────────────────────────────────────────────┘
```

---

## Data Fetching Pattern

```typescript
// src/hooks/use-jobs.ts
import useSWR from 'swr';

const fetcher = (url: string) => fetch(url).then(r => r.json());

export function useJobs(filters: JobFilters) {
  const params = new URLSearchParams(filters as any);
  return useSWR(`/api/jobs?${params}`, fetcher, {
    refreshInterval: 10_000,   // Auto-refresh every 10s
    revalidateOnFocus: true,
  });
}

export function useJobDetail(id: string) {
  return useSWR(`/api/jobs/${id}`, fetcher, {
    refreshInterval: 5_000,    // More frequent for detail view
  });
}

export function useStats() {
  return useSWR('/api/stats', fetcher, {
    refreshInterval: 30_000,   // Every 30s
  });
}
```

## New Job Dialog

Accessible from Jobs tab. Modal dialog with form:

```
┌─────────────────────────────────────────┐
│  Submit New Appeal                  [X] │
├─────────────────────────────────────────┤
│  Site:     [Metropark ▾]                │
│  Issuer:   [בת ים ▾] (auto-filtered)   │
│  Type:     (●) Auto  ( ) Parking  ( ) Enforcement │
│                                         │
│  Report Number:  [____________]         │
│  Vehicle Number: [____________]         │
│  ID Number:      [____________]         │
│  First Name:     [____________]         │
│  Last Name:      [____________]         │
│  Phone:          [____________]         │
│  Email:          [muni@rodprotect.co.il]│
│  Reason:         [מבקש להערר________]   │
│                                         │
│  Document: [Choose File] (optional)     │
│                                         │
│        [Cancel]  [Submit Appeal]        │
└─────────────────────────────────────────┘
```

Real-time validation as user types (Zod schema feedback).
