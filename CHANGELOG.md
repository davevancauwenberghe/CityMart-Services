# Changelog

## 1.4.1

- Fix follow-up review findings: keep balanced, nested and escaped URL parentheses inside complete citations, and display **Safety checked** when the Worker returns `safety: "checked"`.
- Make the `/citycraft` information/status response public. Each member can open their own whitelist form from the shared button; submission confirmations remain private.
- Refine Hall replies for the updated Worker: keep complete web-search citations together, label search and fresh-context responses, surface safe failure reference IDs and explain when a follow-up can continue a truncated answer.
- Preserve the combined question/answer embed, public/private conversation separation, Worker-owned moderation and memory, and private continuations. Attach the complete answer when an individual source link exceeds the embed budget.
- Replace `/citycraft info` and `/citycraft request` with `/citycraft`: one information/status response with the existing whitelist-request button and form.
- Check CityCraft at `157.173.101.60:25565` using the Minecraft Java status protocol. Display status, player counts, verified ping latency and version, with bounded responses, a four-second deadline and a 20-second shared cache.
- Remove `/donations`, `/donationsleaderboard`, `/minecraft player` and `/ranking promote`/`demote`, including their handlers, API clients, credentials and help entries. Startup replaces the guild command registry to remove these entries.
- Support Node 24.15+ and 26, matching the existing Node 26 Docker image, and check both major versions in CI.
- Update deployment instructions and add regression coverage for protocol framing, source links, Hall metadata and CityCraft routing.

No dependency, giveaway schema or Hall secret changes are required for this patch.
