# v1.4.1 review

The review covers the command registry, routing, Hall Worker contract, CityCraft request flow, runtime configuration and affected documentation. It is a focused maintenance review, not an independent security audit.

## Changes and safeguards

- Deprecated command families and their integration code are removed. Guild registration replaces the full command list on startup.
- CityCraft status is fetched only when requested. Concurrent checks share one connection, and positive and negative results are cached for 20 seconds. Status uses a four-second total deadline, validates packet framing and UTF-8 JSON, limits response bytes and verifies the ping nonce before reporting latency. Only counts and the version are retained in the cache; player names and MOTD are omitted.
- Status checks cannot log in, run commands or modify the Minecraft server. The whitelist button remains available when the server cannot be reached. Form nonces remain bound to their Discord user and guild, expire after ten minutes and are single-use. Requests are delivered only after the user submits the form.
- Hall continues to use the authenticated `/api/chat` and `/api/reset` contract. The Worker retains responsibility for SFW moderation, model selection, web search and expiring conversation memory. The bot has no second transcript, never sends its own history or prompt and never automatically retries paid requests.
- Search sources in the answer remain clickable and intact when split between embeds. Extremely long individual links use a complete Markdown attachment. Public/private context identities and reply visibility remain separate. Worker failure IDs are accepted only in UUID form; arbitrary provider messages and fields are not shown.
- Node engine metadata now includes both the local Node 24 line and the existing Node 26 Docker runtime. CI verifies both and retains the production container smoke test.

## Validation

Automated checks cover TypeScript, formatting, the compiled build, production dependency auditing, command schemas, interaction acknowledgement and privacy, Hall metadata/errors, source-link boundaries, protocol fragmentation/malformed frames/deadlines/cache coalescing, and existing giveaway persistence/restart behavior. Tests use local servers and mocks; no Discord login, real request delivery or paid OpenAI call is made.

A one-off read-only probe of `157.173.101.60:25565` from the development environment returned unreachable. This does not establish whether the server is offline. Confirm status from the deployed bot's network. Minecraft must have status responses enabled and the bot must be allowed outbound TCP access to that endpoint.

Docker is not available in the local development environment; the existing container build and volume/readiness smoke checks run in GitHub Actions. After deployment, verify the refreshed guild command list, `/citycraft` and its form with a test account, then `/ask`, a follow-up and `/forget` in both reply modes. Grant Attach Files for Hall's rare long-link fallback.

## Existing operational limits

- One production bot process must own the giveaway volume. Preserve backups; do not share the token or storage with PR previews.
- Discord delivery and local storage are not one transaction. Existing giveaway retry and DM-delivery limits are described in README.md.
- Whitelist requests depend on the owner's Discord DMs being open. The bot submits requests for review; it does not grant access automatically.
- A status timeout or blocked network path cannot distinguish an offline game server from an unreachable one. Valid status without pong reports online with no latency value. The fixed endpoint does not discover DNS SRV targets or query Bedrock UDP.
- Hall availability, web-search access, content safety and context retention depend on the separately deployed Worker and its provider configuration. Discord messages persist independently of `/forget`.
