# FMEDA App Review Update

Updated: March 9, 2026

## Executive Summary

The original review was directionally right, but several of its "open" items have already been addressed in the current branch. The project is in a better state now on tooling, draft persistence, and read-side store subscriptions. The biggest remaining gaps are still product maturity items: spreadsheet-grade editing, scalable performance for large FMEDAs, unified document context, offline-safe PDF parsing, richer safety/compliance modeling, and revision/reporting workflows.

## What Has Already Been Done

### Completed Since The Original Review

- Tooling baseline is now in place.
  - `eslint.config.js` exists and `bun x eslint .` now passes.
  - `package.json` now includes `lint`, `test`, and `test:ui` scripts.
- Real unit test files were added.
  - `src/utils/calculations.test.ts` now uses `vitest`.
  - `src/utils/migration.test.ts` now uses `vitest`.
- Wizard draft persistence is more complete.
  - `src/components/CreateProjectWizard.tsx` now saves, restores, clears, and resumes local drafts.
  - `src/utils/wizardDraft.ts` centralizes snapshot/load/save helpers.
  - `src/components/Home.tsx` surfaces a "Resume Wizard Draft" entry point.
- Some Zustand subscription pressure has been reduced.
  - `src/store/fmedaStore.ts` now exposes selectors such as `selectNodeCount`, `selectHomeSummary`, `selectRootNodeIds`, `selectSelectedPath`, and `selectVisibleNodes`.
  - `src/App.tsx`, `src/components/Home.tsx`, and `src/components/SidebarLeft.tsx` consume narrower derived selectors instead of all reading broad store state directly.
- Table navigation polish improved.
  - `src/components/FmedaTable.tsx` includes hierarchy breadcrumbs, typed row styling, and clearer rename/navigation affordances.

### Partially Addressed

- State-read performance is improved, but write performance is still expensive.
  - Read-side subscriptions are narrower than before.
  - Write-side mutations in `src/store/fmedaStore.ts` still call `recalculateAllTotals(...)` for the full tree on every add, update, move, and delete.
- Quality gates are improved, but coverage is still narrow.
  - Linting is now configured and passing.
  - Tests exist, but only for calculations and migration; import/export, AI orchestration boundaries, and document parsing still have no focused test coverage.
- Wizard UX is stronger, but wizard internals still rely on heavy cloning.
  - `src/components/wizard/StepArchitecture.tsx`
  - `src/components/wizard/StepFunctions.tsx`
  - `src/components/wizard/StepFailureModes.tsx`
  - `src/services/aiService.ts`
  - These still use `JSON.parse(JSON.stringify(...))`, which will not scale well as data grows.

## Open Points That Still Stand

### Product / UX

- The analysis view is still not a spreadsheet-grade engineering grid.
  - I did not find sorting, filtering, column pinning, saved views, multi-select, fill-down, bulk edit, or Excel-style range paste in `src/components/FmedaTable.tsx`.
- Large-model usability is still at risk.
  - `src/components/FmedaTable.tsx` uses TanStack Table core + expanded row models only.
  - I did not find virtualization in the table or hierarchy sidebar.
- The document workflow is still split across two sources of truth.
  - Wizard/project context persists `projectContext.documentText`.
  - Analysis-time uploads still live in `src/store/documentStore.ts` and are consumed separately by `src/components/DocumentUpload.tsx` and `src/components/cells/EditableAICell.tsx`.
  - From a user perspective, that still creates a "wizard docs vs analysis docs" mismatch.
- PDF export/report generation is still missing.
  - `src/App.tsx` offers JSON, CSV, and Excel export, with XML still marked "Soon".
  - There is still no native PDF report output.

### Architecture / Performance

- Component concentration is still high.
  - `src/components/FmedaTable.tsx`, `src/utils/export.ts`, `src/services/aiService.ts`, and `src/components/CreateProjectWizard.tsx` remain large multi-responsibility files.
- Build chunk size warnings are still present.
  - Current build still emits a large main chunk and a large Excel chunk.
- Full-tree recalculation is still the main scaling concern.
  - Selector cleanup helped read performance, but mutation cost remains tied to recomputing all totals.

### Safety Domain Depth

- The FMEDA domain model is still simplified.
  - `src/types/fmeda.ts` still centers on Safe/Dangerous, FIT, and diagnostic coverage.
  - I still did not find modeled support for latent faults, residual faults, single-point vs multiple-point faults, SPFM/LFM/PMHF metrics, safety mechanism categories, or requirement traceability.
- Compliance-aware validation still appears early-stage.
  - I did not find rule-driven checks for standards-specific completeness or consistency.

### Operational Risk

- PDF parsing still depends on a CDN worker.
  - `src/utils/documentParser.ts` still sets `pdfjsLib.GlobalWorkerOptions.workerSrc` to a `cdnjs` URL.
  - That remains a deployment risk in locked-down environments.

## Current Verification

- `bun run build`: passed on March 9, 2026.
- `bun x eslint .`: passed on March 9, 2026.
- Build output still warns about large chunks.
- `bun run test --run`: could not be re-verified in this WSL environment because Bun failed with `UtilBindVsockAnyPort:307: socket failed 1`. The test files are present, but I could not complete a fresh runtime test pass from this session.

## Revised Takeaway

This is no longer just a rough prototype. It now has a credible local persistence story, a working lint setup, baseline tests, and better selector hygiene than the original review reflected. The next phase should focus on the items that most directly determine whether engineers will trust it for real FMEDA work: fast grid editing, predictable persisted document context, scalable recalculation/virtualization, offline-safe PDF ingestion, and a more standards-aware safety model.
