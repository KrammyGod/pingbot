import * as Utils from '@modules/utils';
import {
    DMChannel,
    GuildTextBasedChannel,
    Message,
    PartialDMChannel,
    PartialGroupDMChannel,
    ThreadChannel,
} from 'discord.js';

/**
 * Assumes that you have `Manage Channels` permission.
 * WILL THROW IF NOT!
 */
export async function purge_clean_channel(channel: Exclude<GuildTextBasedChannel, ThreadChannel>) {
    const new_channel = await channel.clone({
        position: channel.rawPosition,
    });
    await channel.delete();
    return new_channel;
}

/**
 * Assumes that you have `Manage Messages` permission.
 * WILL THROW IF NOT!
 */
export async function purge_from_channel(
    channel: GuildTextBasedChannel,
    amount: number,
    filter: (message: Message) => boolean = () => true,
) {
    // Keep async to keep Promise<number> signature
    const bulk_delete = (messages: Message[]) => {
        // Discord bulk delete doesn't like single messages.
        if (messages.length <= 1) {
            return messages.at(0)?.delete().then(() => 1, () => 0) ?? 0;
        }
        return channel.bulkDelete(messages).then(arr => arr.size);
    };
    // Inspired by discord.py's internal structure, delete messages one at a time
    // Useful for DMs/messages older than 14 days.
    const single_delete = async (messages: Message[]) => {
        return Promise.all(messages.map(msg => {
            // Don't count as deleted if we errored.
            return msg.delete().then(() => 1, () => 0);
        })).then(deleted => deleted.reduce((acc, cur) => acc + cur));
    };
    let strategy = bulk_delete;

    // This is the minimum date when messages can be bulk deleted
    // It is exactly 14 days ago.
    const min_date = new Date().getTime() - 14 * 24 * 60 * 60 * 1000;
    let to_delete: Message[] = [];
    let deleted = 0;
    for await (const msg of Utils.fetch_history(channel, amount, filter)) {
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
    channel: DMChannel | PartialDMChannel | PartialGroupDMChannel,
    amount: number,
    filter: (message: Message) => boolean = m => m.author.id === channel.client.user.id,
) {
    let deleted = 0;
    for await (const msg of Utils.fetch_history(channel, amount, filter)) {
        await msg.delete().catch(() => --deleted);
        ++deleted;
    }
    return deleted;
}
