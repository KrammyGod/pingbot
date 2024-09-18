"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.VOID = void 0;
exports.fetch_user_fast = fetch_user_fast;
exports.fetch_guild_cache = fetch_guild_cache;
exports.convert_user = convert_user;
exports.convert_channel = convert_channel;
exports.convert_emoji = convert_emoji;
exports.get_rich_cmd = get_rich_cmd;
exports.channel_is_nsfw_safe = channel_is_nsfw_safe;
exports.send_embeds_by_wave = send_embeds_by_wave;
exports.date_after_hours = date_after_hours;
exports.timestamp = timestamp;
exports.delete_ephemeral_message = delete_ephemeral_message;
exports.wait_for_button = wait_for_button;
exports.get_results = get_results;
exports.fetch_history = fetch_history;
const exceptions_1 = require("../classes/exceptions");
const discord_js_1 = require("discord.js");
// This is used to make the code a little more readable when we need to return void in promises
const VOID = () => { };
exports.VOID = VOID;
function strip(text, char) {
    return text.replaceAll(new RegExp(`^${char}+|${char}+$`, 'g'), '');
}
async function fetch_user_fast(client, uid, userCb, ctx) {
    // This is quite a hack, essentially define the callback using eval,
    // and then run the function on the discord user object.
    const retval = await client.shard?.broadcastEval((client, { uid, userCb, ctx }) => {
        return eval(userCb)(client.users.cache.get(uid), ctx);
    }, { context: { uid, userCb: userCb.toString(), ctx } }).then(results => results.find(r => r !== undefined));
    if (!retval && client.is_user_cache_ready) {
        // Mimic serialization
        return userCb(await client.users.fetch(uid).catch(() => undefined), JSON.parse(JSON.stringify(ctx ?? {})));
    }
    return retval;
}
function fetch_guild_cache(client, gid, guildCb, ctx) {
    return client.shard?.broadcastEval((client, { gid, guildCb, ctx }) => {
        return eval(guildCb)(client.guilds.cache.get(gid), ctx);
    }, { context: { gid, guildCb: guildCb.toString(), ctx } }).then(results => results.find(r => r !== undefined));
}
async function convert_user(client, text, guild) {
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
    return guild.members.fetch().then(members => members.find(m => m.displayName.toLowerCase()
        .includes(text) || m.user.displayName.toLowerCase()
        .includes(text) || m.user.tag.toLowerCase()
        .includes(text)));
}
async function convert_channel(client, text) {
    if (!text.startsWith('#'))
        return null;
    text = text.slice(1);
    // Try to get with id
    const channel = await client.channels.fetch(text).catch(() => null);
    if (channel)
        return channel;
    // OK get with name
    text = text.toLowerCase();
    return await client.shard?.broadcastEval((client, text) => client.channels.cache.find(c => c.isDMBased() ? false : c.name.toLowerCase().includes(text))?.id, { context: text }).then(res => client.channels.fetch(res.find(r => r !== undefined) ?? '0')) ?? null;
}
function convert_emoji(client, text, emojiCb, ctx) {
    if (!text.startsWith(':') || !text.endsWith(':'))
        return;
    text = strip(text, ':').toLowerCase();
    // Explaination of trick above in fetch_user_fast
    return client.shard?.broadcastEval((client, { text, emojiCb, ctx }) => {
        return eval(emojiCb)(client.emojis.cache.find(e => e.name.toLowerCase() === text), ctx);
    }, { context: { text, emojiCb: emojiCb.toString(), ctx } }).then(results => results.find(r => r !== undefined));
}
async function get_rich_cmd(textOrInteraction, client) {
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
function channel_is_nsfw_safe(channel) {
    return !channel.isThread() && (channel.isDMBased() || channel.nsfw);
}
// Useful helpers used in all modules
// Helper that sends all embeds by wave
async function send_embeds_by_wave(interaction, embeds) {
    // 10 embeds per message
    let wave = embeds.splice(0, 10);
    await interaction.editReply({ embeds: wave }).catch(() => {
        throw new exceptions_1.TimedOutError();
    });
    while (embeds.length > 0) {
        wave = embeds.splice(0, 10);
        await interaction.followUp({ embeds: wave, ephemeral: interaction.ephemeral ?? false }).catch(exports.VOID);
    }
}
// Helper that gets the date object corresponding to some offset from now
function date_after_hours(hours) {
    return new Date(new Date().getTime() + hours * 60 * 60 * 1000);
}
/**
 * If is a number, pass as miliseconds since epoch.
 * @param date
 * @param fmt {@link DateFormats} @example
 * t: Hours:Minutes AM|PM
 * T: Hours:Minutes:Seconds AM|PM
 * d: Month/Day/Year
 * D: Month Day, Year
 * f: Month Day, Year Hours:Minutes AM|PM (default)
 * F: Weekday, Month Day, Year Hours:Minutes AM|PM
 * R: [in] x years|months|days [ago]
 */
function timestamp(date, fmt = 'f') {
    return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${fmt}>`;
}
/**
 * Only interactions can make ephemeral messages. Unfortunately Discord.JS
 * doesn't currently support deleting ephemeral messages for ephemeral followups.
 * However, Discord has a route to support this, and that's what this function does.
 */
function delete_ephemeral_message(i, msg) {
    return i.client.rest.delete(discord_js_1.Routes.webhookMessage(i.webhook.id, i.token, msg.id)).then(exports.VOID);
}
/**
 * Waits for a specific confirm button to be pressed, on a given message.
 * The confirm_id is the customId of the confirm button.
 */
function wait_for_button(message, confirm_id) {
    return message.awaitMessageComponent({
        componentType: discord_js_1.ComponentType.Button,
        time: 10 * 60 * 1000, // 10 minutes before interaction expires
    }).then(i => i.customId === confirm_id, () => false);
}
// Helper that takes a list of choices and wraps it in a pretty format
/**
 * Warning: This will create a followup message and delete it
 * Make sure to have original reply still be available & edit original reply instead
 *
 * options allowed:
 *
 * Embed details: `title_fmt`, `desc_fmt`
 *
 * Select menu details: `sel_fmt`
 *
 * returns: T if selected, undefined if no choices, and null if cancelled
 */
async function get_results(interaction, choices, { title_fmt = idx => `Found ${idx} items:`, desc_fmt = choice => `${choice}`, sel_fmt = choice => `${choice}`, }) {
    if (choices.length <= 1)
        return choices.at(0);
    // Take first 10 results
    choices = choices.splice(0, 10);
    const res_title = title_fmt(choices.length);
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setPlaceholder('Select one to proceed.')
        .setCustomId('filter');
    // Create embed
    const embed = new discord_js_1.EmbedBuilder({
        title: 'Search Results',
        color: discord_js_1.Colors.Yellow,
    }).setAuthor({
        name: `@${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
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
        ephemeral: true,
    });
    const res = await message.awaitMessageComponent({
        componentType: discord_js_1.ComponentType.StringSelect,
        time: 10 * 60 * 1000, // 10 minutes before interaction token expires.
    }).then(i => {
        if (i.values[0] === '-1')
            return null;
        return choices[parseInt(i.values[0])];
    }).catch(() => null);
    return delete_ephemeral_message(interaction, message).then(() => res);
}
// Really only used for purge commands, but nicely defined if any other command requires
/**
 * Similar but slightly different implementation of discord.py's fetch history.
 * It certainly is a very good method, but one flaw is that the filter function
 * might cause the function to return a different # of messages, than actually asked for.
 * It is still correct behaviour, but I like the latter better.
 */
async function* fetch_history(channel, amount, filter = () => true) {
    let prev;
    while (amount > 0) {
        // Always fetch max amount to be efficient
        const messages = await channel.messages.fetch({
            limit: 100,
            before: prev,
        });
        if (!messages.size)
            break;
        // By using prev, we can ensure we are always new, non-deleted messages
        prev = messages.last().id;
        // We generate up to `amount` messages
        // The reason we filter from 100 to `amount`, is because messages.filter(filter)
        // might produce lesser results than `amount`. This is the only way to ensure we
        // get all possible matching messages with the least amount of API calls.
        let i = 0;
        for (const msg of messages.filter(filter).values()) {
            yield msg;
            if (++i === amount)
                break;
        }
        amount -= i;
    }
}
//# sourceMappingURL=utils.js.map