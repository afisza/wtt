---
name: verify
description: Run TypeScript type-check and production build to verify the project compiles without errors. Use after making changes to confirm nothing is broken.
---

Run the following checks in sequence. Stop and report on the first failure:

1. **TypeScript type-check:** `npx tsc --noEmit`
2. **Tests:** `npm test` (skip if no test files exist yet)
3. **Production build:** `npm run build`

Report a summary of any errors found, or confirm that all checks passed.
