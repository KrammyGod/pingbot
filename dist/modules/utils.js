"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.get_results = exports.timestamp = exports.date_after_hours = exports.sendEmbedsByWave = exports.channel_is_nsfw_safe = exports.get_rich_cmd = exports.convert_emoji = exports.convert_channel = exports.convert_user = exports.fetch_guild_cache = exports.fetch_user_fast = void 0;
const client_1 = require("../classes/client");
const exceptions_1 = require("../classes/exceptions");
const discord_js_1 = require("discord.js");
function strip(text, char) {
    return text.replaceAll(new RegExp(`^${char}+|${char}+$`, 'g'), '');
}
async function fetch_user_fast(uid, userCb, ctx) {
    const client = new client_1.CustomClient();
    // This is quite a hack, essentially define the callback using eval,
    // and then run the function on the discord user object.
    const retval = await client.shard?.broadcastEval((client, { uid, userCb, ctx }) => {
        return eval(userCb)(client.users.cache.get(uid), ctx);
    }, { context: { uid, userCb: userCb.toString(), ctx } }).then(results => results.find(r => r !== undefined));
    if (!retval && client.user_cache_ready) {
        return userCb(await client.users.fetch(uid).catch(() => undefined));
    }
    return retval;
}
exports.fetch_user_fast = fetch_user_fast;
async function fetch_guild_cache(gid, guildCb, ctx) {
    const client = new client_1.CustomClient();
    const retval = await client.shard?.broadcastEval((client, { gid, guildCb, ctx }) => {
        return eval(guildCb)(client.guilds.cache.get(gid), ctx);
    }, { context: { gid, guildCb: guildCb.toString(), ctx } }).then(results => results.find(r => r !== undefined));
    return retval;
}
exports.fetch_guild_cache = fetch_guild_cache;
async function convert_user(text, guild) {
    const client = new client_1.CustomClient();
    if (!text.startsWith('@'))
        return;
    text = text.slice(1).toLowerCase();
    if (!guild) {
        const user = await client.users.fetch(text).catch(() => undefined);
        if (user)
            return user;
        // Probably not going to be very useful; usually won't be in cache.
        // The trick we employ here is that we can resolve to a user object once
        // we find the original user id that matches the name.
        return client.shard?.broadcastEval((client, text) => client.users.cache.find(u => u.displayName.toLowerCase().includes(text) ||
            u.tag.toLowerCase().includes(text))?.id, { context: text }).then(results => client.users.fetch(results.find(r => r !== undefined) ?? '0').catch(() => undefined));
    }
    // Try to get with id
    const user = await guild.members.fetch(text).catch(() => undefined);
    if (user)
        return user;
    // Try to get with name
    return guild.members.fetch().then(members => members.find(m => m.displayName.toLowerCase().includes(text) ||
        m.user.displayName.toLowerCase().includes(text) ||
        m.user.tag.toLowerCase().includes(text)));
}
exports.convert_user = convert_user;
async function convert_channel(text) {
    const client = new client_1.CustomClient();
    if (!text.startsWith('#'))
        return null;
    text = text.slice(1);
    // Try to get with id
    const channel = await client.channels.fetch(text).catch(() => null);
    if (channel)
        return channel;
    // OK get with name
    text = text.toLowerCase();
    const channel2 = await client.shard?.broadcastEval((client, text) => client.channels.cache.find(c => c.isDMBased() ? false : c.name.toLowerCase().includes(text))?.id, { context: text }).then(res => client.channels.fetch(res.find(r => r !== undefined) ?? '0')) ?? null;
    return channel2;
}
exports.convert_channel = convert_channel;
async function convert_emoji(text, emojiCb, ctx) {
    const client = new client_1.CustomClient();
    if (!text.startsWith(':') || !text.endsWith(':'))
        return;
    text = strip(text, ':').toLowerCase();
    // Explaination of trick above in fetch_user_fast
    return client.shard?.broadcastEval((client, { text, emojiCb, ctx }) => {
        return eval(emojiCb)(client.emojis.cache.find(e => e.name.toLowerCase() === text), ctx);
    }, { context: { text, emojiCb: emojiCb.toString(), ctx } }).then(results => results.find(r => r !== undefined));
}
exports.convert_emoji = convert_emoji;
async function get_rich_cmd(textOrInteraction) {
    if (textOrInteraction instanceof discord_js_1.CommandInteraction) {
        let full_cmd_name = textOrInteraction.commandName;
        const sub_cmd_group_name = textOrInteraction.options.getSubcommandGroup(false);
        const sub_cmd_name = textOrInteraction.options.getSubcommand(false);
        if (sub_cmd_group_name)
            full_cmd_name += ` ${sub_cmd_group_name}`;
        if (sub_cmd_name)
            full_cmd_name += ` ${sub_cmd_name}`;
        return `</${full_cmd_name}:${textOrInteraction.commandId}>`;
    }
    const client = new client_1.CustomClient();
    const [main_cmd, ...sub_cmd] = textOrInteraction.split(' ');
    let cmd = client.application.commands.cache.find(cmd => cmd.name === main_cmd);
    if (!cmd) {
        // Try to fetch full thing if we can't find the command
        const cmds = await client.application.commands.fetch();
        cmd = cmds.find(cmd => cmd.name === main_cmd);
        if (!cmd)
            return `\`/${textOrInteraction}\``;
    }
    const subcmd = sub_cmd.join(' ');
    for (const option of cmd.options) {
        if (option.type === discord_js_1.ApplicationCommandOptionType.SubcommandGroup) {
            for (const suboption of option.options) {
                if (suboption.type === discord_js_1.ApplicationCommandOptionType.Subcommand &&
                    `${option.name} ${suboption.name}` === subcmd) {
                    return `</${cmd.name} ${option.name} ${suboption.name}:${cmd.id}>`;
                }
            }
        }
        else if (option.type === discord_js_1.ApplicationCommandOptionType.Subcommand && option.name === subcmd) {
            return `</${cmd.name} ${option.name}:${cmd.id}>`;
        }
    }
    return `</${cmd.name}:${cmd.id}>`;
}
exports.get_rich_cmd = get_rich_cmd;
function channel_is_nsfw_safe(channel) {
    return !channel.isThread() && (channel.isDMBased() || channel.nsfw);
}
exports.channel_is_nsfw_safe = channel_is_nsfw_safe;
// Useful helpers used in all modules
// Helper that sends all embeds by wave
async function sendEmbedsByWave(interaction, embeds) {
    // 10 embeds per message
    let wave = embeds.splice(0, 10);
    await interaction.editReply({ embeds: wave }).catch(() => { throw new exceptions_1.TimedOutError(); });
    while (embeds.length > 0) {
        wave = embeds.splice(0, 10);
        await interaction.followUp({ embeds: wave, ephemeral: interaction.ephemeral ?? false }).catch(() => { });
    }
}
exports.sendEmbedsByWave = sendEmbedsByWave;
// Helper that gets the date object corresponding to some offset from now
function date_after_hours(hours) {
    return new Date(new Date().getTime() + hours * 60 * 60 * 1000);
}
exports.date_after_hours = date_after_hours;
/**
 * If is a number, pass as miliseconds since epoch.
 * @param fmt @example
 * t: Hours:Minutes AM|PM
 * T: Hours:Minutes:Seconds AM|PM
 * d: Month/Day/Year
 * D: Month Day, Year
 * f: Month Day, Year Hours:Minutes AM|PM (default)
 * F: Weekday, Month Day, Year Hours:Minutes AM|PM
 * R: [in] x years|months|days [ago]
 */
function timestamp(date, fmt = 'f') {
    return `<t:${Math.floor(date instanceof Date ? date.getTime() / 1000 : date / 1000)}:${fmt}>`;
}
exports.timestamp = timestamp;
// Helper that takes a list of choices and wraps it in a pretty format
/**
 * options allowed:
 *
 * Embed details: `title_fmt`, `desc_fmt`
 *
 * Select menu details: `sel_fmt`
 *
 * returns: T if selected, undefined if no choices, and null if cancelled
 */
async function get_results(interaction, choices, { title_fmt = idx => `Found ${idx} items:`, desc_fmt = choice => `${choice}`, sel_fmt = choice => `${choice}` } = {}) {
    if (choices.length <= 1)
        return choices[0];
    // Take first 10 results
    choices = choices.splice(0, 10);
    const res_title = title_fmt(choices.length);
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setPlaceholder('Select one to proceed.')
        .setCustomId('filter');
    // Create embed
    const embed = new discord_js_1.EmbedBuilder({
        title: 'Search Results',
        color: discord_js_1.Colors.Yellow
    }).setAuthor({
        name: `@${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL()
    }).setFooter({ text: 'Select a choice or click cancel.' });
    let desc = '';
    for (const [idx, choice] of choices.entries()) {
        desc += `${idx + 1}. ${desc_fmt(choice)}\n`;
        // Only take the first 100 characters
        menu.addOptions({ label: `${idx + 1}. ${sel_fmt(choice)}`.slice(0, 100), value: `${idx}` });
    }
    embed.setDescription(`__${res_title}__\n${desc}`);
    menu.addOptions({ label: 'Cancel.', value: '-1' });
    const message = await interaction.followUp({
        embeds: [embed],
        components: [new discord_js_1.ActionRowBuilder().addComponents(menu)],
        ephemeral: true
    });
    // Return promise to let caller await it.
    const res = await message.awaitMessageComponent({ componentType: discord_js_1.ComponentType.StringSelect, time: 60000 })
        .then(i => {
        if (i.values[0] === '-1')
            return null;
        return choices[parseInt(i.values[0])];
    }).catch(() => null);
    interaction.client.deleteFollowUp(interaction, message);
    return res;
}
exports.get_results = get_results;
//# sourceMappingURL=utils.js.map