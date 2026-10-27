---
name: backend-patterns
description: Problem-first guide to ten backend design patterns (Repository, Factory, Singleton, Strategy, Observer/events, Builder, Adapter, Decorator/middleware, CQRS, Circuit breaker), with when NOT to use each, a PR review checklist, and how each maps to Medusa v2 extension points in this repo. Use when designing or refactoring backend code, reviewing a PR for structure, integrating an external API or payment provider, adding side effects after an action, handling a flaky dependency, or when someone proposes adding a pattern or abstraction.
---

# Backend design patterns: project skill loader

The content of this skill lives in the project root so humans and agents read the same file:

1. Read `BACKEND_PATTERNS_SKILL.md`. Start at §1 (symptom → pattern) and only then read the pattern itself in §2.
2. In this repo, apply §3: use Medusa's own mechanism for each pattern (module services, container, providers, events/subscribers, workflows, middlewares, Query). `CLAUDE.md` and `MEDUSA_SKILL.md` take precedence, and every Medusa API still goes through the evidence ladder (`MEDUSA_SKILL.md` §0).
3. When reviewing a PR, run the §4 checklist and flag the §5 anti-patterns.

Hard rule: never add a pattern or abstraction without naming the current problem it solves.
