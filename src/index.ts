import http from 'http';
import config from '@config';
import * as DB from '@modules/database';
import { Colors, EmbedBuilder, ShardEvents, ShardingManager } from 'discord.js';
import type { SendMessage } from './collector/collect';

const manager = new ShardingManager('./dist/bot.js', {
    token: config.token,
    respawn: false,
    silent: true,
    execArgv: ['--enable-source-maps'],
});

// Load user cache for each shard once every shard is ready
async function setupCache() {
    const bad_load = await DB.start();
    if (!bad_load) {
        const promises = [];
        for (const shard of manager.shards.values()) {
            const uids = await DB.getUidsList(shard.id, manager.totalShards as number);
            promises.push(shard.eval((client, uids) => {
                const promises = [];
                for (const uid of uids) {
                    promises.push(client.users.fetch(uid).catch(() => { }));
                }
                return Promise.all(promises).then(() => {
                    console.log(`User cache ready for shard ${client.shard!.ids[0]}`);
                });
            }, uids));
        }
        // Set all as user cache ready when all shards are done
        Promise.all(promises).then(() => {
            for (const shard of manager.shards.values()) {
                shard.eval(client => {
                    client.is_user_cache_ready = true;
                });
            }
        });
    }
}

let readyShards = 0;
let deadShards = 0;
let shuttingDown = false;
manager.on('shardCreate', shard => {
    shard.once(ShardEvents.Spawn, () => {
        shard.process!.stdout!.pipe(process.stdout);
        shard.process!.stderr!.pipe(process.stderr);
    });
    shard.once(ShardEvents.Death, () => {
        // Exit parent process once all shards are down
        if (++deadShards === manager.totalShards) {
            DB.end().then(() => process.exit(0));
        }
    });
    shard.once(ShardEvents.Message, (message: string) => {
        if (message === 'ready') {
            console.log(`Shard ${shard.id} is ready!`);
            if (++readyShards === manager.totalShards) {
                shard.eval(client => {
                    console.log('Logged in as:');
                    console.log(client.user!.tag);
                    console.log(client.user!.id);
                    console.log('------');
                });
                // All shards must be ready in order for bot to work properly.
                for (const shard of manager.shards.values()) {
                    shard.send('ready');
                }
                setupCache();
            }
        }
    });
});

manager.spawn();

// Specifically for auto collector, since we are sharded
// we have to use the manager to send results to users.
async function sendCollectorResults(body: SendMessage) {
    // Just hoping that client has been loaded properly
    if (body.err) {
        await manager.shards.get(0)?.eval(async (client, { err, name }) => {
            await client.log_channel.send({
                content: `${client.admin} ${name} failed! Help!`,
            });
            while (err.length) {
                client.log_channel.send({ content: err.shift() });
            }
        }, { err: body.err, name: body.name });
    }
    console.log(`Received message for ${body.name}, sending to ${body.accounts.length} users...`);
    for (const account of body.accounts) {
        // Setup embed to send
        const embed = new EmbedBuilder({
            title: `${body.name} Dailies`,
            description: `Collected on: ${account.error ? 'unknown' : account.today}`,
            color: Colors.Gold,
        });

        // Grab the award emoji:
        let rewardEmoji = undefined;
        if (!account.error) {
            rewardEmoji = await DB.getEmoji(account.award.name);
        }

        const retEmoji = await manager.shards.random()?.eval(async (client, { emoji, acc, embed }) => {
            let retEmoji = undefined;
            if (emoji) {
                console.log('Got emoji! Skipping creation...');
            } else if (!acc.error) {
                console.log(`Emoji ${acc.award.name} not found. Creating new emoji...`);
                // Create application emojis so only this bot can use them.
                emoji = await client.application!.emojis.create({
                    attachment: acc.award.icon,
                    name: acc.award.name
                        // Don't edit the original string
                        .slice()
                        // Replace all non-alphanumeric characters with underscore
                        .replace(/[^a-zA-Z0-9_]/g, '_')
                        // Limit length to 32 characters
                        .slice(0, 32)
                        // Convert to lowercase
                        .toLowerCase()
                        // Pad with underscore if 1 character (min 2 characters)
                        .padEnd(2, '_'),
                }).then(emoji => emoji.toString(), () => acc.award.name);
                // If it is in discord's emoji string format
                if (emoji !== acc.award.name) {
                    retEmoji = emoji;
                }
            }

            let val;
            if (acc.error) {
                val = '> There was an error with your account.\n> Please contact the owner.';
            } else {
                /**
                 * MESSAGE TEMPLATE:
                 * > [{region_name}] {nickname}
                 * > Today's rewards: {award_emoji} × {award_cnt}
                 * > Monthly Check-In count: {total_sign_day} days
                 * > Check-in result: ✅/Already checked in today ❎/Please check in manually once ❎
                 */
                val = `> [${acc.region_name}] ${acc.nickname}\n` +
                    `> Today's rewards: ${emoji} × ${acc.award.cnt}\n` +
                    `> Monthly Check-In count: ${acc.total_sign_day} days\n` +
                    `> Check-in result: ${acc.check_in_result}`;
            }
            embed.fields = [{ name: 'Your Account:', value: val }];

            const user = await client.users.fetch(acc.uid).catch(() => acc.uid);
            embed.author = {
                name: typeof user === 'string' ? user : user.tag,
                icon_url: typeof user === 'string' ? '' : user.displayAvatarURL(),
            };
            if (typeof user !== 'string') {
                await user.createDM(true).catch(() => { });
                await user.send({ embeds: [embed] }).then(() => {
                    console.log(`Sent message to @${user.tag}`);
                }).catch(() => {
                    console.log(`Failed to send message to @${user.tag}`);
                });
            } else {
                console.log(`User ${acc.uid} not found!`);
            }

            return retEmoji;
        }, { emoji: rewardEmoji, acc: account, embed: embed.toJSON() });

        // Add it to the database if a new emoji was created.
        if (retEmoji && !account.error) await DB.addEmoji(account.award.name, retEmoji);
    }
    console.log(`Completed check-in for ${body.name}!\n`);
}

/** A collector body is a few KiB; this only exists to stop unbounded buffering. */
const MAX_BODY_BYTES = 1024 * 1024;

// Currently we only use this port for auto collector & kubernetes,
// so we don't have to worry about parsing other bodies.
http.createServer((req, res) => {
    // Probes must be answered before the body is buffered below, since they send
    // no body at all and would otherwise fall into the 400 Bad Request path.
    if (req.method === 'GET' && req.url === '/healthz') {
        // Liveness: either shutting down or all shards are alive.
        const healthy = shuttingDown || deadShards === 0;
        res.writeHead(healthy ? 200 : 503, { 'Content-Type': 'text/plain' });
        return res.end(healthy ? 'OK\n' : 'Unhealthy\n');
    } else if (req.method === 'GET' && req.url === '/readyz') {
        // Readiness: every shard must have reported ready, and we must not be shutting down.
        const ready = !shuttingDown &&
            typeof manager.totalShards === 'number' &&
            readyShards === manager.totalShards;
        res.writeHead(ready ? 200 : 503, { 'Content-Type': 'text/plain' });
        return res.end(ready ? 'OK\n' : 'Not Ready\n');
    }

    // The collector is the only writer, and it always POSTs to the root.
    if (req.method !== 'POST') {
        res.writeHead(405, { 'Content-Type': 'text/plain', 'Allow': 'POST' });
        return res.end('Method Not Allowed\n');
    }

    const chunks: Uint8Array[] = [];
    let received = 0;
    let aborted = false;
    req.on('data', chunk => {
        // Without a ceiling anything that reaches this port can buffer until the
        // pod is OOM killed. A collector body is a few KiB.
        if (aborted) return;
        received += chunk.length;
        if (received > MAX_BODY_BYTES) {
            aborted = true;
            res.writeHead(413, { 'Content-Type': 'text/plain' });
            res.end('Payload Too Large\n');
            req.destroy();
            return;
        }
        chunks.push(chunk);
    }).on('end', () => {
        // The response is already closed; writing again would throw.
        if (aborted) return;
        function safeJSONParse<T>(str: string): T | void {
            try {
                return JSON.parse(str);
            } catch (err) {
                return;
            }
        }

        const body = safeJSONParse<SendMessage>(Buffer.concat(chunks).toString());
        if (!body) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Bad Request\n');
        }

        // Signal received to not let the collector wait
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');

        // Nothing awaits this, so its rejections have to be swallowed here or they
        // reach the unhandledRejection handler installed below.
        return sendCollectorResults(body).catch(err => console.error(err));
    });
}).listen(config.port, () => {
    console.log(`Message server listening on ${config.port}\n`);
});

// Gracefully kill all shards and then exit
function cleanup() {
    shuttingDown = true;
    for (const shard of manager.shards.values()) {
        shard.process?.send('shutdown');
    }
}

// Sent by Ctrl+C
process.on('SIGINT', cleanup);
// Sent by linux when machine shuts down
process.on('SIGTERM', cleanup);

// This process owns every shard, so letting an async fault reach Node's default
// handler takes the whole bot down. bot.ts has had these for the same reason.
process.on('uncaughtException', err => console.error(err));
process.on('unhandledRejection', err => console.error(err));
