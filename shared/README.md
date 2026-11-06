# shared/ — cross-platform contracts and fixtures

Single source of truth for data shapes and behaviour rules that the web app
(`src/`) and the Android app (`android/`) must agree on.

| Path | What |
|---|---|
| `contracts/*.contract.json` | Data contracts (fields, types, enums, defaults, id rules). Versioned by `version`. |
| `test-fixtures/*.cases.json` | Golden cases: `{ id, description, input, expected }`, file-level `contract` + `contractVersion`. |

Both platforms run the **same** fixture files:

- web: `src/__tests__/contracts/*.test.ts` (validator `src/lib/contracts/validate.ts`);
- Android: `android/app/src/test/kotlin/com/mq1/player/contracts/*` (validator
  `data/contracts/ContractValidator.kt`). Gradle adds `shared/` as a unit-test
  resource dir, so files are read from the classpath (`contracts/…`, `test-fixtures/…`).

Rules:

1. Change the contract → bump `version` if a field is removed/retyped; adding an
   optional field keeps the version.
2. Every contract field must exist in the web `Track` type **and** the Kotlin
   `Track` model — both test suites assert the field sets are equal.
3. Add a fixture case for every bug found in cross-platform data handling.
4. Error codes are `<field>:<rule>` and must be identical on both platforms.
5. CI: changes under `shared/**` trigger web, desktop and Android jobs.
