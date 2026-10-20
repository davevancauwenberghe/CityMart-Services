# CityMart Services 1.4.1

A Discord bot for the CityMart community. Built with TypeScript, Node.js 24 or 26 and discord.js 14. All Discord messages use consistent embeds. Ordinary messages do not trigger commands or reactions, and the bot does not read message content.

## Commands

| Command                                          | Purpose                                                                |
| ------------------------------------------------ | ---------------------------------------------------------------------- |
| `/help`                                          | Browse an interactive command guide.                                   |
| `/about`, `/ping`                                | Version, uptime and responsiveness.                                    |
| `/support`                                       | Find the support team.                                                 |
| `/community`, `/experience`, `/application`      | CityMart Roblox links.                                                 |
| `/documentation`, `/lorebook`, `/lamp`           | Guides, stories and a lamp.                                            |
| `/user [member]`                                 | Discord account, join date, roles and avatar.                          |
| `/memberlookup username`                         | Roblox profile and CityMart community role.                            |
| `/communitycount`                                | Current Roblox community size.                                         |
| `/activity username`                             | easyPOS playtime, messages and positions.                              |
| `/ask prompt [private] [reset]`                  | hallAI question and answer in one embed; long answers continue safely. |
| `/forget [private]`                              | Delete your public or private Hall context in this channel.            |
| `/citycraft`                                     | Public status, player count, ping and a whitelist-request button.      |
| `/giveaway list`, `/giveaway entries message_id` | Find giveaways and browse participants.                                |
| `/giveaway start prize [duration] [end]`         | Owner: start a giveaway in the current channel.                        |
| `/giveaway end message_id`                       | Owner: draw early or retry an interrupted result delivery.             |
| `/giveaway reroll message_id`                    | Owner: choose a new winner, excluding previous winners.                |
| `/giveaway removeentrant message_id user`        | Owner: remove an entrant before the draw.                              |

Use exactly one giveaway timing option: `duration:2h`, `duration:7d`, or `end:2026-12-20 18:00`. Dates use `TIME_ZONE` (Europe/Brussels by default); ambiguous or skipped daylight-saving times are rejected. Durations run for the requested elapsed time. Giveaways may last between one minute and 90 days. Existing giveaway buttons remain compatible.

Administrative actions are restricted to the configured Discord server's owner. Use Discord **Server Settings → Integrations → CityMart Services** to restrict command availability further; this does not grant non-owners giveaway management rights. Participation requires the configured minimum role or a higher role; a missing configured role blocks entries rather than allowing everyone. Eligibility is checked when joining. Rerolls use the saved entrants, so the owner should remove ineligible entrants before ending a giveaway.

`/ask` defaults to a public answer. Set `private:true` to keep both the answer and its continuations visible only to you. The authenticated Hall v2 Worker keeps up to 12 exchanges and expires them after 24 hours of inactivity, including across bot restarts. Context is separated by your account, server, channel and public/private reply mode. `reset:true` deletes that context before asking. `/forget` deletes your public Hall context in this channel; `/forget private:true` deletes private context. Both confirmations are private. This does not delete Discord posts or provider security logs. Do not send secrets to the AI. The bot does not keep a second transcript in its own memory.

## Add an optional labs server

Keep `GUILD_ID` set to the existing CityMart server. Invite the **same bot application** to your labs server before enabling it, using a Discord guild-install link with `bot` and `applications.commands` scopes. Grant View Channel, Send Messages, Embed Links, Attach Files, Read Message History and Send Messages in Threads where needed. Administrator is unnecessary.

In the existing Coolify application's **production runtime Environment Variables**, add `LAB_GUILD_ID` with your labs server's ID. It can be marked as a secret in Coolify; disable build-time availability, save and redeploy. Keep the existing bot token, Hall secrets and `/data` volume. The bot verifies access to both servers and registers the full slash-command list in each before becoming ready. An invalid or inaccessible configured server blocks startup, so invite the bot first.

Optional labs-only settings:

- `LAB_SUPPORT_CHANNEL_ID`: a support channel **in labs**. Unset shows a message to contact that server's team, without a production channel link.
- `LAB_GIVEAWAY_MIN_ROLE_ID`: a minimum participation role **in labs**. Unset allows all human members in labs. A configured role that is missing blocks entries. The production minimum role is never reused in labs.

Giveaway creation, entries, lists, autocomplete, owner actions, scheduled draws and winner support links use the current server. Only that server's owner can manage its giveaways. Hall memory already separates server, channel, member and public/private reply mode; `/forget` affects only the selected context in the current server. Whitelist forms remain bound to their requester and server.

Startup announcements and Roblox community-size updates continue to use the primary server's `GENERAL_CHANNEL_ID` and `COMMANDS_CHANNEL_ID`. Both servers share this one running bot, code version and configured live integrations; labs is not a separate deployment or a mock environment. Use a separate bot application and Coolify deployment if you need an experimental code version independent of production.

To disable labs, remove all three `LAB_*` settings and redeploy. Existing giveaway records are retained, and scheduling for the removed server stops. Previously registered commands may remain visible there until the bot is removed, but requests are rejected.

## Upgrade from 1.4.0 to 1.4.1

1. Deploy this release using your existing Hall connection and `/data` volume. No new secret or data migration is required for this update; the Hall secrets required since 1.4.0 remain required.
2. Allow outbound TCP from the bot to `157.173.101.60:25565` for the CityCraft status check. The defaults already match this server. Set `CITYCRAFT_STATUS_HOST` and `CITYCRAFT_STATUS_PORT` only if the target changes; keep `CITYCRAFT_ADDRESS` as the address shown to players and sent in the Minecraft handshake.
3. Startup bulk-replaces the guild command registry. Confirm `/citycraft` shows information and the **Request whitelist access** button. `/citycraft info` and `/citycraft request` are removed, along with `/donations`, `/donationsleaderboard`, `/minecraft player` and `/ranking`.
4. Grant **Attach Files** where Hall is used, then check `/ask`, a follow-up, `/forget`, and `private:true`. Existing `EASYPOS_DONATIONS_TOKEN`, `EASYPOS_RANKING_TOKEN` and `EASYPOS_RANKING_MOD_ID` variables are unused and can be removed from Coolify.

`/citycraft` posts its information and status publicly in the channel. Any member can use its **Request whitelist access** button; the form belongs to the member who clicked it. Submitted usernames are sent privately to the configured owner, and submission confirmations and errors are private.

CityCraft performs a read-only Java Server List Ping, with a four-second deadline and a shared 20-second cache. It reports online only after a valid Minecraft response; latency is shown only after a matching pong. A refused connection or timeout is labelled **Offline or unreachable**, since network access cannot prove the server is offline. Player names and the server MOTD are not displayed or stored. Whitelist requests remain available during a status failure. No RCON password, inbound port or extra dependency is needed.

## Upgrade the existing Coolify application

1. Back up the existing `/data` volume before upgrading. Keep it mounted at `/data`.
2. Deploy the companion Hall v2 Worker first, with its `OPENAI_API_KEY` and `DISCORD_API_KEY` secrets configured.
3. Before deploying this bot, set `WORKER_URL` to the Worker's HTTPS origin (for example, `https://hall.davevancauwenberghe.be`) and `HALLAI_API_KEY` to exactly the same secret as the Worker's `DISCORD_API_KEY`. Add them to Coolify's **production runtime Environment Variables**, with build-time availability disabled, and mark `HALLAI_API_KEY` as a secret. **Both variables are required for `/ask` and `/forget`.** Keep your other runtime variables; `CLIENT_ID` is checked when set, or derived from the logged-in bot when absent.
4. Merge the reviewed PR and deploy `main` using the **Dockerfile** build pack. Keep only one production instance, with **Consistent name (no rolling updates)** enabled. Avoid running the Fly copy or PR previews with the production bot token. Do not override the new Docker start command with `node index.js`.
5. Ensure the Discord installation includes `bot` and `applications.commands`. The bot registers the current guild command list automatically at startup, removing deprecated commands and replacing the CityCraft subcommands with `/citycraft`.
6. **Message Content Intent, Server Members Intent and Presence Intent are unnecessary and can be disabled** in the Developer Portal. The bot uses only the Guilds gateway intent and fetches individual members when needed.
7. Read Runtime Logs for `CityMart Services v1.4.1 ready as ... Slash commands registered.` Then check `/help`, `/user`, `/ask`, `/forget`, and your enabled integrations. Create a small test giveaway, enter it, redeploy, and confirm the saved entry and eventual result.

The Docker entrypoint repairs ownership of the bot's data directory and its two known data files, then runs Node as the container's unprivileged `node` user. No additional Linux account is needed on the VPS. It does not recursively change unrelated files. Custom volume layouts must allow UID 1000 to write `DATA_DIR`.

### Coolify configuration

| Setting                       | Value           |
| ----------------------------- | --------------- |
| Branch                        | `main`          |
| Build pack                    | Dockerfile      |
| Base directory                | `/`             |
| Dockerfile location           | `/Dockerfile`   |
| Ports exposes                 | `8080`          |
| Port mappings                 | Empty           |
| Domains                       | Empty           |
| Persistent storage type       | Volume Mount    |
| Volume name                   | `citymart-data` |
| Destination path              | `/data`         |
| Add suffix for PR deployments | Enabled         |

The bot connects outward to Discord; it needs no publicly accessible HTTP endpoint. Leave PR previews disabled unless they have a separate test bot, guild and storage. The public landing page, privacy and terms pages remain removed. `BOT_URL` is unused and can be deleted. `WORKER_URL` is the Hall v2 Worker origin; the bot calls `/api/chat` and `/api/reset`.

Set variables in Coolify's **production Environment Variables**, available **at runtime**, with build-time availability disabled. Mark credentials as secrets. `NODE_ENV=production` is already set by the Docker image; the separate build stage installs the TypeScript build tools.

| Variable                   | Purpose                                                                                 |
| -------------------------- | --------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`            | Required bot token.                                                                     |
| `LAB_GUILD_ID`             | Optional additional labs Discord server ID; unset keeps single-server behavior.         |
| `LAB_SUPPORT_CHANNEL_ID`   | Optional labs-only support channel; never falls back to production.                     |
| `LAB_GIVEAWAY_MIN_ROLE_ID` | Optional labs-only minimum role; unset allows all human labs members.                   |
| `GUILD_ID`                 | Required primary CityMart Discord server ID.                                            |
| `CLIENT_ID`                | Optional bot application ID; required only for manual registration.                     |
| `SUPPORT_CHANNEL_ID`       | Support links and giveaway winner claim links.                                          |
| `GENERAL_CHANNEL_ID`       | Optional startup announcement channel.                                                  |
| `COMMANDS_CHANNEL_ID`      | Optional Roblox community size update channel.                                          |
| `ROBLOX_GROUP_ID`          | Roblox community ID; defaults to `36060455`.                                            |
| `GIVEAWAY_MIN_ROLE_ID`     | Optional minimum participation role. Unset means all human members may enter.           |
| `HALLAI_API_KEY`           | Secret matching the Hall Worker’s `DISCORD_API_KEY`; required for `/ask` and `/forget`. |
| `WORKER_URL`               | HTTPS Hall v2 origin, e.g. `https://hall.davevancauwenberghe.be`.                       |
| `EASYPOS_TOKEN`            | Activity API token.                                                                     |
| `CITYCRAFT_OWNER_USER_ID`  | Optional request recipient; defaults to the existing Dave account `651525636351066182`. |
| `CITYCRAFT_STATUS_HOST`    | Status connection target; defaults to `157.173.101.60`.                                 |
| `CITYCRAFT_STATUS_PORT`    | Status connection port; defaults to `25565`.                                            |
| `CITYCRAFT_ADDRESS`        | Defaults to `citycraft.davevancauwenberghe.be`.                                         |
| `TIME_ZONE`                | Giveaway date input zone; defaults to `Europe/Brussels`.                                |
| `DATA_DIR`                 | Writable persistent directory; defaults to `/data`.                                     |
| `PORT`                     | Internal health port; defaults to `8080`.                                               |
| `USER_AGENT`               | Optional outbound API identification string.                                            |

Missing optional integration credentials produce a helpful embed instead of crashing the bot. Invalid configured IDs, URLs or time zones stop startup. Give the bot View Channel, Send Messages, Embed Links and Read Message History in relevant channels, plus Send Messages in Threads where applicable. Administrator and Manage Roles are not needed. Whitelist-request delivery and giveaway winner DMs depend on the recipient allowing DMs.

### Storage, health and recovery

Giveaways are stored in `/data/giveaways.json`. The old object-based file is validated and automatically migrated on the first start, with an original copy at `/data/giveaways.json.legacy.bak`. The schema changes: back up before upgrading and restore the old file if rolling back to the old bot. Historical finished giveaways are retained without resending old announcements.

Writes are serialized, flushed to disk and atomically renamed. An unreadable or corrupt file stops startup; it is not silently reset. Capacity is 2,000 records, 10,000 entrants per giveaway and 20 MiB total. Archive old completed records offline before reaching these limits. Exactly one bot process must use a given volume; this file store does not coordinate multiple replicas.

Pending button activation and entrant-count refreshes are repaired every 30 seconds. A result is saved before delivery. Failed channel edits or announcements are retried every 30 seconds using the saved winner; `/giveaway end` also retries immediately. Public announcement nonces reduce duplicate sends after an interrupted response. Discord and local storage cannot form a single transaction: extremely late retries can still duplicate an announcement. Winner DMs are attempted at most once per draw, so a crash at that boundary can miss a DM; the channel result remains authoritative. Closed DMs do not block completion. Entrants are not pinged because all messages disable automatic mentions.

- `GET /health`: HTTP 200 while the health listener is alive.
- `GET /ready`: HTTP 200 only after Discord connects and commands are registered; otherwise HTTP 503.
- HEAD is supported; responses are not cached; all other paths return 404.
- Docker probes `/ready` every 30 seconds, with a 90-second startup grace period.
- SIGTERM/SIGINT stop intake, cancel outbound requests and drain active tasks. Unhandled failures exit with an error so the container can restart.

Keep regular off-server backups of the volume. If startup reports invalid state, preserve the file and restore a known-good backup. For a pending giveaway result, restore channel permissions or configure access to the saved channel before retrying. Logs include event names, safe error types/status codes and system/Discord error codes; tokens, AI questions, upstream bodies and arbitrary exception messages are omitted.

## Development

Use Node.js 24.15 or newer in the 24.x line (see `.nvmrc`), or Node.js 26. CI checks both major versions; Docker uses Node.js 26.

```bash
npm ci
cp .env.example .env
# Fill in a separate development bot and guild; use DATA_DIR=./data locally.
npm run dev
```

```bash
npm run format:check
npm run check
npm test
npm run build
npm audit --omit=dev
```

`npm start` runs the compiled application. `npm run commands` manually refreshes guild commands after building, if needed. Local `.env` loading uses Node's built-in loader. Production does not depend on TypeScript, tsx or dotenv.

The tests use temporary storage, mocked Discord interactions, local HTTP/TCP servers and mocked integration responses. They never log into Discord, send real whitelist requests or contact the production Minecraft server. CI additionally builds the production image and tests volume permission repair, legacy migration, non-root execution and readiness. CodeQL scans TypeScript; Dependabot checks npm, Docker and Actions monthly.

See [REVIEW.md](REVIEW.md) for findings and remaining operational limits, [CHANGELOG.md](CHANGELOG.md) for release changes and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance. Licensed under the [MIT License](LICENSE).

## Hall v2 rollout

Deploy Hall v2 first and set its `OPENAI_API_KEY` and `DISCORD_API_KEY` secrets. Set `WORKER_URL` to its origin and `HALLAI_API_KEY` to the same integration secret in this bot’s runtime environment, then deploy this bot. Startup registers `/forget` alongside `/ask`. Never put this secret in the public site. Without it, other bot commands still work and Hall commands explain that setup is incomplete.

The Worker owns moderation, GPT-6 Luna, request deduplication and expiring memory. The bot supplies verified Discord interaction identifiers and never sends its own system prompt or client-controlled history. There is no automatic retry of paid generation. Question text is escaped, mentions are disabled and question plus answer share one embed. Long replies continue in further embeds within Discord limits; private continuations stay private. Source links stay intact across embed boundaries. If a single source link is too long for an embed, the complete answer is attached as `hall-answer.md` with the same reply privacy. Allow **Attach Files** for this fallback. Web-search, fresh-context and safety labels appear when the Worker supplies them, including **Safety checked** for `safety: "checked"`; truncated answers suggest a follow-up. Failures include a validated Worker reference ID when available.

### Fix an incomplete Hall Discord connection

The older message “hallAI is not configured for private conversation memory yet” means `HALLAI_API_KEY` is missing or empty in the running bot. It affects both public and private `/ask` requests, as well as `/forget`, and occurs before the bot contacts the Worker. The web app uses a separate connection and can already be working.

1. Configure the Hall Worker's `DISCORD_API_KEY` secret. This is a shared bot-to-Worker integration secret, separate from `OPENAI_API_KEY` and the bot's `DISCORD_TOKEN`.
2. In Coolify's **production Environment Variables**, set `HALLAI_API_KEY` to exactly the same shared secret and `WORKER_URL` to the Worker's HTTPS origin, such as `https://hall.davevancauwenberghe.be`. Make both available at runtime, disable build-time availability, and mark `HALLAI_API_KEY` as a secret.
3. Save the variables and redeploy the bot so its process receives the updated environment. Test `/ask`, a follow-up question and `/forget`; repeat with `private:true` to check the separate private context.

A partially configured integration now prints a startup warning naming the missing variable without revealing secret values. Missing settings and rejected credentials are shown as a **Status** in the combined question/error embed. Worker HTTP 401/403 responses log a safe access-denied event; check that `WORKER_URL` is correct and the two integration secrets match. Other bot commands remain available. A completely disabled Hall integration (both variables empty) produces no startup warning.
