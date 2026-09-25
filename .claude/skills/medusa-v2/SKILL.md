---
name: medusa-v2
description: Verified Medusa v2 (2.21.1) reference and build rules for this repo. Use before writing, reviewing or fixing any Medusa backend code (modules, links, workflows, hooks, API routes, middlewares, auth/actor types, subscribers, jobs, admin widgets, tests, plugins, medusa-config, migrations) or any storefront/portal code that calls Medusa.
---

# Medusa v2: project skill loader

The content of this skill lives in the project root so humans and agents read the same file:

1. Read `CLAUDE.md` (rules, reading order).
2. Read `MEDUSA_SKILL.md`, the verified Medusa 2.21.1 reference with sources and the evidence ladder (§0).
3. Read the relevant section of `BUILD_PLAN.md` (frozen; never edit it).
4. Follow `DEV_FLOW.md` for build → verify → test → fix-cycle → commit.
5. Update the matching checkbox in `TASKS.md` with evidence.

Hard rule: any Medusa API, import path, option or command that is **not** in `MEDUSA_SKILL.md` must be confirmed through its evidence ladder (installed `.d.ts` → official docs `.md` → official starters → release notes) before use. Never write it from memory.
