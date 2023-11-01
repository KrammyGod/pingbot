import { CustomClient } from '@classes/client';
import { TimedOutError } from '@classes/exceptions';
import {
    ActionRowBuilder, ApplicationCommandOptionType, Colors,
    CommandInteraction, ComponentType, EmbedBuilder, Routes,
    StringSelectMenuBuilder
} from 'discord.js';
import type DTypes from 'discord.js';

function strip(text: string, char: string) {
    return text.replaceAll(new RegExp(`^${char}+|${char}+$`, 'g'), '');
}

// Helpers that convert text to Discord.js objects
export async function fetch_user_fast<T>(
    uid: string,
    userCb: (user: DTypes.User | undefined) => DTypes.Awaitable<T | undefined>
): Promise<DTypes.Serialized<T> | undefined>;
export async function fetch_user_fast<T, R>(
    uid: string,
    userCb: (user: DTypes.User | undefined, ctx: DTypes.Serialized<R>) => DTypes.Awaitable<T | undefined>,
    ctx: R
): Promise<DTypes.Serialized<T> | undefined>;
export async function fetch_user_fast<T, R>(
    uid: string,
    userCb: (user: DTypes.User | undefined, ctx?: DTypes.Serialized<R>) => DTypes.Awaitable<T | undefined>,
    ctx?: R
) {
    const client = new CustomClient();
    // This is quite a hack, essentially define the callback using eval,
    // and then run the function on the discord user object.
    const retval = await client.shard?.broadcastEval(
        (client, { uid, userCb, ctx }) => {
            return eval(userCb)(client.users.cache.get(uid), ctx) as DTypes.Awaitable<T | undefined>;
        },
        { context: { uid, userCb: userCb.toString(), ctx } }
    ).then(results => results.find(r => r !== undefined));
    if (!retval && client.user_cache_ready) {
        // Mimic serialization
        return userCb(await client.users.fetch(uid).catch(() => undefined), JSON.parse(JSON.stringify(ctx ?? {})));
    }
    return retval;
}

export async function fetch_guild_cache<T>(
    gid: string,
    guildCb: (guild: DTypes.Guild | undefined) => DTypes.Awaitable<T | undefined>
): Promise<DTypes.Serialized<T> | undefined>;
export async function fetch_guild_cache<T, R>(
    gid: string,
    guildCb: (guild: DTypes.Guild | undefined, ctx: DTypes.Serialized<R>) => DTypes.Awaitable<T | undefined>,
    ctx: R
): Promise<DTypes.Serialized<T> | undefined>;
export async function fetch_guild_cache<T, R>(
    gid: string,
    guildCb: (guild: DTypes.Guild | undefined, ctx?: DTypes.Serialized<R>) => DTypes.Awaitable<T | undefined>,
    ctx?: R
) {
    const client = new CustomClient();
    return client.shard?.broadcastEval(
        (client, { gid, guildCb, ctx }) => {
            return eval(guildCb)(client.guilds.cache.get(gid), ctx) as DTypes.Awaitable<T | undefined>;
        },
        { context: { gid, guildCb: guildCb.toString(), ctx } }
    ).then(results => results.find(r => r !== undefined));
}

export async function convert_user(text: string): Promise<DTypes.User | undefined>;
export async function convert_user(text: string, guild: Readonly<DTypes.Guild>):
    Promise<DTypes.GuildMember | undefined>;
export async function convert_user(text: string, guild?: Readonly<DTypes.Guild>) {
    const client = new CustomClient();
    if (!text.startsWith('@')) return;
    text = text.slice(1).toLowerCase();
    if (!guild) {
        const user = await client.users.fetch(text).catch(() => undefined);
        if (user) return user;
        // Probably not going to be very useful; usually won't be in cache.
        // The trick we employ here is that we can resolve to a user object once
        // we find the original user id that matches the name.
        return client.shard?.broadcastEval(
            (client, text) => client.users.cache.find(u =>
                u.displayName.toLowerCase().includes(text) ||
                u.tag.toLowerCase().includes(text)
            )?.id,
            { context: text }
        ).then(results => client.users.fetch(results.find(r => r !== undefined) ?? '0').catch(() => undefined));
    }

    // Try to get with id
    const user = await guild.members.fetch(text).catch(() => undefined);
    if (user) return user;

    // Try to get with name
    return guild.members.fetch().then(members =>
        members.find(m =>
            m.displayName.toLowerCase().includes(text) ||
            m.user.displayName.toLowerCase().includes(text) ||
            m.user.tag.toLowerCase().includes(text)
        )
    );
}
export async function convert_channel(text: string) {
    const client = new CustomClient();
    if (!text.startsWith('#')) return null;
    text = text.slice(1);
    // Try to get with id
    const channel = await client.channels.fetch(text).catch(() => null);
    if (channel) return channel;

    // OK get with name
    text = text.toLowerCase();
    const channel2 = await client.shard?.broadcastEval(
        (client, text) => client.channels.cache.find(c =>
            c.isDMBased() ? false : c.name.toLowerCase().includes(text)
        )?.id,
        { context: text }
    ).then(res => client.channels.fetch(res.find(r => r !== undefined) ?? '0')) ?? null;
    return channel2;
}
export async function convert_emoji<T>(
    text: string,
    emojiCb: (emoji: DTypes.GuildEmoji | undefined) => DTypes.Awaitable<T | undefined>,
): Promise<DTypes.Serialized<T> | undefined>;
export async function convert_emoji<T, R>(
    text: string,
    emojiCb: (emoji: DTypes.GuildEmoji | undefined, ctx: DTypes.Serialized<R>) => DTypes.Awaitable<T | undefined>,
    ctx: R
): Promise<DTypes.Serialized<T> | undefined>;
export async function convert_emoji<T, R>(
    text: string,
    emojiCb: (emoji: DTypes.GuildEmoji | undefined, ctx?: DTypes.Serialized<R>) => DTypes.Awaitable<T | undefined>,
    ctx?: R
) {
    const client = new CustomClient();
    if (!text.startsWith(':') || !text.endsWith(':')) return;
    text = strip(text, ':').toLowerCase();
    // Explaination of trick above in fetch_user_fast
    return client.shard?.broadcastEval(
        (client, { text, emojiCb, ctx }) => {
            return eval(emojiCb)(client.emojis.cache.find(e =>
                e.name!.toLowerCase() === text
            ), ctx) as DTypes.Awaitable<T | undefined>;
        },
        { context: { text, emojiCb: emojiCb.toString(), ctx } }
    ).then(results => results.find(r => r !== undefined));
}

export async function get_rich_cmd(textOrInteraction: DTypes.ChatInputCommandInteraction | string) {
    if (textOrInteraction instanceof CommandInteraction) {
        let full_cmd_name = textOrInteraction.commandName;
        const sub_cmd_group_name = textOrInteraction.options.getSubcommandGroup(false);
        const sub_cmd_name = textOrInteraction.options.getSubcommand(false);
        if (sub_cmd_group_name) full_cmd_name += ` ${sub_cmd_group_name}`;
        if (sub_cmd_name) full_cmd_name += ` ${sub_cmd_name}`;
        return `</${full_cmd_name}:${textOrInteraction.commandId}>`;
    }
    const client = new CustomClient();
    const [main_cmd, ...sub_cmd] = textOrInteraction.split(' ');
    let cmd = client.application.commands.cache.find(cmd => cmd.name === main_cmd);
    if (!cmd) {
        // Try to fetch full thing if we can't find the command
        const cmds = await client.application.commands.fetch();
        cmd = cmds.find(cmd => cmd.name === main_cmd);
        if (!cmd) return `\`/${textOrInteraction}\``;
    }
    const subcmd = sub_cmd.join(' ');
    for (const option of cmd.options) {
        if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
            for (const suboption of option.options!) {
                if (suboption.type === ApplicationCommandOptionType.Subcommand &&
                    `${option.name} ${suboption.name}` === subcmd) {
                    return `</${cmd.name} ${option.name} ${suboption.name}:${cmd.id}>`;
                }
            }
        } else if (option.type === ApplicationCommandOptionType.Subcommand && option.name === subcmd) {
            return `</${cmd.name} ${option.name}:${cmd.id}>`;
        }
    }
    return `</${cmd.name}:${cmd.id}>`;
}

export function channel_is_nsfw_safe(channel: DTypes.TextBasedChannel) {
    return !channel.isThread() && (channel.isDMBased() || channel.nsfw);
}

// Useful helpers used in all modules
// Helper that sends all embeds by wave
export async function sendEmbedsByWave(
    interaction: DTypes.RepliableInteraction,
    embeds: DTypes.EmbedBuilder[]
) {
    // 10 embeds per message
    let wave = embeds.splice(0, 10);
    await interaction.editReply({ embeds: wave }).catch(() => { throw new TimedOutError(); });
    while (embeds.length > 0) {
        wave = embeds.splice(0, 10);
        await interaction.followUp({ embeds: wave, ephemeral: interaction.ephemeral ?? false }).catch(() => { });
    }
}

// Helper that gets the date object corresponding to some offset from now
export function date_after_hours(hours: number) {
    return new Date(new Date().getTime() + hours * 60 * 60 * 1000);
}

// Helper to convert a date or number into discord's timestamp
/**
 * @see https://discord.com/developers/docs/reference#message-formatting-formats
 * @example
 * t: Hours:Minutes AM|PM
 * T: Hours:Minutes:Seconds AM|PM
 * d: Month/Day/Year
 * D: Month Day, Year
 * f: Month Day, Year Hours:Minutes AM|PM
 * F: Weekday, Month Day, Year Hours:Minutes AM|PM
 * R: x years|months|days ago
 */
type DateFormats = 't' | 'T' | 'd' | 'D' | 'f' | 'F' | 'R';
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
export function timestamp(date: Date | number, fmt: DateFormats = 'f') {
    return `<t:${Math.floor(new Date(date).getTime() / 1000)}:${fmt}>`;
}

/**
 * Only interactions can make ephemeral messages. Unfortunately Discord.JS
 * doesn't currently support deleting ephemeral messages for ephemeral followups and etc.
 * However, Discord has a route to support this, and that's what this function does.
 */
export function deleteEphemeralMessage(i: DTypes.RepliableInteraction, msg: DTypes.Message) {
    return i.client.rest.delete(Routes.webhookMessage(i.webhook.id, i.token, msg.id));
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
export async function get_results<T>(
    interaction: DTypes.RepliableInteraction,
    choices: T[],
    {
        title_fmt = idx => `Found ${idx} items:`,
        desc_fmt = choice => `${choice}`,
        sel_fmt = choice => `${choice}`
    }: {
        title_fmt?: (arg: number) => string,
        desc_fmt?: (arg: T) => string,
        sel_fmt?: (arg: T) => string
    }
) {
    if (choices.length <= 1) return choices[0] as T | undefined;

    // Take first 10 results
    choices = choices.splice(0, 10);
    const res_title = title_fmt(choices.length);
    const menu = new StringSelectMenuBuilder()
        .setPlaceholder('Select one to proceed.')
        .setCustomId('filter');
    // Create embed
    const embed = new EmbedBuilder({
        title: 'Search Results',
        color: Colors.Yellow
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
        components: [new ActionRowBuilder<DTypes.StringSelectMenuBuilder>().addComponents(menu)],
        ephemeral: true
    });

    // Return promise to let caller await it.
    const res = await message.awaitMessageComponent({
        componentType: ComponentType.StringSelect,
        time: 15 * 60 * 1000 // 15 minutes before interaction token expires.
    }).then(i => {
        if (i.values[0] === '-1') return null;
        return choices[parseInt(i.values[0])];
    }).catch(() => null);
    return deleteEphemeralMessage(interaction, message).then(() => res);
}

// Really only used for purge commands, but nicely defined if any other command requires
/**
 * Similar but slightly different implementation of discord.py's fetch history.
 * It certainly is a very good method, but one flaw is that the filter function
 * might cause the function to return a different # of messages, than actually asked for.
 * It is still correct behaviour, but I like the latter better.
 */
export async function* fetch_history(
    channel: DTypes.TextBasedChannel,
    amount: number,
    filter: (message: DTypes.Message) => boolean = () => true
) {
    let prev: string | undefined;
    while (amount > 0) {
        // Always fetch max amount to be efficient
        const messages = await channel.messages.fetch({
            limit: 100,
            before: prev
        });
        if (!messages.size) break;
        // By using prev, we can ensure we are always new, non-deleted messages
        prev = messages.last()!.id;
        // We generate up to `amount` messages
        // The reason we filter from 100 to `amount`, is because messages.filter(filter)
        // might produce lesser results than `amount`. This is the only way to ensure we
        // get all possible matching messages with the least amount of API calls.
        let i = 0;
        for (const msg of messages.filter(filter).values()) {
            yield msg;
            if (++i === amount) break;
        }
        amount -= i;
    }
}

/**
 * Assumes that you have `Manage Channels` permission.
 * WILL THROW IF NOT!
 */
export async function purge_clean_channel(channel: Exclude<DTypes.GuildTextBasedChannel, DTypes.ThreadChannel>) {
    const new_channel = await channel.clone({
        position: channel.rawPosition
    });
    await channel.delete();
    return new_channel;
}

/**
 * Assumes that you have `Manage Messages` permission.
 * WILL THROW IF NOT!
 */
export async function purge_from_channel(
    channel: DTypes.GuildTextBasedChannel,
    amount: number,
    filter: (message: DTypes.Message) => boolean = () => true
) {
    // Keep async to keep Promise<number> signature
    const bulk_delete = async (messages: DTypes.Message[]) => {
        // Discord bulk delete doesn't like single messages.
        if (messages.length <= 1) {
            return messages.at(0)?.delete().then(() => 1).catch(() => 0) ?? 0;
        }
        return channel.bulkDelete(messages).then(arr => arr.size);
    };
    // Inspired by discord.py's internal structure, delete messages one at a time
    // Useful for DMs/messages older than 14 days.
    const single_delete = async (messages: DTypes.Message[]) => {
        let deleted = 0;
        for (const msg of messages) {
            // Ignore deleting errors
            await msg.delete().catch(() => --deleted);
            ++deleted;
        }
        return deleted;
    };
    let strategy = bulk_delete;

    // This is the minimum date when messages can be bulk deleted
    // It is exactly 14 days ago.
    const min_date = new Date().getTime() - 14 * 24 * 60 * 60 * 1000;
    let to_delete: DTypes.Message[] = [];
    let deleted = 0;
    for await (const msg of fetch_history(channel, amount, filter)) {
        // Delete every 100 since Discord's bulk delete is limited to 100 at a time.
        if (to_delete.length === 100) {
            deleted += await strategy(to_delete);
            to_delete = [];
            // Wait 1 second every 100 deletes
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
        // Older than 14 days
        if (msg.createdTimestamp < min_date) {
            // If we hit a message that is older than 14 days
            // We need to first clear out all messages we have so far
            if (to_delete.length) {
                deleted += await strategy(to_delete);
                to_delete = [];
            }
            strategy = single_delete;
        }
        to_delete.push(msg);
    }
    // Leftover remaining undeleted messages
    if (to_delete.length) {
        deleted += await strategy(to_delete);
    }
    return deleted;
}

export async function purge_from_dm(
    channel: DTypes.DMChannel | DTypes.PartialDMChannel,
    amount: number,
    filter: (message: DTypes.Message) => boolean = m => m.author.id === channel.client.user.id
) {
    let deleted = 0;
    for await (const msg of fetch_history(channel, amount, filter)) {
        await msg.delete().catch(() => --deleted);
        ++deleted;
    }
    return deleted;
}
