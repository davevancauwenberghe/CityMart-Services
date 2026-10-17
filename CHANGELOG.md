# Changelog

## 1.4.0

- Replace the monolithic JavaScript bot with strict TypeScript modules on Node.js 24 LTS and current discord.js 14.
- Remove keyword/mention replies, automatic keyword reactions, DM message scanning and the privileged Message Content intent. Add interactive `/help`, `/about` and Discord `/user` lookup.
- Use one embed system for information, player services, errors, owner actions, public announcements and DMs; fresh timestamps, safe user text, disabled automatic mentions and bounded payloads.
- Show `/ask` input above the answer, preserve long answers across embedded continuations, add private/reset options and bound conversation memory.
- Harden Roblox, easyPOS and Mojang requests with full-body timeouts, response limits, safe error handling, bounded caches and request coalescing. Preserve integration endpoints, tokens and worker contract.
- Protect administrative actions with configured-guild and server-owner checks. Prevent overlapping rank changes and avoid automatic retries of uncertain mutations.
- Migrate existing giveaways with a backup; serialize atomic saves, fail closed on corruption or missing eligibility roles, prevent duplicate draws and persist retryable delivery state. Add duration input, time-zone-aware dates, autocomplete, lists and paginated entrants; rerolls exclude previous winners.
- Modernize CityCraft forms with labelled modal inputs, Java/Bedrock validation, requester binding, expiry and rate limits.
- Automatically refresh guild commands at startup; improve readiness, graceful shutdown, production container permissions, regression tests, CI, CodeQL and dependency maintenance.

The existing package already declared version 1.4.0; this release keeps that requested version and documents the rewrite here.
