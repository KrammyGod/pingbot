import fs from 'fs';
import path from 'path';
import load from '@modules/load_commands';
import config from '@config';
import * as DB from '@modules/database';
import { inspect } from 'util';
import { GuildVoices } from '@classes/voice';
import { convert_emoji, VOID } from '@modules/utils';
import { DatabaseMaintenanceError, IgnoredException } from '@classes/exceptions';
import {
    ActivitiesOptions,
    ActivityType,
    Client,
    Collection,
    Events,
    GuildEmoji,
    GuildMember,
    GuildTextBasedChannel,
    IntentsBitField,
    Message,
    Partials,
    PermissionsBitField,
    RepliableInteraction,
    TextBasedChannel,
    VoiceState,
    Webhook,
} from 'discord.js';

function WELCOME_MESSAGE_MAPPING(member: GuildMember) {
    return {
        '${USER}': member.toString(),
        '${SERVER}': member.guild.name,
        '${MEMBER_COUNT}': member.guild.memberCount.toString(),
    };
}

const ACTIVITY: ActivitiesOptions = {
    name: 'a date with Krammy',
    type: ActivityType.Streaming,
    url: 'https://www.youtube.com/watch?v=dQw4w9WgXcQ',
};
const TOKEN = config.token;
const INTENTS = [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildEmojisAndStickers,
    IntentsBitField.Flags.GuildWebhooks,
    IntentsBitField.Flags.GuildVoiceStates,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.DirectMessages,
    IntentsBitField.Flags.DirectMessageTyping,
    IntentsBitField.Flags.MessageContent,
];
// Warning: we assert that client is true, but actually the client is not immediately ready upon creation.
// Ensure using the is_ready property before using properties such as client.user
const client = new Client<true>({
    intents: INTENTS,
    presence: { activities: [ACTIVITY] },
    partials: [Partials.Channel],
});
client.is_ready = false;
client.is_listening = true;
client.is_user_cache_ready = false;
client.is_using_lambda = true;
client.prefix = config.prefix;
client.bot_emojis = {};
client.lines = [];
client.cogs = [];
client.interaction_commands = new Map();
client.message_commands = new Map();

// Helper to get a free webhook
async function get_webhook(channel: TextBasedChannel, reason = 'General use') {
    if (channel.isDMBased() || channel.isThread()) return;
    const wbs = await channel.fetchWebhooks().catch(() => new Map<string, Webhook>());
    for (const _wb of wbs.values()) {
        if (_wb.token) return _wb;
    }
    return channel.createWebhook({
        name: client.user.username,
        reason: reason,
    }).catch(VOID);
}

// Helper to check if webhook has emoji permissions
function webhook_permission(message: Message) {
    if (!message.inGuild()) return false;
    const _default = message.channel.permissionsFor(message.guild.roles.everyone);
    return _default.has(PermissionsBitField.Flags.UseExternalEmojis);
}

// Replace emojis
async function replace_emojis(message: Message) {
    // No bots and DMs
    if (!message.content || message.author.bot || !message.inGuild() || config.env !== 'prod') return;
    const guild = await DB.getGuild(message.guild.id).catch(() => null);
    // Guild unsubscribed from emoji replacement
    if (guild && !guild.emoji_replacement) return;
    const emojis = [...new Set(message.content.match(/:[A-Za-z0-9_-]+:(?![0-9]+>)/g))];
    let impersonate = false;
    let msg = message.content;
    for (const i of emojis) {
        const emoji = await convert_emoji(message.client, i, (e, id) => {
            // Check if the user is in the guild, only those in the guild are allowed to use it.
            return e?.guild.members.fetch(id).then(() => e.toString(), () => undefined);
        }, message.author.id);
        if (emoji) {
            msg = msg.replaceAll(i, emoji);
            impersonate = true;
        }
    }

    if (impersonate && webhook_permission(message)) {
        const wb = await get_webhook(message.channel, 'Custom emojis');
        if (!wb) return;
        return wb.send({
            username: message.author.username,
            avatarURL: message.author.displayAvatarURL(),
            content: msg,
        }).then(() => {
            setTimeout(() => message.delete().catch(VOID), 200);
        }).catch(VOID);
    }
}

async function handle_reply(message: Message) {
    if (message.mentions.users.has(client.user.id)) {
        const lines = client.lines[Math.floor(Math.random() * client.lines.length)].slice();
        const reply = await message.reply({ content: lines.shift() }).catch(VOID);
        if (!reply) return; // No permissions to send messages
        for (const line of lines) {
            await new Promise(resolve => setTimeout(resolve, 2000));
            await reply.edit({ content: `${reply.content}\n${line}` });
        }
    }
    // No results, try emojis
    return replace_emojis(message);
}

async function handle_command(message: Message) {
    if (!message.content) return;
    const commandName = message.content.toLowerCase().split(/\s/)[0];
    const command = client.message_commands.get(commandName);
    // If command doesn't exist, or if we aren't listening, and it's not an admin command (overrides listening)
    // or if it's an admin command and the user isn't the admin, then ignore message handling.
    if (!command ||
        (!client.is_listening && !command.admin) ||
        (command.admin && message.author.id !== client.admin.id)
    ) {
        return handle_reply(message);
    }
    // Parse arguments and send to command execute
    const args = [];
    // Remove actual command invocation
    message.content = message.content.replace(message.content.split(/\s/)[0], '').trim();
    // Split by whitespace
    for (const reply of message.content.split(/(?!\B"[^"]*)\s(?![^"]*"\B)/)) {
        // Strip quotes not preceded by backslashes
        args.push(reply.replaceAll(/^(?<!\\)"|(?<!\\)"$/g, '').replaceAll('\\', '').trim());
        // I don't actually remember anymore... I think it's cleaning up args in message.content?
        message.content = message.content.replace(reply, args[args.length - 1]);
    }
    return command.execute(message, args.filter(a => a !== '')).catch(err =>
        handle_message_errors(
            message,
            commandName,
            err,
        ),
    );
}

// For all message commands
client.on(Events.MessageCreate, message => {
    if (!client.is_ready || message.author.id === client.user.id || !message.content) return;
    else if (message.content.startsWith(client.prefix)) return handle_command(message);
    return handle_reply(message);
});

client.on(Events.InteractionCreate, interaction => {
    if (!interaction.isRepliable() || !client.is_listening) return;

    if (!client.is_ready) {
        return interaction.reply({
            content: 'I am loading... Please try again later.',
            ephemeral: true,
        }).then(VOID);
    }

    // Process interaction.
    let commandName = interaction.isCommand() ? interaction.commandName : interaction.customId?.split('/').at(0);
    // Unknown interaction
    if (!commandName) return;
    if (interaction.isCommand() && config.events) {
        // Special event reversed command; typescript doesn't like the hacky solutions
        commandName = commandName.split('').reverse().join('');
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
    const command = client.interaction_commands.get(commandName);
    if (!command) return;

    if (interaction.isContextMenuCommand() || interaction.isChatInputCommand()) {
        // We can safely cast to never here, since the interface of SlashCommand and ContextCommand
        // are the same, for the execute function.
        return command.execute(interaction as never).catch(err =>
            handle_interaction_errors(
                interaction,
                interaction.commandName,
                err,
            ),
        );
    } else if (command.isContextCommand()) {
        return handle_interaction_errors(
            interaction,
            commandName,
            new Error('Context command was found for non-context menu interaction.'),
        );
    } else if (interaction.isButton()) {
        // Reactor isn't the one who initiated the interaction
        const id = interaction.customId.split('/')[1];
        // 0 means global button
        if (id !== '0' && interaction.user.id !== id) return;

        return command.buttonReact(interaction).catch(err =>
            handle_interaction_errors(
                interaction,
                commandName,
                err,
            ),
        );
    } else if (interaction.isAnySelectMenu()) {
        // Reactor isn't the one who initiated the interaction
        const id = interaction.customId.split('/')[1];
        // 0 means global selection
        if (id !== '0' && interaction.user.id !== id) return;

        return command.menuReact(interaction).catch(err =>
            handle_interaction_errors(
                interaction,
                commandName,
                err,
            ),
        );
    } else if (interaction.isModalSubmit()) {
        // With modal, it only applies to user so no need to check for issues.
        return command.textInput(interaction).catch(err =>
            handle_interaction_errors(
                interaction,
                commandName,
                err,
            ),
        );
    } else {
        return handle_interaction_errors(
            interaction,
            commandName,
            new Error('Invalid interaction type for command.'),
        );
    }
});

// When new member joins, send message according to guild settings
client.on(Events.GuildMemberAdd, async member => {
    if (config.env !== 'prod') return;
    const guild = await DB.getGuild(member.guild.id).catch(() => null);
    if (!guild || DB.isGuildEmpty(guild)) return;
    if (guild.welcome_roleid) {
        const role = await member.guild.roles.fetch(guild.welcome_roleid);
        if (role) {
            await member.roles.add(role).catch(VOID);
        }
    }
    if (!guild.welcome_channelid) return;
    const channel = await member.guild.channels.fetch(guild.welcome_channelid);
    if (!channel?.isTextBased()) return;
    if (guild.welcome_msg) {
        let msg = guild.welcome_msg;
        for (const [template, value] of Object.entries(WELCOME_MESSAGE_MAPPING(member))) {
            msg = msg.replaceAll(template, value);
        }
        await channel.send({ content: msg }).catch(VOID);
    }
});

// Following functions are for voice channel management
async function update_voice(oldState: VoiceState, newState: VoiceState) {
    const guildVoice = GuildVoices.get(oldState.guild.id);
    // Not connected, don't care.
    if (!guildVoice) return;
    // Ignore self
    else if (oldState.id === client.user.id) return;
    // Ensure they are moving out of a voice channel
    else if (oldState.channelId === newState.channelId || !oldState.channelId) return;
    // Ensure it's the same ID
    else if (guildVoice.voiceChannel.id !== oldState.channelId) return;
    // OK They left for sure.
    // Set new host if possible:
    const members = oldState.channel!.members.filter(m => !m.user.bot);
    const newHost = members.at(Math.floor(Math.random() * members.size));
    // No more members in channel, so leave the vc.
    if (!newHost) {
        // Set to myself as temporary host.
        guildVoice.host = oldState.guild.members.me!;
        // No song is playing and nobody here, just leave
        if (!guildVoice.getCurrentSong() || guildVoice.paused) {
            guildVoice.destroy();
            return guildVoice.textChannel.send({
                content: `No one wants to listen to me in ${oldState.channel} so I'm leaving... 😭`,
            });
        }
    } else if (oldState.id === guildVoice.host.id) { //?????
        guildVoice.host = newHost;
        await guildVoice.textChannel.send({ content: `${newHost} is the now the host of ${oldState.channel}` });
    }
}

async function set_new_host(oldState: VoiceState, newState: VoiceState) {
    const guildVoice = GuildVoices.get(newState.guild.id);
    // Not connected, don't care.
    if (!guildVoice) return;
    // Ignore self
    else if (oldState.id === client.user.id) return;
    // Ensure they are moving
    else if (oldState.channelId === newState.channelId || !newState.channelId) return;
    // Ensure it's the same ID
    else if (guildVoice.voiceChannel.id !== newState.channelId) return;
    // OK They joined for sure.
    // Set new host if needed:
    if (guildVoice.host.id === client.user.id) {
        const members = newState.channel?.members.filter(m => !m.user.bot) ?? new Collection();
        const newHost = members.at(Math.floor(Math.random() * members.size));
        guildVoice.host = newHost ?? guildVoice.voiceChannel.guild.members.me!;
    }
}

client.on(Events.VoiceStateUpdate, async (oldState, newState) => {
    await update_voice(oldState, newState).catch(err => handle_error(err));
    await set_new_host(oldState, newState).catch(err => handle_error(err));
});

// Clearing local cache
type RawMessageDeleteSingle = {
    t: 'MESSAGE_DELETE';
    s: number;
    op: 0;
    d: {
        id: string;
        channel_id: string;
        guild_id?: string;
    }
};
type RawMessageDeleteBulk = {
    t: 'MESSAGE_DELETE_BULK';
    s: number;
    op: 0;
    d: {
        ids: string[];
        channel_id: string;
        guild_id?: string;
    }
};
type RawMessageDeletePacket = RawMessageDeleteSingle | RawMessageDeleteBulk;
client.on(Events.Raw, (packet: RawMessageDeletePacket) => {
    if (packet.op !== 0) return;
    if (packet.t === 'MESSAGE_DELETE') {
        DB.deleteLocalData(packet.d.id);
    } else if (packet.t === 'MESSAGE_DELETE_BULK') {
        for (const id of packet.d.ids) {
            DB.deleteLocalData(id);
        }
    }
});

// Handling any error
type ErrorOpts = {
    commandName?: string;
    interaction?: RepliableInteraction;
    message?: Message;
};

function handle_error(err: Error, opts: ErrorOpts = {}) {
    const { commandName, interaction, message } = opts;
    // Log the error
    console.error(err);
    // Send the error to the log channel and don't log when testing
    if (!config.testing && client.is_ready) {
        const err_str = inspect(err).replaceAll('```', '\\`\\`\\`');
        let nameCommand = commandName ? `\`${commandName}\`` : commandName;
        if (nameCommand && interaction) {
            // Using this to include subcommands and subcommand groups for slash commands
            // This is especially helpful for commands like music where they are all grouped up.
            if (interaction.isCommand() && !interaction.isContextMenuCommand()) {
                nameCommand = interaction.commandName;
                const sub_cmd_group_name = interaction.options.getSubcommandGroup(false);
                const sub_cmd_name = interaction.options.getSubcommand(false);
                if (sub_cmd_group_name) nameCommand += ` ${sub_cmd_group_name}`;
                if (sub_cmd_name) nameCommand += ` ${sub_cmd_name}`;
                nameCommand = `</${nameCommand}:${interaction.commandId}>`;
            } else if (!interaction.isContextMenuCommand()) {
                nameCommand += interaction.isButton() ? ' (button)' :
                    interaction.isAnySelectMenu() ? ' (select menu)' :
                        interaction.isModalSubmit() ? ' (modal)' : '';
                nameCommand += ` __Custom id: \`${interaction.customId}\`__`;
            } else {
                nameCommand += ' (menu)';
            }
        }
        let error_str = `${client.admin}\n`;
        // Command exists, log that too, otherwise generic error
        if (nameCommand) error_str += `**Error in ${nameCommand}!**\n`;
        else error_str += '**Error occurred in bot!**\n';
        // From an interaction, lets also include that information
        if (interaction) {
            error_str += `__Invoked by:__ *@${interaction.user.tag} (${interaction.user.id})*\n`;
            if (interaction.channel) {
                if (interaction.channel.isDMBased()) {
                    error_str += `__In:__ DMs (${interaction.channel.id})\n`;
                } else {
                    error_str += `__In:__ ${interaction.channel.name} (${interaction.channel.id})\n`;
                    error_str += `__Of:__ ${interaction.channel.guild.name} (${interaction.channel.guild.id})\n`;
                }
            }
        } else if (message) {
            // Should be mutually exclusive, so if message is provided, interaction should be null
            error_str += `__Invoked by:__ *@${message.author.tag} (${message.author.id})*\n`;
            if (message.channel.isDMBased()) {
                error_str += `__In:__ DMs (${message.channel.id})\n`;
            } else {
                error_str += `__In:__ ${message.channel.name} (${message.channel.id})\n`;
                error_str += `__Of:__ ${message.guild!.name} (${message.guild!.id})\n`;
            }
        }
        // Discord only allows 2000 characters per message, 6 more for backticks, 3 for dots
        // 2000 - 6 - 3 = 1991
        const keepLength = Math.min(error_str.length + err_str.length, 1991) - error_str.length;
        error_str += '```\n' +
            err_str.slice(0, keepLength) +
            (
                keepLength < err_str.length ? '...' : ''
            ) +
            '```';
        // We catch so there are no recursive errors.
        client.log_channel.send({ content: error_str }).catch(VOID);
    }
}

function handle_interaction_errors(interaction: RepliableInteraction, commandName: string, err: Error) {
    if (!err) {
        return;
    } else if (err instanceof DatabaseMaintenanceError) {
        interaction.reply({ content: err.message, ephemeral: true }).catch(() =>
            interaction.followUp({
                content: err.message,
                ephemeral: true,
            }).catch(VOID),
        );
        return;
    } else if (err instanceof IgnoredException) {
        // Ignored exceptions (ie. expected exceptions)
        return;
    }

    // Log the error
    handle_error(err, { commandName, interaction });

    // Hacky, but tacky
    if ((
        err as Error & { ignoreSend?: boolean }
    ).ignoreSend) return;
    // Reply to user with error
    const content = 'Apologies, an unexpected error occurred with that command. ' +
        'Please send a message to the support server or try again later.';
    interaction.reply({ content: content, ephemeral: true })
        // If the interaction has already been replied, still need to tell user got error
        .catch(() => interaction.followUp({
            content: content,
            ephemeral: true,
        }).catch(VOID)); // If interaction webhook is invalid.
}

function handle_message_errors(message: Message, commandName: string, err: Error) {
    return handle_error(err, { commandName, message });
}

client.on(Events.Error, handle_error);

async function loading() {
    client.admin = await client.users.fetch(config.admin);
    // Ensure log channel is set up before we start the database.
    client.log_channel = await client.channels.fetch(config.log, {
        allowUnknownGuild: true,
    }) as GuildTextBasedChannel;
    await DB.start().then(bad_load => {
        if (bad_load) {
            client.log_channel.send({
                content: `${client.admin} Error in database. Anime commands won't work!`,
            });
        }
    });

    // Load all slash commands into the client.
    load(client);

    // Read in all reply lines
    fs.readFile(path.resolve(__dirname, '../files/lines.txt'), (_, data) => {
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
    const emojis = await client.guilds.fetch(config.emojis)
        .then(guild => guild.emojis.fetch().then(e => Array.from(e.values())))
        .catch(() => [] as GuildEmoji[]);
    for (const emoji of emojis) {
        client.bot_emojis[emoji.name ?? ''] = emoji.toString();
    }
}

client.once(Events.ClientReady, () => {
    loading().then(() => {
        // Signal ready after loading resolves.
        client.shard?.send('ready');
    });
});

let cleanedUp = false;

function cleanup() {
    if (cleanedUp) return;
    cleanedUp = true;
    const content =
        '💨 My apologies, it appears my instruments are out of tune. ' +
        "Let me make some quick adjustments and I'll be ready to play " +
        'music for you again in a few moments.';
    const promises = [DB.end(), client.destroy()];
    for (const guildVoice of GuildVoices.values()) {
        promises.push(guildVoice.textChannel.send({ content }).then(VOID, VOID));
        guildVoice.destroy();
    }
    Promise.all(promises).then(() => {
        for (const id of client.shard?.ids ?? []) {
            console.log(`Finished cleaning up shard ${id}`);
        }
        process.exit(0);
    });
}

// SIGINT is sent by Ctrl+C
process.on('SIGINT', cleanup);
process.on('message', (message: string) => {
    if (message === 'ready') {
        // Get ready message means all shards are ready.
        client.is_ready = true;
    } else if (message === 'shutdown') {
        // shutdown message is by PM2 (see index.ts)
        cleanup();
    }
});
process.on('uncaughtException', handle_error);
process.on('unhandledRejection', handle_error);

client.login(TOKEN);
