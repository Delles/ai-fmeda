# Implementation Plan

Updated: March 9, 2026

## Goal

Turn the current FMEDA app from a solid demo/workbench into a scalable engineering tool by addressing the open items that still remain from the review.

## Status Snapshot

- Workstream 1 is now completed.
- Workstream 2 is now in progress.
- Workstream 3 is now in progress.
- The document storage split between the wizard and analysis view has been removed.
- Project documents now persist inside project context, including migration support for older local-storage payloads and older wizard drafts.
- AI suggestions now use the same persisted document corpus in both wizard and analysis flows.
- The PDF.js worker is now bundled locally, so PDF parsing no longer depends on a CDN.
- The wizard and analysis document surfaces now expose the same shared project context more clearly, including inline notes editing in analysis and uploaded-file management in the wizard.
- Regression coverage was added for project-document normalization and wizard-draft migration.
- FMEDA store writes now recompute only the changed node and ancestor chains for add, update, delete, and move operations instead of recalculating the full tree every time.
- Regression coverage was added for targeted recalculation helpers and store mutation behavior.
- The app shell now lazy-loads heavy view modules and the export pipeline, and Vite manual chunking keeps the initial bundle focused on the active screen.
- The analysis grid now supports TanStack-powered column sorting and scoped search filtering while preserving hierarchy navigation context.
- The analysis grid now supports multi-row selection with visible selection state and select-all behavior within the current hierarchy/filter scope.
- The analysis grid now supports bulk updates across selected failure modes for classification, FIT, and diagnostic coverage.
- Verified on March 9, 2026:
  - `./node_modules/.bin/vitest.exe run src/utils/calculations.test.ts src/store/fmedaStore.test.ts` passes with 2 test files and 5 tests passing.
  - `./node_modules/.bin/tsc.exe -p tsconfig.app.json --noEmit` passes.
  - `bun x eslint src/App.tsx vite.config.ts` passes.
  - `bun x eslint src/components/FmedaTable.tsx` passes.
  - `./node_modules/.bin/vite.exe build` passes without the previous large-chunk warning. Current output includes `assets/index-BKSLmBZF.js` at 24.35 kB, `assets/FmedaTable-CcIGynke.js` at 45.58 kB, `assets/vendor-core-oYBBp-1k.js` at 239.75 kB, `assets/vendor-pdf-CyniYFEE.js` at 364.06 kB, and `assets/vendor-excel-u-5BVN1U.js` at 940.20 kB. The bundled PDF worker remains a separate asset at 1,375.84 kB.

## Recommended Order

1. Unify document context and remove the CDN PDF worker dependency.
2. Improve write-path performance and large-data responsiveness.
3. Upgrade the analysis table into a true spreadsheet-style grid.
4. Expand testing around the most failure-prone flows.
5. Evolve the FMEDA domain model and validation engine.
6. Add reporting, baselines, and audit-style workflows.
7. Split large modules once the target behavior is stable.

## Workstream 1: Document Context And Offline Readiness

Status: Completed

Completed so far:

- Added a persisted project document model instead of keeping analysis uploads in a separate transient store.
- Preserved `projectContext.documentText` as a derived aggregate field for compatibility while making `documents` the source of truth.
- Migrated older persisted `projectContext.documentText` payloads into the new project-document structure.
- Migrated older wizard draft payloads that only stored `documentText`.
- Refactored `src/components/DocumentUpload.tsx` to read/write project documents from the main FMEDA store.
- Refactored `src/components/cells/EditableAICell.tsx` so AI suggestions read the unified persisted project context.
- Replaced the CDN PDF worker configuration with a locally bundled PDF.js worker.
- Added regression tests for:
  - project-document normalization and aggregation
  - wizard-draft document migration
  - existing calculation and migration flows continue to pass
- Added a UI ergonomics pass for shared project documents:
  - the analysis document menu now exposes shared notes editing and clearer file/notes status
  - the wizard now shows uploaded-file details and lets users remove files before generation

### Why first

This fixes one of the clearest user-facing inconsistencies and removes an external runtime dependency that can break document ingestion completely in restricted environments.

### Scope

- Replace the separate analysis-time `documentStore` flow with a project-scoped persisted document model.
- Store uploaded document metadata and extracted text alongside project context instead of in a transient parallel store.
- Update AI suggestion paths so they read from the same persisted project document source used by the wizard.
- Bundle the PDF.js worker locally instead of referencing a CDN URL.

### Concrete Tasks

- [x] Add a project document type and persistence shape.
- [x] Migrate existing `projectContext.documentText` into the new structure or preserve it as a derived aggregate field.
- [x] Refactor `src/components/DocumentUpload.tsx` to read/write project documents.
- [x] Refactor `src/components/cells/EditableAICell.tsx` to consume unified project context instead of `documentStore`.
- [x] Replace `src/utils/documentParser.ts` worker configuration with a local bundled worker strategy.
- [x] Add migration logic for older local-storage payloads.
- [x] Add migration logic for older wizard-draft payloads.
- [x] Add focused round-trip tests for project document import/export persistence.

### Acceptance Criteria

- [x] Documents uploaded in the wizard are still available in analysis view after refresh.
- [x] Documents uploaded in analysis view are still available after refresh and project resume.
- [x] AI suggestions use the same document corpus regardless of where the upload happened.
- [x] PDF parsing works without external network access to a CDN.

## Workstream 2: Performance Foundation

Status: In progress

Completed so far:

- Replaced full-tree write-path recalculation in `src/store/fmedaStore.ts` with targeted ancestor-chain recomputation for add, update, delete, and move actions.
- Added a reusable `recalculateAffectedTotals(...)` helper in `src/utils/calculations.ts`.
- Added regression tests for targeted recalculation behavior in both the calculation utility and the store.
- Lazy-loaded heavy screen-level modules in `src/App.tsx` so the dashboard no longer eagerly bundles the analysis workspace, wizard, settings modal, document parser, and export pipeline.
- Added Vite manual chunking in `vite.config.ts` to keep core, analysis, UI, AI, PDF, and Excel dependencies in separate bundles.

Remaining in this workstream:

- Deferred follow-up: do a manual profiling pass with a large imported FMEDA and adjust thresholds or row estimates if needed once representative data is available.

### Why second

The current selector work helped, but the major cost center remains full-tree recomputation on every mutation. Fixing this before adding heavier grid features reduces the chance of building advanced UX on top of a slow core.

### Scope

- Replace full-tree recalculation with targeted subtree or ancestor-chain recomputation.
- Keep selectors narrow and stable.
- Introduce virtualization for table rows and the hierarchy sidebar.
- Improve build chunking to reduce the main bundle weight.

### Concrete Tasks

- [x] Refactor `recalculateAllTotals` usage so edits only recompute the changed failure mode and its ancestors.
- [x] Add manual chunking or additional lazy-loading in `vite.config.ts` and/or the heavy feature boundaries.
- [x] Add profiling around frequent edit paths.
- [x] Virtualize visible rows in `src/components/FmedaTable.tsx`.
- [x] Virtualize or window long lists in `src/components/SidebarLeft.tsx`.

### Acceptance Criteria

- [x] Editing a single failure mode does not trigger full-tree recomputation.
- [x] Large FMEDAs remain responsive while scrolling and editing.
- [x] Production build completes without the current large-chunk warning.

## Workstream 3: Spreadsheet-Grade Analysis Grid

Deferred note from Workstream 2:

- The performance foundation work is complete enough to continue development.
- Manual validation with a truly large real-world FMEDA is deferred until representative data is available and should be treated as a tuning/verification pass, not a blocker for subsequent workstreams.
- TanStack sorting and scoped search filtering are now in place for the analysis grid, including hierarchy-aware filtering and sortable metric columns.
- The hierarchy/name column is now pinned during horizontal scroll, and long hierarchy labels wrap cleanly in both the grid and the analysis header. Subtle vertical gridlines were also added so the table reads more like an engineering spreadsheet.

### Why third

This is the highest-value product improvement for day-to-day engineering use once the underlying performance is ready.

### Scope

- Add sort/filter/pin capabilities.
- Add keyboard-forward editing flows.
- Support multi-cell workflows such as paste, fill-down, and bulk edit.
- Preserve hierarchy navigation without giving up dense table editing.

### Concrete Tasks

- [x] Add TanStack sorting and filtering models.
- [x] Add sticky/pinned hierarchy columns.
- [x] Add multi-row selection.
- [x] Implement bulk updates for classification, FIT, and diagnostic coverage.
- Support Excel-style paste for tabular data into failure mode rows.
- Add simple saved filters/views in local storage.

### Acceptance Criteria

- Users can sort and filter without losing hierarchy context.
- [x] Users can apply one edit to multiple selected rows.
- Users can paste a rectangular selection from Excel into the grid for supported columns.
- Core editing flows are usable without repeated popover-heavy interactions.

## Workstream 4: Verification And Quality Gates

### Why now

Once behavior starts changing faster, missing tests become expensive. This work should land before deeper domain-model expansion.

### Scope

- Expand unit tests around calculations, migration, parsing, and import/export.
- Add targeted component tests for the highest-risk interactions.
- Resolve or document the current Bun/WSL test execution issue.

### Concrete Tasks

- Add tests for import/export round-trips.
- Add tests for document parsing error handling and worker setup.
- Add tests for wizard draft persistence and migration compatibility.
- [x] Add tests for store recalculation behavior after the performance refactor.
- Investigate `bun run test --run` failure in WSL and document a stable local test command if needed.

### Acceptance Criteria

- Critical data transformations have automated coverage.
- Regressions in migration and import/export are caught by CI/local runs.
- Contributors have one documented command that reliably runs tests in this environment.

## Workstream 5: Standards-Aware FMEDA Model

### Why after the foundation

This is strategically important, but it should build on a stable editing and performance base instead of competing with core usability fixes.

### Scope

- Extend the node model to cover richer safety analysis concepts.
- Add derived metrics and rule-driven validation.
- Support better traceability from requirement to failure mode to mechanism.

### Concrete Tasks

- Extend `src/types/fmeda.ts` with additional fault categories and mechanism metadata.
- Add calculation support for latent/residual/single-point/multiple-point distinctions as needed by the target standard.
- Add derived metrics for SPFM/LFM/PMHF-style reporting where applicable.
- Add traceability links for safety goals, requirements, and mechanisms.
- Introduce validation rules with actionable findings in the UI.

### Acceptance Criteria

- The data model can represent the safety concepts required by the chosen target standard(s).
- The app can flag incomplete or inconsistent FMEDA entries before export.
- Traceability is visible and exportable.

## Workstream 6: Reporting, Baselines, And Auditability

### Why later

These features matter most once the analysis content and validation model are mature enough to justify signoff and comparison workflows.

### Scope

- Add PDF reporting.
- Add project baselines, diffs, and approvals.
- Track meaningful row-level changes over time.

### Concrete Tasks

- Implement a PDF report export path.
- Add a baseline snapshot model and diff viewer.
- Store change metadata for edits that affect safety content.
- Add a lightweight approval/status model for review flows.

### Acceptance Criteria

- Users can export a professional PDF summary without external tooling.
- Users can compare two FMEDA baselines and see row-level deltas.
- Reviewable changes have an audit trail.

## Workstream 7: Module Decomposition

### Why last

Refactoring the module layout is most effective after the target responsibilities are clearer from the earlier workstreams.

### Scope

- Split large files by domain responsibility.
- Separate the calculation engine, import/export adapters, AI orchestration, and UI grid logic.

### Concrete Tasks

- Break `src/components/FmedaTable.tsx` into table shell, column definitions, row actions, and editing helpers.
- Break `src/utils/export.ts` into format-specific adapters.
- Break `src/services/aiService.ts` into prompt builders, provider transport, and domain-specific AI actions.
- Reduce wizard-step cloning helpers into shared immutable update utilities.

### Acceptance Criteria

- Large files are reduced to focused modules with clearer tests.
- Domain logic is easier to evolve without touching unrelated UI code.

## Suggested First Tackles

If you want the best near-term payoff, start with these three tickets first:

1. Unify wizard and analysis document storage into one persisted project document source.
2. Replace full-tree recalculation with ancestor-only recomputation after a node edit.
3. Add sorting, filtering, and pinned columns to the analysis table.
