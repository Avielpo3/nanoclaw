---
name: fiverr-integration
description: Automate Fiverr gig management via browser. Create gigs, fill forms, manage orders, search. Uses Chrome CDP with the user's real logged-in session. Triggers on "fiverr", "create gig", "fiverr gig", "fiverr orders".
---

# Fiverr Integration

Browser automation for Fiverr via Chrome CDP (user's real session with cookies).

## Prerequisites

1. **Chrome running with CDP**: `./scripts/launch-chrome.sh`
2. **browser-mcp built**: `cd browser-mcp && npm run build`
3. **User logged into Fiverr** in the CDP Chrome instance (manual, one-time)

### First-Time Fiverr Login

Fiverr uses PerimeterX (HUMAN Security) bot detection. On first visit from the CDP profile, it shows "It needs a human touch" with error `PXCR10002539`. The user must:

1. Open Chrome (the CDP instance launched by `scripts/launch-chrome.sh`)
2. Navigate to `https://www.fiverr.com` manually
3. Complete the challenge and log in
4. Session cookies persist in `~/.chrome-cdp-profile/`

After login, automation works via the browser-mcp tools.

### Verify Login

```bash
cd browser-mcp && npx tsx fiverr-helper.ts eval '(() => {
  const signIn = document.querySelector("a[href*=\"/login\"]");
  const avatar = document.querySelector("[class*=\"avatar\"], img[alt*=\"profile\"]");
  return { loggedIn: !signIn || !!avatar, url: window.location.href };
})()'
```

## Helper Script

`browser-mcp/fiverr-helper.ts` wraps browser-mcp for quick CLI access:

```bash
cd browser-mcp
npx tsx fiverr-helper.ts snapshot          # Accessibility snapshot
npx tsx fiverr-helper.ts navigate <url>    # Go to URL
npx tsx fiverr-helper.ts click <selector>  # Click element
npx tsx fiverr-helper.ts fill <sel> <val>  # Fill input
npx tsx fiverr-helper.ts eval '<js>'       # Run JS
npx tsx fiverr-helper.ts select <sel> <v>  # Select dropdown
npx tsx fiverr-helper.ts screenshot [path] # Save screenshot
npx tsx fiverr-helper.ts wait <ms>         # Wait
npx tsx fiverr-helper.ts text [selector]   # Get text
npx tsx fiverr-helper.ts url               # Get current URL
```

## Key URLs

| Page | URL |
|------|-----|
| Dashboard | `https://www.fiverr.com/dashboard` |
| Create Gig | `https://www.fiverr.com/users/{username}/manage_gigs/new?wizard=0&tab=general` |
| Orders | `https://www.fiverr.com/users/orders` |
| Manage Gigs | `https://www.fiverr.com/users/{username}/manage_gigs` |
| Search | `https://www.fiverr.com/search/gigs?query={query}` |

## Gig Creation Workflow

The gig wizard has 6 steps: Overview → Pricing → Description & FAQ → Requirements → Gallery → Publish.

> **Note:** Write content to Fiverr's character limits from the start — long-form content will need heavy condensing to fit. See [Character Limits](#character-limits) below.

### Step 1: Overview (General Tab)

Navigate to: `https://www.fiverr.com/users/{username}/manage_gigs/new?wizard=0&tab=general`

Fields on this page:

| Field | Element | Required | Notes |
|-------|---------|----------|-------|
| Gig title | `textarea.gig-title-textarea` | Yes | Prefixed with "I will", max 80 chars |
| Category | react-select-2 | Yes | Top-level category |
| Subcategory | react-select-3 | Yes | Depends on category |
| Service type | react-select-4 (inside `.gig-service-type-group`) | Yes | Depends on subcategory |
| Gig metadata | Tabbed checkboxes in sidebar | Yes | Multiple tabs of checkboxes |
| Search tags | combobox | Yes | 5 tags max, letters/numbers only |

### Filling the Title

The title is a `<textarea>` (not `<input>`). Use the native setter to trigger React's state:

```javascript
const ta = document.querySelector("textarea.gig-title-textarea");
const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, "value").set;
setter.call(ta, "your gig title here");
ta.dispatchEvent(new Event("input", { bubbles: true }));
ta.dispatchEvent(new Event("change", { bubbles: true }));
```

### Interacting with React-Select Dropdowns

Fiverr uses react-select for Category, Subcategory, and Service Type. These require a specific pattern:

**Opening the dropdown — use Playwright click on the control element:**

```bash
npx tsx fiverr-helper.ts click '.category-selector__control'
```

Or for service type specifically:

```bash
npx tsx fiverr-helper.ts click '.gig-service-type-group [class*=control]'
```

> **Do NOT** try `browser_fill` on react-select inputs — they time out because the actual `<input>` is tiny/hidden.

**Reading options once open:**

```javascript
const options = document.querySelectorAll("[class*=option]");
Array.from(options).map(el => el.textContent?.trim());
```

Or by ID pattern: `[id*=react-select-N-option]` where N is the select number.

**Selecting an option — dispatch mousedown + click:**

```javascript
const options = document.querySelectorAll("[class*=option]");
const target = Array.from(options).find(el => el.textContent?.includes("Target Text"));
target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true }));
target.dispatchEvent(new MouseEvent("click", { bubbles: true }));
```

> **IMPORTANT:** `.click()` alone does NOT work on react-select options. You must dispatch `mousedown` then `click` events.

### React-Select Numbering

| Select # | Field | Notes |
|----------|-------|-------|
| react-select-2 | Category | Top-level: Graphics & Design, Programming & Tech, etc. |
| react-select-3 | Subcategory | Changes based on category selection |
| react-select-4 | Service Type | Inside `.gig-service-type-group`, changes based on subcategory |

### Gig Metadata Sections

After selecting service type, a metadata sidebar appears with multiple tabs. Each tab shows a different set of checkboxes. The tabs are `<li>` elements inside the metadata complementary section.

**Navigate between tabs:**

```javascript
const items = document.querySelectorAll("[class*=metadata] li");
const target = Array.from(items).find(el => el.textContent?.includes("Tab Name"));
target.click();
```

**Check/uncheck checkboxes:**

```javascript
const checkboxes = document.querySelectorAll("input[type=checkbox]");
for (const cb of checkboxes) {
  if (cb.parentElement?.textContent?.trim() === "Label Text") {
    cb.click();
  }
}
```

Metadata tabs vary by category/subcategory. For **Programming & Tech → Chatbot Development → AI Chatbot Development**:

| Tab | Options (sample) |
|-----|------------------|
| AI engine * | BERT, BLOOM, Claude.ai, DeepSeek, Gemini, Open AI GPT, ChatGPT, LangChain, etc. |
| Programming language * | Python, TypeScript, JavaScript, Java, Go, etc. |
| Tools & frameworks * | Botpress, Dialogflow, n8n, Rasa, ManyChat, etc. |
| Bot type * | Customer Service & Support, Scheduling & Assistance, E-commerce, etc. |
| Platforms * | (varies) |

The `*` suffix means the field is required.

### Adding Search Tags

The search tags field is a combobox. Type a tag and press Enter:

```javascript
const input = document.querySelector("input[class*=tag], [role=combobox]");
// or locate via snapshot ref number
```

### Step 2: Pricing

#### Delivery Time Dropdowns

The `.pkg-duration-input` class has 6 elements: indices 0-2 are the visible dropdown controls, indices 3-5 contain the actual `<aside>` dropdown menus with button options.

**Selecting delivery time:**

```javascript
// 1. Click the visible control to open the dropdown
const controls = document.querySelectorAll('.pkg-duration-input [class*="content"]');
controls[columnIndex].click(); // 0=Basic, 1=Standard, 2=Premium

// 2. Find the aside menu and click the matching button
const asides = document.querySelectorAll('.pkg-duration-input aside');
const buttons = asides[columnIndex].querySelectorAll('button');
const target = Array.from(buttons).find(b => b.textContent.includes('7 days'));
target.click();
```

> **Do NOT** click the visible dropdown directly — open the control's `[class*="content"]` span, then select from the corresponding `aside` element.

#### Revisions Dropdowns

Revisions use the same aside pattern but with a different selector:

```javascript
const revAsides = document.querySelectorAll('.table-select:not(.pkg-duration-input) aside');
// Same button-click pattern as delivery time
```

#### Price Inputs

Price inputs use `.price-input` with `input[type="number"]` (spinbutton role). Use the React native setter:

```javascript
const input = document.querySelector('.price-input input[type="number"]');
const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
setter.call(input, '150');
input.dispatchEvent(new Event('input', { bubbles: true }));
input.dispatchEvent(new Event('change', { bubbles: true }));
```

#### Package Checkboxes

Find unchecked, non-disabled checkboxes in the second table (package options):

```javascript
const tables = document.querySelectorAll('table');
const checkboxes = tables[1].querySelectorAll('input[type="checkbox"]:not([disabled])');
checkboxes.forEach(cb => { if (!cb.checked) cb.click(); });
```

> **Note:** Some checkboxes are `[disabled]` (e.g., "AI Model Fine-tuning") and cannot be toggled.

Package description textboxes have a **100-character limit**.

### Step 3: Description & FAQ

#### Gig Description (Quill Editor)

The description editor is a **Quill rich text editor** — a `contenteditable` div, NOT a textarea.

**Setting description content:**

```javascript
// Quill editor requires innerHTML — normal input/textarea patterns do not work
const editor = document.querySelector('.ql-editor');
editor.innerHTML = '<p>Paragraph one</p><p>Paragraph two</p>';
editor.dispatchEvent(new Event('input', { bubbles: true }));
```

- Use `<p>` tags for paragraphs, `<br>` within `<p>` for line breaks within a paragraph
- Character count displayed as "X/1200 Characters"
- **Max 1,200 characters**

> **Do NOT** use textarea/input patterns — the editor is a contenteditable div accessed via `.ql-editor`.

#### FAQ Entries

```javascript
// 1. Click "+ Add FAQ" button
const addBtn = Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.includes('Add FAQ'));
addBtn.click();

// 2. Fill question (free text input, no observed limit)
const qInput = document.querySelector('input[placeholder*="Add a Question"]');
const inputSetter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value').set;
inputSetter.call(qInput, 'Your question here');
qInput.dispatchEvent(new Event('input', { bubbles: true }));

// 3. Fill answer (max 300 chars)
const aInput = document.querySelector('textarea[placeholder*="Add an Answer"]');
const taSetter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
taSetter.call(aInput, 'Your answer here');
aInput.dispatchEvent(new Event('input', { bubbles: true }));

// 4. Click "Add" to submit the FAQ entry
const submitBtn = Array.from(document.querySelectorAll('button'))
  .find(b => b.textContent.trim() === 'Add');
submitBtn.click();
```

After adding, each FAQ appears as a collapsible `<article>` with the question as button text.

> **Gotcha:** The first "Save & Continue" click on this page sometimes fails silently with "We're sorry, but the gig failed to save". Implement a retry — second attempt usually works.

> **Warning:** Page navigation/reload clears unsaved Quill editor content and unsaved FAQs. Complete all entries before saving.

### Step 4: Requirements

Click "+ Add New Question" to open the form for each requirement.

```javascript
// Question field
const q = document.querySelector('textarea[placeholder*="Request necessary details"]');
const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value').set;
setter.call(q, 'Your requirement question');
q.dispatchEvent(new Event('input', { bubbles: true }));

// "Required" checkbox is checked by default
// Response type defaults to "Free text"
// Click "Add" to submit
```

### Step 5: Gallery

> **IMPORTANT:** Gallery requires at least 1 image — this step cannot be skipped. Error message: "Please select at least 1 image".

File upload uses drag-and-drop / file input. This **cannot be fully automated via CDP** — the user must upload images manually.

## Character Limits

| Field | Max Characters |
|-------|---------------|
| Gig title | 80 |
| Package name | ~30 (approximate) |
| Package description | 100 |
| Gig description | 1,200 |
| FAQ question | No observed limit (free text) |
| FAQ answer | 300 |
| Search tags | 5 tags max, letters/numbers only |

## PerimeterX Bot Detection

Fiverr uses PerimeterX (HUMAN Security). Symptoms:
- Page shows "It needs a human touch"
- Error code: `PXCR10002539`
- Cookies show `logged_out_currency` without session tokens

**Causes:**
- Fresh CDP Chrome profile without prior Fiverr visits
- Automated navigation triggering fingerprint detection

**Built-in stealth mitigations (automatic):**

The Chrome launch script and browser-mcp server include anti-detection patches:

- `--disable-blink-features=AutomationControlled` Chrome flag
- `navigator.webdriver` overridden to `undefined` via init script
- `navigator.plugins` faked to match real Chrome (PDF Plugin, PDF Viewer, Native Client)
- `chrome.runtime` stubbed to look like extension environment
- WebGL renderer strings patched (no "SwiftShader" headless signal)
- Permissions API patched (notifications returns "prompt" not "denied")
- Humanized 80-300ms random delays on click/fill/select actions

These reduce challenge frequency but cannot eliminate it entirely.

**Remediation (when challenge still appears):**
1. User must visit fiverr.com manually in the CDP Chrome instance
2. Complete the challenge (usually auto-resolves or requires a click)
3. Log in manually
4. After this, automated access works with the established session

**Detection in tests:**

```javascript
const onLoginPage = window.location.href.includes("/login");
const hasPxChallenge = document.body.innerText.includes("human touch");
const loggedOutCookie = document.cookie.includes("logged_out_currency");
```

## E2E Tests

Tests live in `browser-mcp/test-e2e.ts` alongside the other browser tests. They are gated on login state — if not logged in, they skip with a clear message.

```bash
cd browser-mcp && npx tsx test-e2e.ts
```

### Test Coverage

| Test | What It Verifies |
|------|-----------------|
| fiverr: navigate and verify logged-in session | Page loads, no PX challenge, not redirected to login |
| fiverr: access dashboard and verify profile | Dashboard loads with content, no auth redirect |
| fiverr: search for a gig | Search box interaction or direct URL, results load |
| fiverr: navigate to orders page | Orders page accessible, not redirected |

### Login Detection Logic

```javascript
// Check 1: Not redirected to login page
const onLoginPage = url.includes("/login") || url.includes("/registration");

// Check 2: Has user avatar or profile nav (logged in)
const avatar = document.querySelector('[class*="avatar"], img[alt*="profile"]');
const orderNav = document.querySelector('a[href*="/orders"]');

// Check 3: No prominent sign-in link
const signIn = document.querySelector('a[href*="/login"]');
```

## Fiverr DOM Patterns

Fiverr's UI is React-based. Key patterns:

- **Dropdowns**: react-select components with class patterns `category-selector__*`, `orca-combo-box`
- **Form groups**: `div.form-input-group` with labels and controls
- **Service type section**: `.gig-service-type-group`
- **Metadata sidebar**: `complementary` role element with tab list
- **Checkboxes**: standard `input[type=checkbox]` inside `<li>` with label text in parent
- **Buttons**: "Save" and "Save & Continue" at bottom of each wizard step
- **Delivery time dropdowns**: `.pkg-duration-input` — 6 elements (0-2 visible controls, 3-5 aside menus)
- **Revisions dropdowns**: `.table-select:not(.pkg-duration-input)` — same aside pattern
- **Price inputs**: `.price-input input[type="number"]` — use React native setter
- **Quill editor**: `.ql-editor` contenteditable div — set via innerHTML + input event
- **FAQ question**: `input[placeholder*="Add a Question"]`
- **FAQ answer**: `textarea[placeholder*="Add an Answer"]`
- **Requirements question**: `textarea[placeholder*="Request necessary details"]`

## Troubleshooting

### React-Select Won't Open

Click the `.control` element with Playwright (not JS click). The Playwright click properly focuses and triggers the react-select menu.

### Options List Shows Wrong Section

Each react-select has its own listbox. When multiple dropdowns exist, make sure you're targeting the correct one:

```javascript
// Target specific dropdown by its container
document.querySelector(".gig-service-type-group [class*=menu-list]");
```

### Checkboxes Don't Register

Some checkbox sections are tabbed — make sure you clicked the correct sidebar tab first before looking for checkboxes. The DOM only renders checkboxes for the active tab.

### Form Won't Submit

All required metadata tabs (marked with `*`) must have at least one selection. Check the sidebar for incomplete tabs.

### Save Fails Transiently on Step 3

The first "Save & Continue" click on the Description page sometimes fails silently. Retry the click — second attempt usually works.

### Gallery Cannot Be Skipped

Fiverr requires at least one image in the gallery before publishing. This step requires manual intervention — automated file upload is not supported via CDP.

### General Automation Gotchas

- **Playwright ref selectors do NOT work** — `[ref="13"]` style selectors fail with Fiverr's DOM. Always use `browser_eval` with `document.querySelector` instead.
- **`browser_fill` with ref numbers times out** — Fiverr's React inputs don't respond to Playwright fill. Use `browser_eval` with the React native setter pattern.
- **Save can fail transiently** — Error: "We're sorry, but the gig failed to save". Always retry save clicks.
- **Page navigation clears unsaved state** — Quill editor content and unsaved FAQs are lost on reload. Complete all entries before saving.
- **Grammarly extension interference** — Grammarly may inject a button/emoji into text fields. Ignore it.
- **"Learn about Milestones" link** — On the Description page, this link can accidentally navigate away. Avoid clicking near it.
