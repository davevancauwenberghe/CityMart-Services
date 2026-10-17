# Contributing

Create a branch or fork and open a pull request against `main`. Use Node.js 24 and a separate Discord development bot and guild. Never commit tokens, `.env` files or giveaway records.

```bash
npm ci
npm run format
npm run check
npm test
npm run build
npm audit --omit=dev
```

Keep command definitions in `src/commands.ts`, interaction routing in `src/router.ts`, presentation in `src/ui.ts`, external APIs in `src/services`, and persistent giveaway behavior in `src/giveaways`. Use embeds for Discord messages and disable automatic mentions. Acknowledge interactions before network access; modal opening must be the initial response.

Validate external data, bound request time and response size, and avoid logging raw responses or credentials. Do not automatically retry ranking mutations. Storage changes need a backwards-compatible migration, corruption handling and tests covering restart/failure behavior. Add focused regression tests for bugs and update the command guide and environment documentation when behavior changes.

The CI image test uses temporary data, never a production volume. Do not run two bot replicas with the same token and storage.
