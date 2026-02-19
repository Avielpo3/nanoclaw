---
name: host-browser
description: Control the user's real Chrome browser with their logged-in sessions, cookies, and extensions
---

# Host Browser Control

You can control the user's real Chrome browser (the one on their Mac) through these `browser_*` tools. This gives you access to their logged-in sessions, cookies, and bookmarks.

## Available Tools

| Tool | Purpose |
|------|---------|
| `browser_navigate` | Go to a URL |
| `browser_snapshot` | Get accessibility tree with ref numbers for interactive elements |
| `browser_click` | Click an element (by ref number or CSS selector) |
| `browser_fill` | Type into a text field |
| `browser_select` | Choose from a dropdown |
| `browser_screenshot` | Take a screenshot |
| `browser_get_text` | Get text from page or element |
| `browser_eval` | Run JavaScript in the console |
| `browser_wait` | Wait for element or timeout |
| `browser_tabs` | List open tabs |
| `browser_switch_tab` | Switch to a tab by index or URL pattern |
| `browser_back` / `browser_forward` | Navigate history |

## Workflow

1. `browser_navigate` to the target page
2. `browser_snapshot` to see what's on the page
3. Use ref numbers from snapshot to `browser_click`, `browser_fill`, etc.
4. `browser_snapshot` again after actions to see the result

## When to Use Host Browser vs Container Browser

**Use host browser (`browser_*` tools) when:**
- You need the user's logged-in sessions (Gmail, bank, social media)
- You need to interact with sites that require authentication
- The user asks you to do something "in my browser"

**Use the container's built-in browser (Bash + Playwright) when:**
- Scraping public websites
- Testing or developing web pages
- Tasks that don't need user sessions

## Important Notes

- These tools only work from the **main group**. Other groups cannot access the host browser.
- Chrome must be running with `--remote-debugging-port=9222` (launch via `scripts/launch-chrome.sh`)
- If Chrome isn't running, tools will return an error explaining how to start it
- Actions happen on the user's real browser — be careful and confirm before making changes to accounts
