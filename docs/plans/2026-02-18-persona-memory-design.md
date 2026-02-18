# Persona Memory System Design

## Goal

Avi builds a persistent persona about the user over time. Remembers facts, preferences, events, and decisions across conversations. Works automatically after every conversation and on explicit "remember this" requests.

## Storage: Structured Markdown Files

Each group gets a `memory/` folder:

```
groups/{name}/memory/
  persona.md      # Who the user is: name, role, style, personality traits
  preferences.md  # Likes, dislikes, tools, communication style
  facts.md        # People, places, projects, concrete details
  events.md       # Timeline with dates: "2026-02-18: Met David, chose React"
```

- One fact per line
- Events prefixed with date: `YYYY-MM-DD: description`
- Files kept under 500 lines; split into subfolders if they grow
- Agent creates files on first write

No vector database. No extra infrastructure. Files are human-readable, git-diffable, debuggable.

## Extraction: Two Triggers

### 1. After every conversation (CLAUDE.md instructions)

Avi's instructions tell it: before finishing any response, review what was discussed and save anything noteworthy to the appropriate `memory/` file.

- Persona traits -> `persona.md`
- Preferences -> `preferences.md`
- Facts about people/places/projects -> `facts.md`
- Events/decisions with dates -> `events.md`
- Deduplication: read target file first, skip if exists, update if changed
- Explicit "remember this": save immediately, confirm to user

This covers all conversations including short ones (e.g., a single voice memo).

### 2. PreCompact conversation archiving (existing safety net)

The existing PreCompact hook already archives full conversation transcripts to `conversations/`. This serves as the backup — if Avi missed extracting a fact during the conversation, the raw transcript is searchable later. No changes needed to the hook (PreCompact hooks cannot inject prompts into the conversation).

## Retrieval: Lean Context, Read on Demand

CLAUDE.md contains a short index (~5 lines) listing what memory files exist and what each contains. Nothing is auto-injected into the system prompt.

Avi reads specific files only when the conversation needs them:
- "What did I decide about the frontend?" -> reads `events.md`
- "Send David an email" -> reads `facts.md` for David's email
- Simple greeting with no recall needed -> no files loaded

Instructions tell Avi: "When a question might relate to something you've learned before, check your memory files first."

Files are local in the container, so reads are instant.

## What Changes

| File | Change |
|------|--------|
| `groups/global/CLAUDE.md` | Updated memory section with extraction instructions and file index |
| `groups/main/CLAUDE.md` | Updated memory section with extraction instructions and file index |
| `.gitignore` | Added exceptions for `groups/*/memory/` folders |
| `groups/main/memory/*.md` | Seeded empty memory files (persona, preferences, facts, events) |

## Why Not Vector DB

Research (see team findings from 2026-02-18) concluded:
- Single-user personal assistant with hundreds of facts doesn't need semantic search
- Agent writes its own memories in consistent vocabulary — no synonym gap
- Markdown files achieve near-perfect recall when the LLM reads them
- Vector DBs add embedding generation, index maintenance, and silent retrieval failures
- OpenClaw, the most architecturally similar project, uses the same markdown + SQLite pattern

Revisit when: 10k+ memories, cross-group search needed, or local embedding model is already running.
