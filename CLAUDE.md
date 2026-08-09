# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
npm run dev          # watch mode: tsc -w + tsc-alias -w + nodemon
npm run build        # rimraf dist && tsc --build && tsc-alias
npm run lint         # eslint, --max-warnings=0 (CI gate)
npm run lint:fix
npm start            # build, then run the sharding manager
npm run deploy       # build, then register slash commands with Discord
npm run collect:gi   # one collector run (also :hi3, :hsr, :ef)
npm run reset        # daily reset for rotating commands
npm run cookie       # check whether the stored hoyolab cookie is still valid
```

**There is no test suite.** `tsc --noEmit` plus `npm run lint` is the full verification story; there is no `npm test` to run and no test framework installed. Don't invent one unless asked. When changing anything touched by the build, prefer verifying against `npm ci` in a clean directory rather than the local `node_modules`, which drifts.

Local runs read `.env` when present (`node --env-file-if-exists=.env`); in-cluster that file is absent and the environment arrives from a Secret instead. Copy `.env.template` to get started. `docs/` and `tools/` are gitignored scratch space.

## Architecture

### Two processes, not one

`src/index.ts` is the entrypoint and is **not** the bot. It is a `ShardingManager` that forks `dist/bot.js` once per shard. This split drives most of the surprising structure:

- **The parent** (`index.ts`) owns the Postgres pool and an HTTP server on `PORT` (default 5000). It has no Discord client of its own.
- **The children** (`bot.ts`) each own a `Client` and do all Discord work.
- They communicate over discord.js IPC: parent → child via `shard.eval()` / `shard.send()`, child → parent via `process.send()`. There is no network IPC.

Anything that needs to reach Discord from outside a shard must go through the parent, which is why the collector POSTs its results to the HTTP server rather than talking to Discord itself.

`replicas` must stay at **1**. The Discord gateway grants each shard ID an exclusive WebSocket identity, so a second pod does not split load — both pods receive every event and answer every command. Scale by raising the shard count, never replicas. This is also why the Deployment uses `strategy: Recreate`.

Shards spawn with `respawn: false` **on purpose**: it means killing the process actually stops the bot instead of resurrecting shards. The liveness probe compensates by returning 503 once any shard dies, so Kubernetes restarts the pod. Don't "fix" `respawn`.

### Command system

Commands are discovered, not registered by hand:

1. `src/commands/index.ts` re-exports every command file as a namespace.
2. `src/modules/load_commands.ts` walks those namespaces at boot and populates `client.interaction_commands` / `client.message_commands` / `client.cogs`.
3. `src/deployment/deploy_commands.ts` walks the same namespaces to push slash commands to Discord.

A command file exports `name` and `desc` (strings, used as the cog identity in `/help`) plus any number of command objects from `@classes/commands`. **Every exported command object is picked up automatically** — adding a file to `commands/index.ts` is the only wiring step.

`src/classes/commands.ts` defines the hierarchy: `MessageCommand`, `SlashCommandNoSubcommand`, `SlashCommandWithSubcommand`, `SlashSubcommandGroup`, `SlashSubcommand`, `ContextCommand`. Two things to know:

- Handlers (`execute`, `buttonReact`, `menuReact`, `textInput`) are `.bind(this)`-ed in the constructor, so `this` inside a handler is the command object. `register()` re-binds and lets you override a default after construction.
- Subcommand containers synthesise their own `execute` that dispatches to the child, so only the leaf subcommand defines behaviour. The `*Getter` options exist because component interactions (buttons/menus/modals) carry no subcommand path — you must tell the container which child to route to.

Component `customId`s follow `commandName/userId/...`. A `userId` of `0` means anyone may interact; otherwise `bot.ts` drops interactions from other users before dispatch.

### Path aliases

`@classes/*`, `@modules/*`, `@typings/*`, `@files/*`, and `@config` are declared in `tsconfig.json`. TypeScript resolves them but does not rewrite them, which is why **the build is `tsc && tsc-alias`** — running `tsc` alone produces a `dist/` that crashes at require time.

`src/typings/client.d.ts` augments discord.js's `Client` with the bot's own fields (`is_ready`, `log_channel`, `bot_emojis`, `cogs`, …). They are assigned in `bot.ts`; the `Client<true>` generic asserts readiness that isn't actually true yet, so check `is_ready` before touching `client.user`.

### Collector

`src/collector/` is a separate entrypoint run as a CronJob, not part of the bot process. `collect.ts` reads accounts from Postgres, dispatches to `HoyolabCollector` or `SkportCollector`, and POSTs a `SendMessage` JSON body to `config.botUrl`. `index.ts` receives it and fans results out to users via `shard.eval()`. Per-game configuration (endpoints, act IDs) lives in `.env-cmdrc`, selected by `env-cmd --environments <game>`.

### Music

`src/modules/ytdlp.ts` wraps yt-dlp; `src/classes/voice.ts` handles queues and playback. Two invariants worth preserving, both of which cost real quality or CPU if broken:

- **Metadata and streams are resolved separately.** Playlists use `--flat-playlist` (one call, ~200 entries in under two seconds; full extraction is ~1.3s *per entry*). Stream URLs resolve lazily per song at playback time because they are IP-bound and expire.
- **Audio must reach Discord as Opus without re-encoding.** `createOpusStream()` builds an Ogg/Opus stream so `@discordjs/voice` can demux straight through. Handing `createAudioResource()` a plain URL string instead silently forces `StreamType.Arbitrary`, which decodes to PCM and re-encodes at ffmpeg's 96k default — measurably worse than the 129k source, plus a pointless transcode. `resolveStream()` therefore prefers an Opus format and reports `acodec` so playback can use `-c:a copy`.

`ffmpeg-static` and `prism-media` are explicit dependencies even though something else would pull them in; both have silently vanished from the tree before when left implicit.

### Special-event mode

When `EVENTS` is set, command names, descriptions, and options are registered **reversed** and un-reversed on the way back in (`deploy_commands.ts` and the interaction handler in `bot.ts`). If command routing appears broken, check this flag first.

## Deployment

GitHub Actions builds an ARM64 image, pushes it to GHCR, and renders Kustomize manifests; a pull-based GitOps controller in the cluster applies them. **CI never runs `kubectl apply`, and neither should you.**

- `kustomize/base/` — bot, collector (CronJobs), database (Postgres)
- `kustomize/overlays/pr/` — permanent dev environment, `pingbot-dev` namespace
- `kustomize/overlays/prod/` — `pingbot` namespace, deployed on merge to `main`

The PR overlay is permanent and is **not** torn down after merge.

Slash commands are registered by an **initContainer** on the Deployment, not by CI. That orders registration against the pod serving those commands and keeps the token out of CI. Registration failure is deliberately non-fatal — the bot must start even if Discord rejects the registration.

Verify manifest changes by rendering, never by applying:

```bash
kubectl kustomize kustomize/overlays/prod
kubectl kustomize kustomize/overlays/pr
```

### Things that are easy to break

- **`kustomize/overlays/*/{bot,database}/sealed-secret.yaml` contain real committed ciphertext.** Never overwrite them with placeholders to make a render succeed, and never delete them. SealedSecret ciphertext is bound to its namespace *and* name, so it cannot be regenerated from this repo.
- **`NPM_VERSION` in the Dockerfile must match the npm that generated `package-lock.json`.** A mismatch makes `npm ci` fail on lockfile contents that are actually fine.
- This is a **public** repository. Don't reference private infrastructure repositories, internal hostnames, or machine names in code, comments, or docs.

## Style

Enforced by eslint (`--max-warnings=0`, so warnings fail CI): 4-space indent, single quotes, semicolons, trailing commas on multiline, 120-column lines.

Comments in this codebase explain *why*, not *what*, and are kept short. Match that: prefer one dense sentence over a paragraph, and skip the comment entirely if the code already says it.
