# Persona Memory Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Avi automatically remembers facts, preferences, events, and persona details across conversations using structured markdown files.

**Architecture:** CLAUDE.md instructions tell Avi to extract and save memories after every response. Memory files live in `memory/` folder per group. Avi reads them on demand when the conversation needs context. PreCompact hook archives conversations as a backup.

**Tech Stack:** Markdown files, existing Claude Agent SDK hooks, CLAUDE.md prompt engineering.

---

### Task 1: Update global CLAUDE.md memory section

**Files:**
- Modify: `groups/global/CLAUDE.md:41-48`

**Step 1: Write the new memory section**

Replace lines 41-48 in `groups/global/CLAUDE.md` (the current `## Memory` section) with:

```markdown
## Memory

You have a persistent memory system. Use it to build knowledge about the user over time.

### Memory Files

Your memory lives in `memory/` inside your workspace (`/workspace/group/memory/`):

- `memory/persona.md` — Who the user is: name, role, personality, communication style
- `memory/preferences.md` — Likes, dislikes, tools, workflows, habits
- `memory/facts.md` — People, places, projects, concrete details
- `memory/events.md` — Timeline of events/decisions, one per line: `YYYY-MM-DD: description`

Create these files on first use. Keep each under 500 lines; split into subfolders if they grow.

### When to Save Memories

*After every response*, before you finish, ask yourself: "Did I learn anything new about the user?" If yes, save it to the right file.

- Persona traits (how they communicate, what they care about) -> `memory/persona.md`
- Preferences (tools, foods, styles, opinions) -> `memory/preferences.md`
- Facts (people they know, where they work, projects) -> `memory/facts.md`
- Events and decisions (meetings, choices, milestones) -> `memory/events.md`

Before writing, read the target file to avoid duplicates. If a fact changed, update the existing line.

When the user says "remember this" or similar, save immediately and confirm.

### When to Read Memories

When a message might relate to something you learned before, read the relevant memory file *before* responding. Examples:

- User asks about a person -> read `memory/facts.md`
- User references a past decision -> read `memory/events.md`
- User asks you to do something "the way I like" -> read `memory/preferences.md`
- Ambiguous request that needs context -> check relevant memory files

Do NOT load all memory files at once. Read only what you need to keep context small.

### Conversations Archive

The `conversations/` folder contains searchable history of past conversations. Use this to recall specific details from previous sessions when memory files don't have what you need.
```

**Step 2: Verify the file reads correctly**

Run: `cat groups/global/CLAUDE.md` and confirm the memory section is updated and the rest of the file is intact.

**Step 3: Commit**

```bash
git add groups/global/CLAUDE.md
git commit -m "feat(memory): update global CLAUDE.md with persona memory instructions"
```

---

### Task 2: Update main CLAUDE.md memory section

**Files:**
- Modify: `groups/main/CLAUDE.md:37-44`

**Step 1: Replace the memory section**

Replace lines 37-44 in `groups/main/CLAUDE.md` (the current `## Memory` section) with the exact same memory section from Task 1. The main group CLAUDE.md should have identical memory instructions to global.

**Step 2: Verify the file reads correctly**

Run: `cat groups/main/CLAUDE.md` and confirm the memory section is updated and the rest of the file (WhatsApp formatting, Admin Context, etc.) is intact.

**Step 3: Commit**

```bash
git add groups/main/CLAUDE.md
git commit -m "feat(memory): update main CLAUDE.md with persona memory instructions"
```

---

### Task 3: Seed initial memory files for main group

**Files:**
- Create: `groups/main/memory/persona.md`
- Create: `groups/main/memory/preferences.md`
- Create: `groups/main/memory/facts.md`
- Create: `groups/main/memory/events.md`

**Step 1: Create the memory directory and seed files**

```bash
mkdir -p groups/main/memory
```

Create `groups/main/memory/persona.md`:
```markdown
# Persona

<!-- One fact per line. Avi updates this automatically. -->
```

Create `groups/main/memory/preferences.md`:
```markdown
# Preferences

<!-- One fact per line. Avi updates this automatically. -->
```

Create `groups/main/memory/facts.md`:
```markdown
# Facts

<!-- One fact per line. Avi updates this automatically. -->
```

Create `groups/main/memory/events.md`:
```markdown
# Events

<!-- One entry per line: YYYY-MM-DD: description. Avi updates this automatically. -->
```

**Step 2: Ensure gitignore allows these files**

Check `groups/main/memory/` is not excluded by `.gitignore`. The current gitignore pattern `groups/main/*` with `!groups/main/CLAUDE.md` will exclude the memory folder. We need to add an exception.

Edit `.gitignore` to add:
```
!groups/main/memory/
```

After the existing `!groups/main/CLAUDE.md` line.

Similarly for global if needed:
```
!groups/global/memory/
```

**Step 3: Commit**

```bash
git add .gitignore groups/main/memory/
git commit -m "feat(memory): seed memory files for main group"
```

---

### Task 4: Test the memory system end-to-end

**Files:**
- None (manual testing)

**Step 1: Build and deploy**

```bash
npm run build
```

**Step 2: Test via WhatsApp**

Send Avi a message with facts to remember, e.g.:
- "My favorite programming language is TypeScript"
- "Remember that I have a meeting with David tomorrow"

Verify Avi:
1. Responds normally
2. Writes to the appropriate memory file (`preferences.md` or `events.md`)

**Step 3: Test recall**

In a new conversation (or after context resets), ask:
- "What's my favorite programming language?"
- "Do I have any meetings coming up?"

Verify Avi reads the memory files and answers correctly.

**Step 4: Test voice memo flow**

Send a voice memo mentioning a fact. Verify:
1. Voice memo is transcribed (existing feature)
2. Avi extracts and saves any facts from the transcription

---

### Task 5: Update design doc with final implementation notes

**Files:**
- Modify: `docs/plans/2026-02-18-persona-memory-design.md`

**Step 1: Update the design doc**

Update the "What Changes" section to reflect that PreCompact hook was NOT modified (it can't inject prompts). Note that the existing PreCompact conversation archiving serves as the backup — archived transcripts in `conversations/` can be searched if memory files miss something.

**Step 2: Commit**

```bash
git add docs/plans/2026-02-18-persona-memory-design.md
git commit -m "docs: update persona memory design with implementation notes"
```
