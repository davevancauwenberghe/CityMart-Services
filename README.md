# CityMart Services 1.4.0

A Discord bot for the CityMart community. Built with TypeScript, Node.js 24 LTS and discord.js 14. All Discord messages use consistent embeds. Ordinary messages do not trigger commands or reactions, and the bot does not read message content.

## Commands

| Command                                                              | Purpose                                                                |
| -------------------------------------------------------------------- | ---------------------------------------------------------------------- |
| `/help`                                                              | Browse an interactive command guide.                                   |
| `/about`, `/ping`                                                    | Version, uptime and responsiveness.                                    |
| `/support`                                                           | Find the support team.                                                 |
| `/community`, `/experience`, `/application`                          | CityMart Roblox links.                                                 |
| `/documentation`, `/lorebook`, `/lamp`                               | Guides, stories and a lamp.                                            |
| `/user [member]`                                                     | Discord account, join date, roles and avatar.                          |
| `/memberlookup username`                                             | Roblox profile and CityMart community role.                            |
| `/communitycount`                                                    | Current Roblox community size.                                         |
| `/activity username`                                                 | easyPOS playtime, messages and positions.                              |
| `/donations username`, `/donationsleaderboard`                       | Donation totals and top ten donors.                                    |
| `/minecraft player username`                                         | Minecraft Java profile, skin and cape; no UUID input or output.        |
| `/ask prompt [private] [reset]`                                      | hallAI question and answer in one embed; long answers continue safely. |
| `/forget [private]`                                                  | Delete your public or private Hall context in this channel.            |
| `/citycraft info`, `/citycraft request`                              | Server details and a private whitelist request form.                   |
| `/giveaway list`, `/giveaway entries message_id`                     | Find giveaways and browse participants.                                |
| `/giveaway start prize [duration] [end]`                             | Owner: start a giveaway in the current channel.                        |
| `/giveaway end message_id`                                           | Owner: draw early or retry an interrupted result delivery.             |
| `/giveaway reroll message_id`                                        | Owner: choose a new winner, excluding previous winners.                |
| `/giveaway removeentrant message_id user`                            | Owner: remove an entrant before the draw.                              |
| `/ranking promote username [scale_code]`, `/ranking demote username` | Owner: change a Roblox user's CityMart rank.                           |

Use exactly one giveaway timing option: `duration:2h`, `duration:7d`, or `end:2026-12-20 18:00`. Dates use `TIME_ZONE` (Europe/Brussels by default); ambiguous or skipped daylight-saving times are rejected. Durations run for the requested elapsed time. Giveaways may last between one minute and 90 days. Existing giveaway buttons remain compatible.

Administrative actions are restricted to the configured Discord server's owner. Use Discord **Server Settings → Integrations → CityMart Services** to restrict command availability further; this does not grant non-owners ranking or giveaway management rights. Participation requires the configured minimum role or a higher role; a missing configured role blocks entries rather than allowing everyone. Eligibility is checked when joining. Rerolls use the saved entrants, so the owner should remove ineligible entrants before ending a giveaway.

`/ask` defaults to a public answer. Set `private:true` to keep both the answer and its continuations visible only to you. The authenticated Hall v2 Worker keeps up to 12 exchanges and expires them after 24 hours of inactivity, including across bot restarts. Context is separated by your account, server, channel and public/private reply mode. `reset:true` deletes that context before asking. `/forget` deletes your public Hall context in this channel; `/forget private:true` deletes private context. Both confirmations are private. This does not delete Discord posts or provider security logs. Do not send secrets to the AI. The bot does not keep a second transcript in its own memory.

## Upgrade the existing Coolify application

1. Back up the existing `/data` volume before upgrading. Keep it mounted at `/data`.
2. Deploy the companion Hall v2 Worker first, with its `OPENAI_API_KEY` and `DISCORD_API_KEY` secrets configured.
3. Before deploying this bot, set `WORKER_URL` to the Worker's HTTPS origin (for example, `https://hall.davevancauwenberghe.be`) and `HALLAI_API_KEY` to exactly the same secret as the Worker's `DISCORD_API_KEY`. Add them to Coolify's **production runtime Environment Variables**, with build-time availability disabled, and mark `HALLAI_API_KEY` as a secret. **Both variables are required for `/ask` and `/forget`.** Keep your other runtime variables; `CLIENT_ID` is checked when set, or derived from the logged-in bot when absent.
4. Merge the reviewed PR and deploy `main` using the **Dockerfile** build pack. Keep only one production instance, with **Consistent name (no rolling updates)** enabled. Avoid running the Fly copy or PR previews with the production bot token. Do not override the new Docker start command with `node index.js`.
5. Ensure the Discord installation includes `bot` and `applications.commands`. The bot registers the current guild command list automatically at startup, replacing `/keywords` with `/help`.
6. **Message Content Intent, Server Members Intent and Presence Intent are unnecessary and can be disabled** in the Developer Portal. The bot uses only the Guilds gateway intent and fetches individual members when needed.
7. Read Runtime Logs for `CityMart Services v1.4.0 ready as ... Slash commands registered.` Then check `/help`, `/user`, `/ask`, `/forget`, and your enabled integrations. Create a small test giveaway, enter it, redeploy, and confirm the saved entry and eventual result.

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

| Variable                  | Purpose                                                                                 |
| ------------------------- | --------------------------------------------------------------------------------------- |
| `DISCORD_TOKEN`           | Required bot token.                                                                     |
| `GUILD_ID`                | Required CityMart Discord server ID.                                                    |
| `CLIENT_ID`               | Optional bot application ID; required only for manual registration.                     |
| `SUPPORT_CHANNEL_ID`      | Support links and giveaway winner claim links.                                          |
| `GENERAL_CHANNEL_ID`      | Optional startup announcement channel.                                                  |
| `COMMANDS_CHANNEL_ID`     | Optional Roblox community size update channel.                                          |
| `ROBLOX_GROUP_ID`         | Roblox community ID; defaults to `36060455`.                                            |
| `GIVEAWAY_MIN_ROLE_ID`    | Optional minimum participation role. Unset means all human members may enter.           |
| `HALLAI_API_KEY`          | Secret matching the Hall Worker’s `DISCORD_API_KEY`; required for `/ask` and `/forget`. |
| `WORKER_URL`              | HTTPS Hall v2 origin, e.g. `https://hall.davevancauwenberghe.be`.                       |
| `EASYPOS_TOKEN`           | Activity API token.                                                                     |
| `EASYPOS_DONATIONS_TOKEN` | Donation API token.                                                                     |
| `EASYPOS_RANKING_TOKEN`   | Ranking API token.                                                                      |
| `EASYPOS_RANKING_MOD_ID`  | Roblox moderator ID sent to easyPOS.                                                    |
| `CITYCRAFT_OWNER_USER_ID` | Optional request recipient; defaults to the existing Dave account `651525636351066182`. |
| `CITYCRAFT_ADDRESS`       | Defaults to `citycraft.davevancauwenberghe.be`.                                         |
| `TIME_ZONE`               | Giveaway date input zone; defaults to `Europe/Brussels`.                                |
| `DATA_DIR`                | Writable persistent directory; defaults to `/data`.                                     |
| `PORT`                    | Internal health port; defaults to `8080`.                                               |
| `USER_AGENT`              | Optional outbound API identification string.                                            |

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

Keep regular off-server backups of the volume. If startup reports invalid state, preserve the file and restore a known-good backup. For a pending giveaway result, restore channel permissions or configure access to the saved channel before retrying. For an uncertain ranking result, check Roblox before retrying: ranking mutations are deliberately never retried automatically. Logs include event names, safe error types/status codes and system/Discord error codes; tokens, AI questions, upstream bodies and arbitrary exception messages are omitted.

## Development

Use Node.js 24 (see `.nvmrc`).

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

The tests use temporary storage, mocked Discord interactions, local HTTP servers and mocked integration responses. They never log into Discord or change real Roblox ranks. CI additionally builds the production image and tests volume permission repair, legacy migration, non-root execution and readiness. CodeQL scans TypeScript; Dependabot checks npm, Docker and Actions monthly.

See [REVIEW.md](REVIEW.md) for findings and remaining operational limits, [CHANGELOG.md](CHANGELOG.md) for release changes and [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidance. Licensed under the [MIT License](LICENSE).

## Hall v2 rollout

Deploy Hall v2 first and set its `OPENAI_API_KEY` and `DISCORD_API_KEY` secrets. Set `WORKER_URL` to its origin and `HALLAI_API_KEY` to the same integration secret in this bot’s runtime environment, then deploy this bot. Startup registers `/forget` alongside `/ask`. Never put this secret in the public site. Without it, other bot commands still work and Hall commands explain that setup is incomplete.

The Worker owns moderation, GPT-6 Luna, request deduplication and expiring memory. The bot supplies verified Discord interaction identifiers and never sends its own system prompt or client-controlled history. There is no automatic retry of paid generation. Question text is escaped, mentions are disabled and question plus answer share one embed. Oversized replies continue in further embeds within Discord limits; private continuations stay private.

### Fix an incomplete Hall Discord connection

The older message “hallAI is not configured for private conversation memory yet” means `HALLAI_API_KEY` is missing or empty in the running bot. It affects both public and private `/ask` requests, as well as `/forget`, and occurs before the bot contacts the Worker. The web app uses a separate connection and can already be working.

1. Configure the Hall Worker's `DISCORD_API_KEY` secret. This is a shared bot-to-Worker integration secret, separate from `OPENAI_API_KEY` and the bot's `DISCORD_TOKEN`.
2. In Coolify's **production Environment Variables**, set `HALLAI_API_KEY` to exactly the same shared secret and `WORKER_URL` to the Worker's HTTPS origin, such as `https://hall.davevancauwenberghe.be`. Make both available at runtime, disable build-time availability, and mark `HALLAI_API_KEY` as a secret.
3. Save the variables and redeploy the bot so its process receives the updated environment. Test `/ask`, a follow-up question and `/forget`; repeat with `private:true` to check the separate private context.

A partially configured integration now prints a startup warning naming the missing variable without revealing secret values. Missing settings and rejected credentials are shown as a **Status** in the combined question/error embed. Worker HTTP 401/403 responses log a safe access-denied event; check that `WORKER_URL` is correct and the two integration secrets match. Other bot commands remain available. A completely disabled Hall integration (both variables empty) produces no startup warning.
