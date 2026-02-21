# NanoClaw

Personal Claude assistant. See [README.md](README.md) for philosophy and setup. See [docs/REQUIREMENTS.md](docs/REQUIREMENTS.md) for architecture decisions.

## Quick Context

Single Node.js process that connects to WhatsApp, routes messages to Claude Agent SDK running in Apple Container (Linux VMs). Each group has isolated filesystem and memory.

## Key Files

| File | Purpose |
|------|---------|
| `src/index.ts` | Orchestrator: state, message loop, agent invocation |
| `src/channels/whatsapp.ts` | WhatsApp connection, auth, send/receive |
| `src/ipc.ts` | IPC watcher and task processing |
| `src/router.ts` | Message formatting and outbound routing |
| `src/config.ts` | Trigger pattern, paths, intervals |
| `src/container-runner.ts` | Spawns agent containers with mounts |
| `src/group-queue.ts` | Per-group queue with global concurrency limit |
| `src/task-scheduler.ts` | Runs scheduled tasks |
| `src/db.ts` | SQLite operations |
| `src/mount-security.ts` | Mount allowlist validation for container security |
| `src/logger.ts` | Pino logger, uncaught error routing |
| `src/browser-bridge.ts` | IPC bridge to host Chrome via Playwright CDP |
| `src/transcription.ts` | Voice message transcription via Whisper |
| `src/whatsapp-auth.ts` | Standalone WhatsApp QR auth script |
| `src/types.ts` | Shared type definitions |
| `groups/{name}/CLAUDE.md` | Per-group memory (isolated) |
| `container/skills/agent-browser/SKILL.md` | Browser automation skill (available to all agents) |

## Skills

| Skill | When to Use |
|-------|-------------|
| `/setup` | First-time installation, authentication, service configuration |
| `/customize` | Adding channels, integrations, changing behavior |
| `/debug` | Container issues, logs, troubleshooting |

## Development

Run commands directly—don't tell the user to run them.

```bash
npm run dev          # Run with hot reload
npm run build        # Compile TypeScript
./container/build.sh # Rebuild agent container
```

Service management:
```bash
launchctl load ~/Library/LaunchAgents/com.nanoclaw.plist
launchctl unload ~/Library/LaunchAgents/com.nanoclaw.plist
```

## Container Build Cache

Apple Container's buildkit caches the build context aggressively. `--no-cache` alone does NOT invalidate COPY steps — the builder's volume retains stale files. To force a truly clean rebuild:

```bash
container builder stop && container builder rm && container builder start
./container/build.sh
```

Always verify after rebuild: `container run -i --rm --entrypoint wc nanoclaw-agent:latest -l /app/src/index.ts`

## Fleet Service (Parking Appeal Automation)

Design docs: `docs/plans/fleet/` — 14 documents covering architecture, data model, job system, adapters, browser engine, API, UI, logging, errors, testing, security, implementation plan, review findings.

### Quick Reference

| Resource | Location |
|----------|----------|
| Design index | `docs/plans/fleet/00-INDEX.md` |
| Implementation plan | `docs/plans/fleet/12-implementation-plan.md` |
| Review findings | `docs/plans/fleet/13-review-findings.md` |
| **Reference data (keys, selectors, URLs, authority IDs)** | `docs/plans/fleet/REF-extracted-data.md` |
| v1 reference repo | `/tmp/fleet-reference/v1/` (may need re-clone from `github.com/roadprotect/road-protect-fleet-crawlers`) |
| v2 reference repo | `/tmp/fleet-reference/v2/` (may need re-clone from `github.com/roadprotect/road-protect-fleet-crawlers-v2`) |

### Key Data Points

- **2captcha API key**: `122d2fc4ad2485e4eeff31782cce61b3`
- **Default form email**: `muni@roadprotect.co.il`
- **Default form phone**: `0544757841`
- **Metropark 33 issuers**, Mileon 40 issuers — full list in REF doc
- **Metropark selectors**: All CSS selectors for search form, appeal form, CAPTCHA, file uploads, submit, and result detection
- **Mileon/Lola selectors**: Full transfer form selectors for new and old variants
- **Hebrew detection strings**: Success, not found, already submitted, paid, collection, temporary error
