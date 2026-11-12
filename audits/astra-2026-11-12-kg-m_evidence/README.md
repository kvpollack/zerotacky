# Audit evidence

All evidence belongs to main 86514d46257948b0a2746a82f296f66b8cdda73b.

Pure/controller/SQL probes use a frozen source snapshot. `sync.ts` uses the repository fake PostgREST server and reproduces the hook merge explicitly. SQL uses PGlite with a reduced synthetic schema and exact migration function bodies, not a remote database. Browser probes load frozen components into an isolated document and block every external request. The synthetic example.invalid URLs and A/TOKEN credentials are test placeholders only.

`read_staging.py` contains only staging SELECT queries and reads its credential from the user's local credential file; no credential is included here. Staging public RPC checks returned metric for both metric fixtures; the full public payload was not bundled because it adds unnecessary contact/registration data.

`manifest.json` identifies all 394 snapshot files. Reproduction helpers expect a `source/` checkout matching that manifest, Bun, and the prior local PGlite/Playwright harness paths shown in the scripts. These are evidence helpers, not a standalone distributable test suite. The retained local audit kit is under ~/.aki/tmp/astra-units-1112/.

The final browser run and all pure/SQL/controller probes completed successfully. Earlier harness setup/selector errors were corrected; the report uses only the successful final outputs. Tone pass left four technical source-reference separator flags intentionally.
