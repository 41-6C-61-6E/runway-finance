---
description: To be followed by all agents
# applyTo: 'Describe when these instructions should be loaded by the agent based on task context' # when provided, instructions will automatically be added to the request context when the pattern matches an attached file
---

<!-- Tip: Use /create-instructions in chat to generate content with agent assistance -->

When executing large-scope reviews, coding tasks, or research, and when it makes sense to do so, spawn focused subagents or parallel audit passes for specific sub-domains to ensure exhaustive coverage without cognitive degradation. Keep subagent scope tight and focused on a single concern or task, provide clear instructions for each subagent, and review their outputs for consistency and completeness.

If a Subagent fails, consider re-spawning it with adjusted instructions or a narrower scope. 

If working a large task, periodically output an estimated percentage complete withe the task, and summary of the current state of the task, including what has been completed, what remains to be done, and any issues or blockers encountered. 

## Secrets & key hygiene — HARD RULES (read before touching any config, env, or test file)

1. **NEVER write a real secret value into any tracked file.** This includes source, config, test fixtures, test configs (`vitest*.config.ts`), scripts, Dockerfiles, compose files, docs, examples, logs, screenshots, and commit messages. Real secrets live ONLY in the untracked `.env` (and the operator's key storage).
2. **Never copy a value out of `.env` into other files or into chat/terminal output.** 
3. **No live-value fallbacks.** `process.env.X || '<real-value>'` is forbidden. Fallback defaults in test configs and scripts must be **obviously synthetic constants** (e.g. `'deadbeef'…` 64 hex, or a freshly generated throwaway keypair), with a comment saying a real value must come from the environment.
4. **Before committing anything that touches env handling, test config, or keys, run the secret scan:** `grep -rniE "(encryption_key|vapid_private|nextauth_secret|registration_pin|postgres_password|api_key|private_key|password)\s*[:=]\s*['\"][A-Za-z0-9+/=_-]{16,}" --exclude-dir=node_modules --exclude-dir=.next --exclude-dir=.git --exclude-dir=scratch .` — every hit MUST be proven synthetic (test-only constant, base64url throwaway key, `example`/`change-me` placeholder) before the commit proceeds.
5. **Before any `git commit`, run:** `git status --porcelain` and `git diff --cached | grep -inE "key|secret|token|password|vapid|dek"` and visually confirm the diff contains no real secret values. Also `git diff --cached --stat` to make sure unexpected files (`.env`, `scratch/*.env`, DB dumps) are not staged.
6. **Never stage or commit:** `.env` (any variant), `scratch/` data files (DB dumps, exports, API responses), `*.pem`, `*.p12`, `*.jks`, log files containing request bodies, or `coverage/` if it captured secret data. `.gitignore` covers most of this — if a secret-bearing file appears in `git status` as addable, STOP and fix the ignore rule first.
7. **Test infrastructure must fail closed on missing secrets.** Integration tests must error out clearly when a required key is missing, not silently substitute something that looks real.
9. If you discover a committed secret in history while doing any other task: **stop, tell the user immediately**

The dev server is running at http://10.1.1.10:3001 You can use this to test your changes locally before committing them.

All thinking, reasoning, planning, compaction, and coding shall be exclusively conducted in the english language. 

This session has a hard cap of ~10 images (VS Code client limit) and vLLM enforces its own limit per request. If the conversation has accumulated several image attachments (screenshots, UI reviews, etc.) across multiple turns, proactively suggest running `/compact` or "Summarize conversation" before attaching further images, rather than waiting for a 400 error. If a request fails with a "too many images" or similar attachment error, tell the user directly and recommend starting a new chat session rather than retrying repeatedly.