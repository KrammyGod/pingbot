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
exports.stop = exports.start = exports.upload = exports.add = exports.resetdb = exports.purge = exports.desc = exports.name = void 0;
const fs_1 = __importDefault(require("fs"));
const reset_db_1 = __importDefault(require("../modules/reset_db"));
const _config_1 = __importDefault(require("../classes/config.js"));
const DB = __importStar(require("../modules/database"));
const Utils = __importStar(require("../modules/utils"));
const scraper_1 = require("../modules/scraper");
const exceptions_1 = require("../classes/exceptions");
const discord_js_1 = require("discord.js");
exports.name = 'Admin Message Commands';
exports.desc = "You shouldn't be seeing this";
exports.purge = {
    name: 'purge',
    admin: true,
    desc: 'Purges messages, but easier.',
    buttons: new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('purge/confirm')
        .setLabel('Yes!')
        .setEmoji('🚮')
        .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder()
        .setCustomId('purge/cancel')
        .setLabel('No')
        .setStyle(discord_js_1.ButtonStyle.Secondary)),
    // Using discord.py's internal structure, delete messages one at a time
    // Useful for DMs/messages older than 14 days.
    async delete_single(msgs) {
        let deleted = 0;
        for (const msg of msgs) {
            // Ignore deleting errors
            await msg.delete().catch(() => { --deleted; });
            ++deleted;
        }
        return deleted;
    },
    async fetch_history(channel, amount, filter = () => true) {
        let i = 0;
        const history = [];
        let prev = undefined;
        // Set upper limit to prevent true infinite loop.
        while (i <= 100000000) {
            const to_fetch = (amount - i * 100) > 100 ? 100 : amount - i * 100;
            if (to_fetch <= 0)
                break;
            let messages = await channel.messages.fetch({
                limit: to_fetch,
                before: prev
            });
            messages = messages.filter(filter);
            if (!messages.size)
                break;
            history.push(...messages);
            prev = history[history.length - 1][0];
            ++i;
        }
        history.map(m => m[1]);
        return history;
    },
    async delete_dms(message, amount, all) {
        // DMs are always partials....
        message = await message.fetch();
        if (all) {
            return message.reply({ content: "Can't delete all messages in DMs." }).then(() => { });
        }
        else if (amount <= 0) {
            return message.reply({ content: 'Enter a positive number.' }).then(() => { });
        }
        let deleted = 0;
        while (amount > 0) {
            const messages = await this.fetch_history(message.channel, amount + 1, (m) => m.author.id === message.client.user.id);
            if (messages.length === 0)
                break;
            const msgs = [...messages].map(m => m[1]);
            const burst = await this.delete_single(msgs);
            amount -= burst;
            deleted += burst;
        }
        return message.channel.send({ content: `Successfully deleted ${deleted} message(s).` })
            .then(m => { setTimeout(() => m.delete(), 3000); });
    },
    async delete_channel(message) {
        if (!message.channel.permissionsFor(message.member)
            .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({
                content: 'You do not have permission to purge all.\n' +
                    'You need the Manage Channels permission.'
            }).then(() => { });
        }
        else if (!message.channel.permissionsFor(message.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({
                content: "I don't have permission to purge all.\n" +
                    'I need the Manage Channels permission.'
            }).then(() => { });
        }
        const buttonMessage = await message.reply({
            content: "## Woah! That's a lot of messages!\n" +
                '# Are you sure you want to delete all of them?',
            components: [this.buttons]
        });
        const confirmed = await buttonMessage.awaitMessageComponent({
            componentType: discord_js_1.ComponentType.Button,
            filter: i => i.user.id === message.author.id,
            time: 60000
        }).then(async (i) => {
            if (i.customId === 'purge/cancel')
                return;
            return true;
        }).catch(() => { });
        await buttonMessage.delete().catch(() => { });
        await message.delete().catch(() => { });
        if (!confirmed)
            return;
        if (message.channel.isThread()) {
            return message.reply({
                content: 'To purge threads, just simply delete the thread.'
            }).then(() => { });
        }
        const new_channel = await message.channel.clone({
            position: message.channel.rawPosition
        }).catch(async () => {
            await message.edit({
                content: "I can't purge here. Give me permissions to see the channel."
            });
            throw new exceptions_1.PermissionError();
        });
        await message.channel.delete();
        return new_channel.send({ content: `${message.author} Purged all messages.` })
            .then(msg => {
            setTimeout(() => msg.delete(), 3000);
        }).catch(() => { });
    },
    async execute(message, args) {
        // Defaults to 100
        let amount = 100;
        let all = false;
        if (args.length > 0) {
            if (args[0].toLowerCase() === 'all')
                all = true;
            else
                amount = parseInt(args[0]);
            if (isNaN(amount))
                return message.reply({ content: 'Enter a positive number.' });
        }
        if (message.channel.isDMBased() || !message.inGuild()) {
            // DMs
            return this.delete_dms(message, amount, all);
        }
        else if (all) {
            // Purge all
            return this.delete_channel(message);
        }
        else if (!message.channel.permissionsFor(message.member)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: 'You do not have permission to purge.\n' +
                    'You need the Manage Messages permission.'
            });
        }
        else if (!message.channel.permissionsFor(message.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: "I don't have permission to purge.\n" +
                    'I need the Manage Messages permission.'
            });
        }
        if (amount <= 0) {
            return message.reply({ content: 'Enter a positive number.' });
        }
        // Copy discord.py's method of deleting
        const ___ = await message.channel.messages.fetch({ limit: 1 })
            .catch(async () => {
            await message.reply({
                content: "I can't purge here. Give me permissions to read the messages."
            });
            throw new exceptions_1.PermissionError();
        });
        if (___.size === 0) {
            return message.reply({ content: 'No messages to delete.' });
        }
        if (amount >= 100 && message.author.id !== message.client.admin.id) {
            const buttonMessage = await message.reply({
                content: "Woah! That's a lot of messages!\nAre you sure " +
                    `you want to delete ${amount} messages?`,
                components: [this.buttons]
            });
            const buttonInteraction = await buttonMessage.awaitMessageComponent({
                componentType: discord_js_1.ComponentType.Button,
                filter: i => i.user.id === message.author.id,
                time: 60000
            }).catch(() => { });
            if (buttonInteraction) {
                await buttonInteraction.deferUpdate();
                await buttonInteraction.deleteReply().catch(() => { });
            }
            else {
                await buttonMessage.delete().catch(() => { });
            }
            if (!buttonInteraction || buttonInteraction.customId === 'purge/cancel') {
                return message.delete().catch(() => { });
            }
        }
        const history = await this.fetch_history(message.channel, amount + 1);
        const min_date = new Date().getTime() - 14 * 24 * 60 * 60 * 1000;
        const iterator = history[Symbol.iterator]();
        let to_delete = [];
        let deleted = 0;
        let msg = iterator.next();
        while (!msg.done) {
            // Older than 14 days
            if (msg.value[1].createdTimestamp < min_date) {
                if (to_delete.length) {
                    if (to_delete.length === 1) {
                        await to_delete[0].delete();
                        ++deleted;
                    }
                    else {
                        const arr = await message.channel.bulkDelete(to_delete);
                        deleted += arr.size;
                    }
                }
                const arr = [msg.value];
                arr.push(...iterator);
                deleted += await this.delete_single(arr.map(m => m[1]));
                to_delete = [];
                break;
            }
            else if (to_delete.length === 100) {
                message.channel.bulkDelete(to_delete);
                deleted += 100;
                to_delete = [];
            }
            to_delete.push(msg.value[1]);
            msg = iterator.next();
        }
        if (to_delete.length) {
            if (to_delete.length === 1) {
                await to_delete[0].delete();
                ++deleted;
            }
            else {
                const arr = await message.channel.bulkDelete(to_delete);
                deleted += arr.size;
            }
        }
        return message.channel.send({ content: `${message.author} deleted ${deleted - 1} message(s).` })
            .then(m => setTimeout(() => m.delete(), 3000)).catch(() => { });
    }
};
exports.resetdb = {
    name: 'resetdb',
    admin: true,
    desc: 'Performs emergency reset on whales and daily.',
    async execute(message) {
        message.delete();
        await message.channel.sendTyping();
        await (0, reset_db_1.default)();
        return message.channel.send({
            content: 'Successfully reset.'
        }).then(msg => msg.delete().then(() => { }).catch(() => { }));
    }
};
exports.add = {
    name: 'add',
    admin: true,
    desc: 'Adds brons to a user.',
    async execute(message, args) {
        if (message.guild?.id !== _config_1.default.guild) {
            setTimeout(() => message.delete().catch(() => { }), 200);
        }
        await message.channel.sendTyping();
        if (args.length < 2) {
            return message.channel.send({ content: 'Too less arguments.' })
                .then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(async () => await msg.delete(), 1000);
            });
        }
        let amount = undefined;
        if (!isNaN(parseInt(args[0]))) {
            amount = parseInt(args[0]);
            args.shift();
        }
        else if (!isNaN(parseInt(args[1]))) {
            amount = parseInt(args[1]);
            args.pop();
        }
        else {
            return message.channel.send({ content: 'Missing number.' })
                .then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 1000);
            });
        }
        let res = await Utils.convert_user(args[0]);
        if (res || args[0].match(discord_js_1.MessageMentions.UsersPattern)) {
            if (!res)
                res = message.mentions.users.get(args[0].replaceAll(/^[<@!]+|>+$/g, ''));
        }
        else {
            return message.channel.send({ content: 'No users found.' })
                .then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 1000);
            });
        }
        await DB.addBrons(res.id, amount);
        await message.channel.send({
            content: `${res} ${amount < 0 ? 'lost' : 'gained'} ` +
                `${Math.abs(amount)} ${message.client.bot_emojis.brons}.`,
            allowedMentions: { users: [] }
        }).then(msg => {
            if (message.guild?.id === _config_1.default.guild)
                return;
            setTimeout(() => msg.delete(), 1000);
        });
    }
};
exports.upload = {
    name: 'upload',
    admin: true,
    desc: 'Uses latest tech to upload images without {/submit}.',
    // Helper to generate a random, unique filename
    uniqueFileName(ext) {
        let id = 0;
        let test = `./files/tmp${id++}${ext}`;
        while (fs_1.default.existsSync(test)) {
            test = `./files/tmp${id++}${ext}`;
        }
        return test;
    },
    async getImage(url) {
        let opts = undefined;
        if (url.startsWith('https://i.pximg.net/')) {
            // To avoid 403
            opts = { headers: { Referer: 'https://www.pixiv.net/' } };
        }
        return fetch(url, opts).then(res => res.blob());
    },
    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        let url = args[0];
        await message.channel.sendTyping();
        // Use our helper to get the image data.
        const all = [];
        await (0, scraper_1.scrape)(url, all).then(res => {
            url = res.source;
        }).catch(() => { });
        const formdata = new FormData();
        if (!all.length) {
            const file = await this.getImage(url);
            formdata.append('images', file);
        }
        // All is defined for multiple images in twitter or pixiv.
        for (const url of all) {
            const file = await this.getImage(url);
            formdata.append('images', file);
        }
        const res = await (0, scraper_1.uploadToCDN)(formdata);
        return message.reply({ content: `<${res.join('>\n<')}>` });
    }
};
exports.start = {
    name: 'start',
    admin: true,
    desc: 'For when bot is ready again.',
    async execute(message) {
        setTimeout(() => message.delete().catch(() => { }), 200);
        if (message.client.is_listening) {
            return message.reply({ content: "I'm already listening." })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(() => { });
        }
        message.client.is_listening = true;
        return message.reply({ content: "I'm listening again." })
            .then(msg => setTimeout(() => msg.delete(), 2000))
            .catch(() => { });
    }
};
exports.stop = {
    name: 'stop',
    admin: true,
    desc: 'For when bot needs to be shut down immediately.',
    async execute(message) {
        setTimeout(() => message.delete().catch(() => { }), 200);
        if (!message.client.is_listening) {
            return message.channel.send({ content: 'I already stopped listening.' })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(() => { });
        }
        message.client.is_listening = false;
        return message.channel.send({ content: 'I stopped listening.' })
            .then(msg => setTimeout(() => msg.delete(), 2000))
            .catch(() => { });
    }
};
//# sourceMappingURL=admin_commands.js.map