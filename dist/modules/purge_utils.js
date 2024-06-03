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
Object.defineProperty(exports, "__esModule", { value: true });
exports.purge_from_dm = exports.purge_from_channel = exports.purge_clean_channel = void 0;
const Utils = __importStar(require("./utils"));
/**
 * Assumes that you have `Manage Channels` permission.
 * WILL THROW IF NOT!
 */
async function purge_clean_channel(channel) {
    const new_channel = await channel.clone({
        position: channel.rawPosition,
    });
    await channel.delete();
    return new_channel;
}
exports.purge_clean_channel = purge_clean_channel;
/**
 * Assumes that you have `Manage Messages` permission.
 * WILL THROW IF NOT!
 */
async function purge_from_channel(channel, amount, filter = () => true) {
    // Keep async to keep Promise<number> signature
    const bulk_delete = (messages) => {
        // Discord bulk delete doesn't like single messages.
        if (messages.length <= 1) {
            return messages.at(0)?.delete().then(() => 1, () => 0) ?? 0;
        }
        return channel.bulkDelete(messages).then(arr => arr.size);
    };
    // Inspired by discord.py's internal structure, delete messages one at a time
    // Useful for DMs/messages older than 14 days.
    const single_delete = async (messages) => {
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
    let to_delete = [];
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
exports.purge_from_channel = purge_from_channel;
async function purge_from_dm(channel, amount, filter = m => m.author.id === channel.client.user.id) {
    let deleted = 0;
    for await (const msg of Utils.fetch_history(channel, amount, filter)) {
        await msg.delete().catch(() => --deleted);
        ++deleted;
    }
    return deleted;
}
exports.purge_from_dm = purge_from_dm;
//# sourceMappingURL=purge_utils.js.map