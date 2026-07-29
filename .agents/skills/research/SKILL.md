---
name: research
description: Research a Tabelo technical or product question from current primary sources. Use when implementation depends on precise React, CodeMirror, Base UI, Playwright, Vite, PWA, browser, accessibility, web-standard, GitHub Actions, package-version, compatibility, deprecation, or documented API behavior that cannot be established from the repository alone.
---

# Research

This repository-local workflow replaces machine-local documentation skills. It requires no custom CLI, personal path, or local provider configuration.

## Workflow

1. Define the exact question and the decision it informs. Do not research a broad topic when one API behavior or standard requirement is controlling.
2. Detect the relevant version from `package.json`, `pnpm-lock.yaml`, configuration, or a safe local version command. Separate declared, locked, installed, and unknown versions.
3. Search primary sources first:
   - official versioned documentation and API references;
   - specifications and standards;
   - official release, migration, and deprecation notes;
   - official source and tests;
   - first-party browser or GitHub documentation.
4. Use community material only to locate a lead. Verify consequential claims through a primary source.
5. Preserve source links, source dates, applicable versions, and the exact documented behavior. Do not infer compatibility, availability, deprecation, browser support, or examples that the source does not establish.
6. Cross-check high-impact claims against a second authoritative source or the current implementation when practical.
7. Separate confirmed facts, labeled inference, conflicts, and missing evidence.
8. Return a concise decision-oriented result. Persist a note under `docs/research/` only when the user requests it or the evidence will govern future work.

## Boundaries

- Inspect local code directly when the question is about Tabelo's own behavior.
- Do not update dependencies, configuration, or production code as part of research.
- Do not depend on Context7, personal MCP profiles, globally installed helpers, or files outside this repository.
- If internet access is unavailable, use checked-in sources and installed package source where available, then state which current facts remain unverified.

## Completion

Research is complete when the implementation-relevant conclusion is version-scoped, source-linked, current where necessary, and explicit about uncertainty.
