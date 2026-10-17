# CityMart Services | Discord Bot

[![CodeQL Advanced](https://github.com/davevancauwenberghe/CityMart-Services/actions/workflows/codeql.yml/badge.svg)](https://github.com/davevancauwenberghe/CityMart-Services/actions/workflows/codeql.yml)
![JavaScript](https://img.shields.io/badge/Language-JavaScript-yellow.svg)
![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)

A Discord gateway bot for the CityMart Group server, with slash commands and
mention-based replies, Roblox community information, easyPOS integrations,
giveaways, CityCraft requests and Minecraft Java player lookups.

## Coolify deployment

Connect this GitHub repository to a Coolify application and configure:

| Setting | Value |
| --- | --- |
| Branch | `main` |
| Build pack / Build strategy | Dockerfile |
| Base Directory | `/` |
| Dockerfile Location | `/Dockerfile` |
| Ports Exposes | `8080` |
| Port Mappings | Empty |
| Domains | Empty |

The bot connects outward to Discord. Its HTTP listener is used only for internal
health monitoring; the public landing page, assets, privacy and terms pages have
been removed. `BOT_URL` is no longer read and can be removed from application
variables. `WORKER_URL` is still used for `/ask` and should retain the address of
the existing hallAI worker unless that service is also being moved.

### Environment variables

Add variables under the application's **Environment Variables**, in the
production section. Enable runtime availability and disable build-time
availability. Save tokens in a password manager and keep them out of GitHub.

| Variable | Purpose |
| --- | --- |
| `DISCORD_TOKEN` | Required Discord bot token. |
| `GUILD_ID` | CityMart Discord server ID. |
| `CLIENT_ID` | Discord application ID used by `deploy-commands.js`. |
| `SUPPORT_CHANNEL_ID` | Support-channel links. |
| `GENERAL_CHANNEL_ID` | Startup announcements. |
| `COMMANDS_CHANNEL_ID` | Roblox member-tracker announcements. |
| `ROBLOX_GROUP_ID` | Roblox community lookups and member counts. |
| `GIVEAWAY_MIN_ROLE_ID` | Minimum Discord role for giveaway participation. |
| `WORKER_URL` | Existing hallAI worker endpoint for `/ask`. |
| `EASYPOS_TOKEN` | easyPOS activity integration. |
| `EASYPOS_DONATIONS_TOKEN` | easyPOS donations and donation leaderboard. |
| `EASYPOS_RANKING_TOKEN` | easyPOS promotion and demotion integration. |
| `EASYPOS_RANKING_MOD_ID` | Moderator ID sent to easyPOS ranking. |
| `USER_AGENT` | Optional outbound API user agent. |
| `PORT` | Internal health port; defaults to `8080`. |
| `NODE_ENV` | `production`; already set by the Docker image. |

The bot's existing Discord **Message Content Intent** must remain enabled for
mention-based commands. Slash commands also require the `applications.commands`
installation scope.

### Persistent storage

For a fresh installation, open **Persistent Storage > Add > Volume Mount**:

| Field | Value |
| --- | --- |
| Name | `citymart-data` |
| Destination Path | `/data` |
| Add suffix for PR deployments | Enabled |

Docker manages the volume on the deployment server; there is no host directory
to create manually. The bot stores giveaway records and entrants in
`/data/giveaways.json`. This path is fixed in the bot; a `DATA_DIR` variable is
not required. A new empty volume starts with no saved giveaways. Existing
giveaway messages cannot resume participation or winner selection without
their saved records. Giveaway input dates use the container's local timezone.

Keep exactly one production bot instance. Under **Advanced > Container**, use
**Consistent name (no rolling updates)** or a fixed **Custom Container Name** so
the previous bot stops before its replacement starts. Keep PR previews disabled
unless they use a separate Discord test bot and separate storage.

When replacing Fly.io, copy the required environment values first. Stop the Fly
bot before starting the Coolify copy. If existing giveaway records are needed,
transfer them before starting the new container; otherwise use the fresh volume.

### Health monitoring and deployment checks

The Dockerfile includes a health check against `GET /ready`; Coolify uses that
image health check without a separate dashboard command. The probe starts with
a 60-second grace period, then runs every 30 seconds.

- `/health`: HTTP 200 while the HTTP process is alive.
- `/ready`: HTTP 200 when Discord is ready, or HTTP 503 while disconnected.
- Both endpoints support HEAD and disable response caching.
- Other paths return HTTP 404; no website or static files are served.

After deployment, inspect Runtime Logs for `Logged in as ...`, run `/ping`, and
test the integrations you use. Create a test giveaway and confirm its record
survives a redeploy. Configure daily storage backups to an off-server S3/R2
destination; stop the bot during the archive step for a consistent copy.

### Slash-command registration

Existing Discord command registrations survive a hosting move. After changing
command definitions, run this once from Coolify's application Terminal:

```bash
node deploy-commands.js
```

This requires `DISCORD_TOKEN`, `CLIENT_ID` and `GUILD_ID` at runtime. It updates
the configured server's slash commands; it does not need to run on every restart.

## Minecraft / Mojang lookup

Use `/minecraft player username:<name>` to display a Minecraft Java player's
username, account type, skin model, skin texture and cape. UUID input and output
are intentionally unavailable on the Discord frontend. Lookups are cached for
five minutes, with three requests per minute per Discord user and a global
safety margin below Mojang's documented rate limit.

## Development and checks

Use Node.js **22.12.0 or newer**. The production Docker image uses Node.js 22.

```bash
npm ci
npm test
```

For local startup, put development values in an ignored `.env` file and run
`npm start`. Giveaway operations require a writable `/data` directory. The health
tests start local HTTP listeners and simulate connection state; they do not log
into Discord or call the live integrations.

See [CONTRIBUTING.md](CONTRIBUTING.md) for contribution guidelines.
Licensed under the [MIT License](LICENSE).
