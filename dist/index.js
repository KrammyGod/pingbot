"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const http_1 = __importDefault(require("http"));
const _config_1 = __importDefault(require("./classes/config.js"));
const DB = __importStar(require("./modules/database"));
const discord_js_1 = require("discord.js");
const manager = new discord_js_1.ShardingManager('./dist/bot.js', {
    token: _config_1.default.token,
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
            const uids = await DB.getUidsList(shard.id, manager.totalShards);
            promises.push(shard.eval((client, uids) => {
                const promises = [];
                for (const uid of uids) {
                    promises.push(client.users.fetch(uid).catch(() => {
                    }));
                }
                return Promise.all(promises).then(() => {
                    console.log(`User cache ready for shard ${client.shard.ids[0]}`);
                });
            }, uids));
        }
        // Set all as user cache ready when all shards are done
        Promise.all(promises).then(() => {
            for (const shard of manager.shards.values()) {
                shard.eval(client => {
                    client.user_cache_ready = true;
                });
            }
        });
    }
}
let readyShards = 0;
let deadShards = 0;
manager.on('shardCreate', shard => {
    shard.once(discord_js_1.ShardEvents.Spawn, () => {
        shard.process.stdout.pipe(process.stdout);
        shard.process.stderr.pipe(process.stderr);
    });
    shard.once(discord_js_1.ShardEvents.Death, () => {
        // Exit parent process once all shards are down
        if (++deadShards === manager.totalShards) {
            DB.end().then(() => process.exit(0));
        }
    });
    shard.once(discord_js_1.ShardEvents.Message, (message) => {
        if (message === 'ready') {
            console.log(`Shard ${shard.id} is ready!`);
            if (++readyShards === manager.totalShards) {
                shard.eval(client => {
                    console.log('Logged in as:');
                    console.log(client.user.tag);
                    console.log(client.user.id);
                    console.log('------');
                });
                // All shards must be ready in order for bot to work properly.
                for (const shard of manager.shards.values()) {
                    shard.send('ready');
                }
                setupCache();
                if (process.send)
                    process.send('ready'); // Send to pm2 process
            }
        }
    });
});
manager.spawn();
// Specifically for auto collector, since we are sharded
// we have to use the manager to send results to users.
async function sendCollectorResults(body) {
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
        const embed = new discord_js_1.EmbedBuilder({
            title: `${body.name} Dailies`,
            description: `Collected on: ${account.error ? 'unknown' : account.today}`,
            color: discord_js_1.Colors.Gold,
        });
        // Grab the award emoji:
        let rewardEmoji = undefined;
        if (!account.error) {
            rewardEmoji = await DB.getEmoji(account.award.name);
        }
        const retEmoji = await manager.shards.random()?.eval(async (client, { name, emoji, acc, embed, guildId }) => {
            let retEmoji = undefined;
            if (emoji) {
                console.log('Got emoji! Skipping creation...');
            }
            else if (!acc.error) {
                console.log(`Emoji ${acc.award.name} not found. Creating new emoji...`);
                // Fetch emoji guild, create new emoji, and return the emoji string
                emoji = await client.guilds.fetch(guildId).then(guild => {
                    const role = guild.members.me.roles.botRole;
                    return guild.emojis.create({
                        attachment: acc.award.icon,
                        name: acc.award.name,
                        roles: [role],
                        reason: `New emoji for ${name} auto collect.`,
                    });
                }).then(emoji => emoji.toString(), () => acc.award.name);
                // If it is in discord's emoji string format
                if (emoji !== acc.award.name) {
                    retEmoji = emoji;
                }
            }
            let val;
            if (acc.error) {
                val = '> There was an error with your account.\n> Please contact the owner.';
            }
            else {
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
                await user.createDM(true).catch(() => {
                });
                await user.send({ embeds: [embed] }).then(() => {
                    console.log(`Sent message to @${user.tag}`);
                }).catch(() => {
                    console.log(`Failed to send message to @${user.tag}`);
                });
            }
            else {
                console.log(`User ${acc.uid} not found!`);
            }
            return retEmoji;
        }, { name: body.name, emoji: rewardEmoji, acc: account, embed: embed.toJSON(), guildId: _config_1.default.emojis });
        // Add it to the database if a new emoji was created.
        if (retEmoji && !account.error)
            await DB.addEmoji(account.award.name, retEmoji);
    }
    console.log(`Completed check-in for ${body.name}!\n`);
}
// Currently we only use this port for auto collector,
// so we don't have to worry about parsing other bodies.
http_1.default.createServer((req, res) => {
    const chunks = [];
    req.on('data', chunk => {
        chunks.push(chunk);
    }).on('end', () => {
        function safeJSONParse(str) {
            try {
                return JSON.parse(str);
            }
            catch (err) {
                return;
            }
        }
        const body = safeJSONParse(Buffer.concat(chunks).toString());
        if (!body) {
            res.writeHead(400, { 'Content-Type': 'text/plain' });
            return res.end('Bad Request\n');
        }
        // Signal received to not let the collector wait
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        res.end('OK');
        return sendCollectorResults(body);
    });
}).listen(_config_1.default.port, () => {
    console.log(`Message server listening on ${_config_1.default.port}\n`);
});
// Gracefully kill all shards and then exit
function cleanup() {
    for (const shard of manager.shards.values()) {
        shard.process?.send('shutdown');
    }
}
// Sent by Ctrl+C
process.on('SIGINT', cleanup);
// Sent by linux when machine shuts down
process.on('SIGTERM', cleanup);
// Sent by pm2
process.on('message', message => {
    if (message === 'shutdown')
        cleanup();
});
//# sourceMappingURL=index.js.map