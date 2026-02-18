---
name: agent-browser
description: Browse the web for any task — research topics, read articles, interact with web apps, fill forms, take screenshots, extract data, and test web pages. Use whenever a browser would be useful, not just when the user explicitly asks.
allowed-tools: Bash(agent-browser:*)
---

# Browser Automation with agent-browser

## Timeouts — CRITICAL

agent-browser has NO built-in timeout. Heavy sites WILL hang forever and kill your session.

**ALWAYS wrap commands with `timeout`:**

```bash
timeout 30 agent-browser open <url>        # 30s to load a page
timeout 15 agent-browser snapshot -i       # 15s for snapshot
timeout 10 agent-browser click @e1         # 10s for clicks
timeout 10 agent-browser fill @e2 "text"   # 10s for fill
timeout 20 agent-browser wait --load networkidle  # 20s for network idle
```

**If a command times out (exit code 124):**
1. Run `timeout 5 agent-browser close` to kill the browser
2. Try alternative approach: mobile site, `WebFetch`, or different URL
3. If the same site hangs twice, stop trying — give user the direct link and phone number

## stealth-browser — For Bot-Protected Sites

When `agent-browser` gets blocked (403, CloudFront, Captcha challenge), use `stealth-browser` instead. It uses Playwright with anti-detection (masks webdriver, real User-Agent, Chrome runtime spoofing).

```bash
timeout 30 stealth-browser open <url>              # Open URL, print status/title
timeout 30 stealth-browser snapshot <url>           # Open URL, list interactive elements
timeout 30 stealth-browser screenshot <url> [path]  # Take screenshot
timeout 30 stealth-browser html <url>               # Get full page HTML
timeout 60 stealth-browser script <path.mjs>        # Run custom Playwright script
```

**When to use which:**
- `agent-browser` — default for most sites, supports refs/click/fill workflow
- `stealth-browser` — when agent-browser gets 403/blocked, or for Tabit, CloudFront-protected sites

**Custom scripts** (`stealth-browser script`): write a `.mjs` file that exports a default async function receiving `{ browser, context, page }`. Use this for multi-step flows like reservations on protected sites.

## Blocked Sites — DO NOT OPEN

These sites are too heavy and WILL freeze the browser indefinitely:
- **Google Maps** (maps.google.com, google.com/maps) — use `WebSearch` or `WebFetch` instead
- **Google Search** (google.com/search) — use `WebSearch` tool instead
- **Waze** (waze.com) — use `WebFetch` instead

For distances/directions, ALWAYS use `WebSearch "distance from A to B"` or `WebFetch` on a Google Maps URL. Never open these in agent-browser.

## Quick start

```bash
agent-browser open <url>        # Navigate to page
agent-browser snapshot -i       # Get interactive elements with refs
agent-browser click @e1         # Click element by ref
agent-browser fill @e2 "text"   # Fill input by ref
agent-browser close             # Close browser
```

## Core workflow

1. Navigate: `timeout 30 agent-browser open <url>`
2. Snapshot: `timeout 15 agent-browser snapshot -i` (returns elements with refs like `@e1`, `@e2`)
3. Interact using refs from the snapshot (always with `timeout`)
4. Re-snapshot after navigation or significant DOM changes
5. If any step returns exit 124, close and try a different approach

## Commands

### Navigation

```bash
agent-browser open <url>      # Navigate to URL
agent-browser back            # Go back
agent-browser forward         # Go forward
agent-browser reload          # Reload page
agent-browser close           # Close browser
```

### Snapshot (page analysis)

```bash
agent-browser snapshot            # Full accessibility tree
agent-browser snapshot -i         # Interactive elements only (recommended)
agent-browser snapshot -c         # Compact output
agent-browser snapshot -d 3       # Limit depth to 3
agent-browser snapshot -s "#main" # Scope to CSS selector
```

### Interactions (use @refs from snapshot)

```bash
agent-browser click @e1           # Click
agent-browser dblclick @e1        # Double-click
agent-browser fill @e2 "text"     # Clear and type
agent-browser type @e2 "text"     # Type without clearing
agent-browser press Enter         # Press key
agent-browser hover @e1           # Hover
agent-browser check @e1           # Check checkbox
agent-browser uncheck @e1         # Uncheck checkbox
agent-browser select @e1 "value"  # Select dropdown option
agent-browser scroll down 500     # Scroll page
agent-browser upload @e1 file.pdf # Upload files
```

### Get information

```bash
agent-browser get text @e1        # Get element text
agent-browser get html @e1        # Get innerHTML
agent-browser get value @e1       # Get input value
agent-browser get attr @e1 href   # Get attribute
agent-browser get title           # Get page title
agent-browser get url             # Get current URL
agent-browser get count ".item"   # Count matching elements
```

### Screenshots & PDF

```bash
agent-browser screenshot          # Save to temp directory
agent-browser screenshot path.png # Save to specific path
agent-browser screenshot --full   # Full page
agent-browser pdf output.pdf      # Save as PDF
```

### Wait

```bash
agent-browser wait @e1                     # Wait for element
agent-browser wait 2000                    # Wait milliseconds
agent-browser wait --text "Success"        # Wait for text
agent-browser wait --url "**/dashboard"    # Wait for URL pattern
agent-browser wait --load networkidle      # Wait for network idle
```

### Semantic locators (alternative to refs)

```bash
agent-browser find role button click --name "Submit"
agent-browser find text "Sign In" click
agent-browser find label "Email" fill "user@test.com"
agent-browser find placeholder "Search" type "query"
```

### Authentication with saved state

```bash
# Login once
agent-browser open https://app.example.com/login
agent-browser snapshot -i
agent-browser fill @e1 "username"
agent-browser fill @e2 "password"
agent-browser click @e3
agent-browser wait --url "**/dashboard"
agent-browser state save auth.json

# Later: load saved state
agent-browser state load auth.json
agent-browser open https://app.example.com/dashboard
```

### Cookies & Storage

```bash
agent-browser cookies                     # Get all cookies
agent-browser cookies set name value      # Set cookie
agent-browser cookies clear               # Clear cookies
agent-browser storage local               # Get localStorage
agent-browser storage local set k v       # Set value
```

### JavaScript

```bash
agent-browser eval "document.title"   # Run JavaScript
```

## Example: Form submission

```bash
agent-browser open https://example.com/form
agent-browser snapshot -i
# Output shows: textbox "Email" [ref=e1], textbox "Password" [ref=e2], button "Submit" [ref=e3]

agent-browser fill @e1 "user@example.com"
agent-browser fill @e2 "password123"
agent-browser click @e3
agent-browser wait --load networkidle
agent-browser snapshot -i  # Check result
```

## Example: Data extraction

```bash
agent-browser open https://example.com/products
agent-browser snapshot -i
agent-browser get text @e1  # Get product title
agent-browser get attr @e2 href  # Get link URL
agent-browser screenshot products.png
```
