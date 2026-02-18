---
name: proactive-research
description: Use when answering ANY question that requires looking something up — places, distances, prices, availability, comparisons, how-to questions, product research, or any factual query. Also use when you're about to write "check yourself", "call and ask", or "I couldn't find".
---

# Proactive Research

Deliver complete, verified answers. Never delegate research to the user.

## Core Rule

Every claim must be verified or clearly marked unverified. If you're about to tell the user to look something up — STOP. That's your job.

## Tool Escalation

Never give up after one tool fails. Try the next.

| Priority | Tool | Best for |
|----------|------|----------|
| 1 | `WebSearch` | Quick facts: hours, phone, address, prices, ratings, distances, how-to |
| 2 | `WebFetch` | Extract data from a specific URL (works on most sites including Google Maps URLs) |
| 3 | `agent-browser` | Forms, login-walled content, non-Google interactive sites |

**CRITICAL: NEVER use agent-browser on Google Maps, Google Search, or Waze.** These sites are too heavy for the headless browser and WILL hang your entire session. Always use WebSearch or WebFetch for maps/directions/distances.

If all tools fail on a specific fact, say "I couldn't verify X" — don't ask the user to verify it.

### Distance & Location Lookup

Distance is a MUST-VERIFY field. Never say "couldn't validate distance" — keep trying until you have a number.

**IMPORTANT: Do NOT use agent-browser for distance lookups.** Google Maps is too heavy for headless browsers and will hang. Use WebSearch and WebFetch only.

**Step 1 — WebSearch (fast, reliable — try multiple queries):**
```
WebSearch "distance from ADDRESS1 to ADDRESS2"
WebSearch "ADDRESS1 to ADDRESS2 how far"
WebSearch "מרחק בין ADDRESS1 ל ADDRESS2"
WebSearch "ADDRESS1 ADDRESS2 מרחק נסיעה"
```
Google often shows distance and drive time directly in the snippet. Try at least 2-3 query variations in both English and Hebrew.

**Step 2 — WebFetch on Google Maps directions URL:**
```
WebFetch url="https://www.google.com/maps/dir/ADDRESS1/ADDRESS2" prompt="Extract the driving distance in km and estimated travel time"
```
Replace spaces with `+` in addresses. Example:
```
WebFetch url="https://www.google.com/maps/dir/ברשבסקי+7+ראשון+לציון/המכללה+למנהל+ראשון+לציון" prompt="Extract the driving distance in km and estimated travel time"
```

**Step 3 — WebFetch on Waze:**
```
WebFetch url="https://www.waze.com/live-map/directions?to=ll.DEST_LAT%2CDEST_LNG&from=ll.SRC_LAT%2CSRC_LNG" prompt="What is the distance and time?"
```

**Tips:**
- Use full addresses with city name (e.g. "ברשבסקי 7 ראשון לציון" not just "ברשבסקי 7")
- If one direction fails, try reversing the addresses
- Hebrew addresses work in WebSearch and WebFetch
- If WebSearch gives a direct answer (e.g. "2.3 km, 5 min"), that's sufficient — no need for Step 2

## Before Sending — Verify

- Every address: looked up, not guessed
- Every distance: measured via maps, not estimated
- Every time/hour: verified for the specific day asked about
- Every price: sourced, not approximated
- Every recommendation: backed by data you found

## Red Flags — Rewrite Before Sending

If your draft contains ANY of these, delete it and redo:

| Your draft says | Do this instead |
|-----------------|-----------------|
| "check yourself" / "תבדוק בעצמך" | Look it up with WebSearch or agent-browser |
| "call and ask" / "תתקשר ותשאל" | Search for the answer online |
| "open Google Maps" / "פתח גוגל מפות" | Open it yourself with agent-browser |
| "want me to search more?" / "רוצה שאחפש עוד?" | If incomplete, keep searching |
| Steps for the USER to follow | YOU do the steps, present the result |
| Raw URLs as "sources" without answers | Extract the answer FROM the source |
| "I recommend checking..." | Check it yourself, then present findings |
| "I wasn't able to find..." after one try | Try another tool before giving up |
| "לא הצלחתי לאמת מרחק" / "couldn't validate distance" | Use the 3-step distance lookup above — you have the tools |
| Distance listed as "probably close" or "nearby" | Get the actual km/min with the distance lookup steps |

## Example

Bad:
> Found Cowboy Bar on Rothschild 121. Check Google Maps for distance. Call to ask if open Saturday.

Good:
> Cowboy Bar, Rothschild 121 Rishon. 2.3 km from the college (5 min drive). Kosher Badatz. Open Sat night until 02:00. Draft beer 32-38 NIS.
