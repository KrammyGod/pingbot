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
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const load_commands_1 = __importDefault(require("./modules/load_commands"));
const _config_1 = __importDefault(require("./classes/config.js"));
const DB = __importStar(require("./modules/database"));
const utils_1 = require("./modules/utils");
const exceptions_1 = require("./classes/exceptions");
const client_1 = require("./classes/client");
const discord_js_1 = require("discord.js");
function WELCOMEMESSAGEMAPPING(member) {
    return {
        '${USER}': member.toString(),
        '${SERVER}': member.guild.name,
        '${MEMBERCOUNT}': member.guild.memberCount.toString()
    };
}
const ACTIVITY = {
    name: 'a date with Krammy',
    type: discord_js_1.ActivityType.Streaming,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ'
};
const TOKEN = _config_1.default.token;
const INTENTS = [
    discord_js_1.IntentsBitField.Flags.Guilds,
    discord_js_1.IntentsBitField.Flags.GuildMembers,
    discord_js_1.IntentsBitField.Flags.GuildEmojisAndStickers,
    discord_js_1.IntentsBitField.Flags.GuildWebhooks,
    discord_js_1.IntentsBitField.Flags.GuildVoiceStates,
    discord_js_1.IntentsBitField.Flags.GuildMessages,
    discord_js_1.IntentsBitField.Flags.DirectMessages,
    discord_js_1.IntentsBitField.Flags.DirectMessageTyping,
    discord_js_1.IntentsBitField.Flags.MessageContent
];
const client = new client_1.CustomClient({
    intents: INTENTS,
    presence: { activities: [ACTIVITY] },
    partials: [discord_js_1.Partials.Channel]
});
// Helper to get a free webhook
async function get_webhook(channel, reason = 'General use') {
    if (channel.isDMBased() || channel.isThread())
        return;
    const wbs = await channel.fetchWebhooks().catch(() => new Map());
    for (const _wb of wbs.values()) {
        if (_wb.token)
            return _wb;
    }
    return channel.createWebhook({
        name: client.user.username,
        reason: reason
    }).catch(() => { });
}
// Helper to check if webhook has emoji permissions
function webhook_permission(message) {
    if (!message.inGuild())
        return false;
    const _default = message.channel.permissionsFor(message.guild.roles.everyone);
    return _default.has(discord_js_1.PermissionsBitField.Flags.UseExternalEmojis);
}
// Replace emojis
async function replaceEmojis(message) {
    // No bots and DMs
    if (!message.content || message.author.bot || !message.inGuild())
        return;
    const emojis = [...new Set(message.content.match(/:[A-Za-z0-9_-]+:(?![0-9]+>)/g))];
    let impersonate = false;
    let msg = message.content;
    for (const i of emojis) {
        const emoji = await (0, utils_1.convert_emoji)(i, (e, id) => {
            return e?.guild.members.fetch(id).then(() => e.toString()).catch(() => undefined);
        }, message.author.id);
        if (emoji) {
            msg = msg.replaceAll(i, emoji);
            impersonate = true;
        }
    }
    if (impersonate && webhook_permission(message)) {
        const wb = await get_webhook(message.channel, 'Custom emojis');
        if (!wb)
            return;
        setTimeout(() => message.delete().catch(() => { }), 200);
        return wb.send({
            username: message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            content: msg
        }).then(() => { }).catch(() => { });
    }
}
async function handle_reply(message) {
    if (message.mentions.users.has(client.user.id)) {
        const lines = client.lines[Math.floor(Math.random() * client.lines.length)].slice();
        const reply = await message.reply({ content: lines.shift() }).catch(() => { });
        if (!reply)
            return; // No permissions to send messages
        for (const line of lines) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await reply.edit({ content: `${reply.content}\n${line}` });
        }
    }
    // No results, try emojis
    return replaceEmojis(message);
}
async function handle_command(message) {
    if (!message.content)
        return;
    const commandName = message.content.toLowerCase().split(/\s/)[0];
    let command = client.message_commands.get(commandName);
    if (!command && message.author.id === message.client.admin.id) {
        command = client.admin_commands.get(commandName);
    }
    // All sorts of message commands
    if (command && (client.is_listening || command.admin)) {
        const args = [];
        message.content = message.content.replace(message.content.split(/\s/)[0], '').trim();
        // Split by spaces, strip quotes
        for (const reply of message.content.split(/(?!\B"[^"]*) (?![^"]*"\B)/)) {
            args.push(reply.replaceAll(/^(?<!\\)"|(?<!\\)"$/g, '').replaceAll('\\', '').trim());
            message.content = message.content.replace(reply, args[args.length - 1]);
        }
        return command.execute(message, args.filter(a => a !== '')).then(() => { }).catch((err) => handle_message_errors(message, commandName, err));
    }
    return handle_reply(message);
}
// For all message commands
client.on(discord_js_1.Events.MessageCreate, message => {
    if (!client.is_ready || message.author.id === client.user.id || !message.content)
        return;
    else if (message.content.startsWith(client.prefix))
        return handle_command(message);
    return handle_reply(message);
});
client.on(discord_js_1.Events.InteractionCreate, interaction => {
    if (!interaction.isRepliable() || !client.is_listening)
        return;
    if (!client.is_ready) {
        return interaction.reply({
            content: 'I am loading... Please try again later.',
            ephemeral: true
        }).then(() => { });
    }
    // Process interaction.
    const commandName = interaction.isCommand() ? interaction.commandName : interaction.customId?.split('/')[0];
    // Unknown interaction
    if (!commandName)
        return;
    let command = undefined;
    if (interaction.isCommand() && _config_1.default.events) {
        // Special event reversed command; typescript doesn't like the hacky solutions
        command = client.commands.get(commandName.split('').reverse().join(''));
        // Reverse subcommand names back to original.
        if (interaction.options) {
            // @ts-expect-error We forcefully reassign to rename the subcommand
            interaction.options._subcommand = interaction.options._subcommand?.split('').reverse().join('');
            // @ts-expect-error We forcefully reassign to rename the subcommand group
            interaction.options._group = interaction.options._group?.split('').reverse().join('');
            // @ts-expect-error We forcefully reassign to rename the subcommand options
            interaction.options._hoistedOptions.map(o => o.name = o.name.split('').reverse().join(''));
        }
    }
    else {
        command = client.commands.get(commandName);
    }
    if (!command)
        return;
    if (interaction.isCommand()) {
        if (interaction.isContextMenuCommand() && (0, client_1.isContextCommand)(command)) {
            // Error handling after command.
            return command.execute(interaction).then(() => { }).catch(err => handle_interaction_errors(interaction, interaction.commandName, err));
        }
        else if (interaction.isChatInputCommand() && (0, client_1.isSlashCommand)(command)) {
            // Error handling after command.
            return command.execute(interaction).then(() => { }).catch(err => handle_interaction_errors(interaction, interaction.commandName, err));
        }
        else {
            throw new Error(`${interaction}\nis not a valid interaction for\n${command}.`);
        }
    }
    else if (!(0, client_1.isSlashCommand)(command)) {
        return; // Not a slash command, ignore rest.
    }
    else if (interaction.isButton()) {
        if (!command.buttonReact)
            return;
        // Reactor isn't the one who initiated the interaction
        const id = interaction.customId.split('/')[1];
        // 0 means global button
        if (id !== '0' && interaction.user.id !== id)
            return;
        return command.buttonReact(interaction).then(() => { }).catch(err => handle_interaction_errors(interaction, commandName, err));
    }
    else if (interaction.isAnySelectMenu()) {
        if (!command.menuReact)
            return;
        // Reactor isn't the one who initiated the interaction
        const id = interaction.customId.split('/')[1];
        // 0 means global selection
        if (id !== '0' && interaction.user.id !== id)
            return;
        return command.menuReact(interaction).then(() => { }).catch(err => handle_interaction_errors(interaction, commandName, err));
    }
    else if (interaction.isModalSubmit()) {
        if (!command.textInput)
            return;
        // With modal, it only applies to user so no need to check for issues.
        return command.textInput(interaction).then(() => { }).catch(err => handle_interaction_errors(interaction, commandName, err));
    }
    else {
        throw new Error('Interaction not implemented.');
    }
});
// When new member joins, send message according to guild settings
client.on(discord_js_1.Events.GuildMemberAdd, async (member) => {
    if (_config_1.default.env !== 'production')
        return;
    const info = await DB.getGuild(member.guild.id).catch(() => { });
    if (!info)
        return;
    const channel = member.guild.channels.cache.get(info.channelid ?? '');
    if (!channel?.isTextBased())
        return;
    const role = member.guild.roles.cache.get(info.roleid ?? '');
    if (channel && info.msg) {
        let msg = info.msg;
        for (const [template, value] of Object.entries(WELCOMEMESSAGEMAPPING(member))) {
            msg = msg.replaceAll(template, value);
        }
        await channel.send({ content: msg }).catch(() => { });
    }
    if (role) {
        await member.roles.add(role).catch(() => { });
    }
});
// Following functions are for voice channel management
async function updateVoice(oldState, newState) {
    const guildVoice = client_1.GuildVoices.get(oldState.guild.id);
    // Not connected, don't care.
    if (!guildVoice)
        return;
    // Ignore self
    else if (oldState.id === client.user.id)
        return;
    // Ensure they are moving out of a voice channel
    else if (oldState.channelId === newState.channelId || !oldState.channelId)
        return;
    // Ensure its the same ID
    else if (guildVoice.voiceChannel.id !== oldState.channelId)
        return;
    // OK They left for sure.
    // Set new host if possible:
    const mems = oldState.channel.members.filter(m => m.user.bot === false);
    const newHost = mems.at(Math.floor(Math.random() * mems.size));
    // No more members in channel, so leave the vc.
    if (!newHost) {
        // Set to myself as temporary host.
        guildVoice.host = oldState.guild.members.me;
        // No song is playing and nobody here, just leave
        if (!guildVoice.getCurrentSong() || guildVoice.paused) {
            guildVoice.destroy();
            return guildVoice.textChannel.send({
                content: `No one wants to listen to me in ${oldState.channel} so I'm leaving... 😭`
            });
        }
    }
    else if (oldState.id === guildVoice.host.id) { //?????
        guildVoice.host = newHost;
        await guildVoice.textChannel.send({ content: `${newHost} is the now the host of ${oldState.channel}` });
    }
}
async function setNewHost(oldState, newState) {
    const guildVoice = client_1.GuildVoices.get(newState.guild.id);
    // Not connected, don't care.
    if (!guildVoice)
        return;
    // Ignore self
    else if (oldState.id === client.user.id)
        return;
    // Ensure they are moving
    else if (oldState.channelId === newState.channelId || !newState.channelId)
        return;
    // Ensure its the same ID
    else if (guildVoice.voiceChannel.id !== newState.channelId)
        return;
    // OK They joined for sure.
    // Set new host if needed:
    if (guildVoice.host.id === client.user.id) {
        const mems = newState.channel?.members.filter(m => m.user.bot === false) ?? new discord_js_1.Collection();
        const newHost = mems.at(Math.floor(Math.random() * mems.size));
        guildVoice.host = newHost ?? guildVoice.voiceChannel.guild.members.me;
    }
}
client.on(discord_js_1.Events.VoiceStateUpdate, async (oldState, newState) => {
    await updateVoice(oldState, newState).catch(err => handle_error(err));
    await setNewHost(oldState, newState).catch(err => handle_error(err));
});
function clearCaches(data) {
    // Clear cache for any command
    return DB.deleteLocalData(data.id);
}
client.on(discord_js_1.Events.Raw, (packet) => {
    if (packet.op !== 0)
        return;
    if (packet.t === 'MESSAGE_DELETE') {
        clearCaches(packet.d);
    }
    else if (packet.t === 'MESSAGE_DELETE_BULK') {
        for (const id of packet.d.ids) {
            clearCaches({ ...packet.d, id });
        }
    }
});
function handle_error(err, opts = {}) {
    const { commandName, interaction, message } = opts;
    // Log the error
    console.error(err.stack);
    // Send the error to the log channel and don't log when testing
    if (!_config_1.default.testing && client.is_ready) {
        const err_str = err.stack?.replaceAll('```', '\\`\\`\\`') ?? 'No stack trace available.';
        let nameCommand = commandName;
        if (nameCommand && interaction) {
            nameCommand += interaction.isButton() ? ' (button)' :
                interaction.isAnySelectMenu() ? ' (select menu)' :
                    interaction.isModalSubmit() ? ' (modal)' :
                        interaction.isContextMenuCommand() ? ' (menu)' : '';
        }
        let error_str = `${client.admin}\n`;
        // Command exists, log that too, otherwise generic error
        if (nameCommand)
            error_str += `**Error in command \`${nameCommand}\`!**\n`;
        else
            error_str += '**Error occured in bot!**\n';
        // From an interaction, lets also include that information
        if (interaction) {
            error_str += `__Invoked by:__ *@${interaction.user.tag} (${interaction.user.id})*\n`;
            if (interaction.channel) {
                if (interaction.channel.isDMBased()) {
                    error_str += `__In:__ ${interaction.channel.recipient?.tag ?? 'DMs'} (${interaction.channel.id})\n`;
                }
                else {
                    error_str += `__In:__ ${interaction.channel.name} (${interaction.channel.id})\n`;
                    error_str += `__Of:__ ${interaction.channel.guild.name} (${interaction.channel.guild.id})\n`;
                }
            }
        }
        else if (message) {
            // Should be mutally exclusive, so if message is provided, interaction should be null
            error_str += `__Invoked by:__ *@${message.author.tag} (${message.author.id})*\n`;
            if (message.channel.isDMBased()) {
                error_str += `__In:__ ${message.channel.recipient?.tag ?? 'DMs'} (${message.channel.id})\n`;
            }
            else {
                error_str += `__In:__ ${message.channel.name} (${message.channel.id})\n`;
                error_str += `__Of:__ ${message.guild.name} (${message.guild.id})\n`;
            }
        }
        // Discord only allows 2000 characters per message, 6 more for backticks, 3 for dots
        // 2000 - 6 - 3 = 1991
        const keepLength = Math.min(error_str.length + err_str.length, 1991) - error_str.length;
        error_str += '```' + err_str.slice(0, keepLength) + (keepLength < err_str.length ? '...' : '') + '```';
        // We catch so there are no recursive errors.
        client.log_channel.send({ content: error_str }).catch(() => { });
    }
}
function handle_interaction_errors(interaction, commandName, err) {
    if (!err) {
        return;
    }
    else if (err instanceof exceptions_1.DatabaseMaintenanceError) {
        interaction.reply({ content: err.message, ephemeral: true }).catch(() => interaction.followUp({ content: err.message, ephemeral: true }).catch(() => { }));
        return;
    }
    else if (err instanceof exceptions_1.IgnoredException) {
        // Ignored exceptions (ie. expected exceptions)
        return;
    }
    // Log the error
    handle_error(err, { commandName, interaction });
    // Hacky, but tacky
    if (err.ignoreSend)
        return;
    // Reply to user with error
    const ctnt = 'Apologies, an unexpected error occurred with that command. ' +
        'Please send a message to the support server or try again later.';
    interaction.reply({ content: ctnt, ephemeral: true })
        // If the interaction has already been replied, still need to tell user got error
        .catch(() => interaction.followUp({
        content: ctnt,
        ephemeral: true
    }).catch(() => { })); // If interaction webhook is invalid.
}
function handle_message_errors(message, commandName, err) {
    return handle_error(err, { commandName, message });
}
client.on(discord_js_1.Events.Error, handle_error);
async function loading() {
    client.admin = await client.users.fetch(_config_1.default.admin);
    // Ensure log channel is setup before we start the database.
    client.log_channel = await client.channels.fetch(_config_1.default.log, {
        allowUnknownGuild: true
    });
    await DB.start().then(bad_load => {
        if (bad_load) {
            client.log_channel.send({
                content: `${client.admin} Error in database. Anime commands won't work!`
            });
        }
    });
    // Load all slash commands into the client.
    await (0, load_commands_1.default)(client);
    // Read in all reply lines
    fs_1.default.readFile(path_1.default.resolve(__dirname, '../files/lines.txt'), (_, data) => {
        const lines = data?.toString().split('\n');
        client.lines = [];
        for (const line of lines) {
            const replies = [];
            // Split by commas, strip quotes
            for (const reply of line.split(/(?!\B"[^"]*),(?![^"]*"\B)/)) {
                replies.push(reply.replaceAll(/^(?<!\\)"|(?<!\\)"$/g, '').replaceAll('\\', '').trim());
            }
            client.lines.push(replies);
        }
    });
    // Setup all available emojis
    client.bot_emojis = {};
    const emojis = await client.guilds.fetch(_config_1.default.emojis)
        .then(guild => guild.emojis.fetch().then(e => Array.from(e.values())))
        .catch(() => []);
    for (const emoji of emojis) {
        client.bot_emojis[emoji.name ?? ''] = emoji.toString();
    }
}
client.once(discord_js_1.Events.ClientReady, () => {
    loading().then(() => {
        // Signal ready after loading resolves.
        client.shard?.send('ready');
    });
});
let cleanedUp = false;
function cleanup() {
    if (cleanedUp)
        return;
    cleanedUp = true;
    const ctnt = '💨 My apologies, it appears my instruments are out of tune. ' +
        "Let me make some quick adjustments and I'll be ready to play " +
        'music for you again in a few moments.';
    const promises = [DB.end().catch(() => { })];
    for (const guildVoice of client_1.GuildVoices.values()) {
        promises.push(guildVoice.textChannel.send({ content: ctnt }).then(() => { }).catch(() => { }));
        guildVoice.destroy();
    }
    Promise.all(promises).then(() => {
        for (const id of client.shard?.ids ?? []) {
            console.log(`Finished cleaning up shard ${id}`);
        }
        client.destroy();
        process.exit(0);
    });
}
// SIGINT is sent by Ctrl+C
process.on('SIGINT', cleanup);
process.on('message', (message) => {
    if (message === 'ready') {
        // Get ready message means all shards are ready.
        client.is_ready = true;
    }
    else if (message === 'shutdown') {
        // shutdown message is by PM2 (see index.ts)
        cleanup();
    }
});
process.on('uncaughtException', handle_error);
process.on('unhandledRejection', handle_error);
client.login(TOKEN);
//# sourceMappingURL=bot.js.map