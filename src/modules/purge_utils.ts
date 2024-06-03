import * as Utils from '@modules/utils';
import type DTypes from 'discord.js';

/**
 * Assumes that you have `Manage Channels` permission.
 * WILL THROW IF NOT!
 */
export async function purge_clean_channel(channel: Exclude<DTypes.GuildTextBasedChannel, DTypes.ThreadChannel>) {
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
    channel: DTypes.GuildTextBasedChannel,
    amount: number,
    filter: (message: DTypes.Message) => boolean = () => true
) {
    // Keep async to keep Promise<number> signature
    const bulk_delete = async (messages: DTypes.Message[]) => {
        // Discord bulk delete doesn't like single messages.
        if (messages.length <= 1) {
            return messages.at(0)?.delete().then(() => 1, () => 0) ?? 0;
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
    channel: DTypes.DMChannel | DTypes.PartialDMChannel,
    amount: number,
    filter: (message: DTypes.Message) => boolean = m => m.author.id === channel.client.user.id
) {
    let deleted = 0;
    for await (const msg of Utils.fetch_history(channel, amount, filter)) {
        await msg.delete().catch(() => --deleted);
        ++deleted;
    }
    return deleted;
}
