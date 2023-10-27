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
exports.stop = exports.start = exports.del = exports.update = exports.upload = exports.add = exports.resetdb = exports.purge = exports.desc = exports.name = void 0;
const _config_1 = __importDefault(require("../classes/config.js"));
const reset_db_1 = __importDefault(require("../modules/reset_db"));
const scraper_1 = __importDefault(require("../modules/scraper"));
const DB = __importStar(require("../modules/database"));
const Utils = __importStar(require("../modules/utils"));
const exceptions_1 = require("../classes/exceptions");
const cdn_1 = require("../modules/cdn");
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
    async delete_dms(channel, amount) {
        const self_filter = (m) => m.author.id === channel.client.user.id;
        let deleted = 0;
        let rounds = 0;
        for await (const msg of Utils.fetch_history(channel, amount, self_filter)) {
            await msg.delete().catch(() => --deleted);
            ++deleted;
            // Wait 1 second every 10 delete requests
            if (++rounds % 10 === 0)
                await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return channel.send({ content: `Successfully deleted ${deleted} message(s).` })
            .then(m => { setTimeout(() => m.delete(), 3000); });
    },
    async delete_channel(message) {
        // Extra permissions for purge all
        if (!message.channel.permissionsFor(message.member)
            .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({
                content: 'You do not have permission to purge all.\n' +
                    'You need the `Manage Channels` permission.'
            }).then(() => { });
        }
        else if (!message.channel.permissionsFor(message.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({
                content: "I don't have permission to purge all.\n" +
                    'I need the `Manage Channels` permission.'
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
        }).then(i => i.customId === 'purge/confirm').catch(() => false);
        await buttonMessage.delete().catch(() => { });
        await message.delete().catch(() => { });
        if (!confirmed)
            return;
        if (message.channel.isThread()) {
            return message.reply({
                content: 'To purge all in threads, just simply delete the thread.'
            }).then(() => { });
        }
        const new_channel = await message.channel.clone({
            position: message.channel.rawPosition
        }).catch(() => {
            message.edit({
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
            if (isNaN(amount) || amount <= 0) {
                return message.reply({ content: 'Enter a positive number.' });
            }
        }
        if (message.channel.isDMBased() || !message.inGuild()) {
            // DMs
            return this.delete_dms(message.channel, amount);
        }
        else if (!message.channel.permissionsFor(message.member)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: 'You do not have permission to purge.\n' +
                    'You need the `Manage Messages` permission.'
            });
        }
        else if (!message.channel.permissionsFor(message.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: "I don't have permission to purge.\n" +
                    'I need the `Manage Messages` permission.'
            });
        }
        else if (all) {
            // Purge all
            return this.delete_channel(message);
        }
        // Copy discord.py's method of deleting
        // First test to see if we can fetch messages
        const test = await message.channel.messages.fetch({ limit: 1 })
            .catch(() => {
            message.reply({
                content: "I can't purge here. Give me permissions to read the messages."
            });
            throw new exceptions_1.PermissionError();
        });
        if (test.size === 0) {
            return message.reply({ content: 'No messages to delete.' });
        }
        // Keep async to keep Promise<number> signature
        const bulk_delete = async (messages) => {
            // Discord bulk delete doesn't like single messages.
            if (messages.length <= 1) {
                return messages.at(0)?.delete().then(() => 1).catch(() => 0) ?? 0;
            }
            return message.channel.bulkDelete(messages).then(arr => arr.size);
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
        // Also delete the message command itself in the purge, so amount + 1
        for await (const msg of Utils.fetch_history(message.channel, amount + 1)) {
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
        // We also delete the command message, so deleted - 1
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
    async execute(message, args, client) {
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
                `${Math.abs(amount)} ${client.bot_emojis.brons}.`,
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
    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        const res = [];
        await message.channel.sendTyping();
        const all = [];
        for (const url of args) {
            // Use our helper to get the image data.
            all.push(await (0, scraper_1.default)(url).catch(() => ({ images: [url], source: url })));
        }
        if (all.length) {
            const formdata = new FormData();
            for (const obj of all) {
                for (const url of obj.images) {
                    const { ext, blob } = await (0, cdn_1.getImage)(url);
                    formdata.append('images', blob, `tmp.${ext}`);
                    formdata.append('sources', obj.source);
                }
            }
            res.push(...await (0, cdn_1.uploadToCDN)(formdata));
        }
        return message.reply({ content: `<${res.join('>\n<')}>` });
    }
};
exports.update = {
    name: 'update',
    admin: true,
    desc: 'Updates the sources of images in the CDN.',
    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        else if (args.length % 2 !== 0) {
            return message.channel.send({ content: 'Arguments must be in pairs.' }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        await message.channel.sendTyping();
        const urls = args.splice(0, args.length / 2);
        const res = await (0, cdn_1.updateCDN)(urls.map(a => a.replace(`${_config_1.default.cdn}/images/`, '')), args // Rest of the args are new sources
        );
        return message.reply({ content: `API replied with: ${res}` });
    }
};
exports.del = {
    name: 'delete',
    admin: true,
    desc: 'Deletes images from the CDN.',
    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        await message.channel.sendTyping();
        // Remove CDN url to get the filename
        const res = await (0, cdn_1.deleteFromCDN)(args.map(a => a.replace(`${_config_1.default.cdn}/images/`, '')));
        return message.reply({ content: `API replied with: ${res}` });
    }
};
exports.start = {
    name: 'start',
    admin: true,
    desc: 'For when bot is ready again.',
    async execute(message, _args, client) {
        setTimeout(() => message.delete().catch(() => { }), 200);
        if (client.is_listening) {
            return message.reply({ content: "I'm already listening." })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(() => { });
        }
        client.is_listening = true;
        return message.reply({ content: "I'm listening again." })
            .then(msg => setTimeout(() => msg.delete(), 2000))
            .catch(() => { });
    }
};
exports.stop = {
    name: 'stop',
    admin: true,
    desc: 'For when bot needs to be shut down immediately.',
    async execute(message, _args, client) {
        setTimeout(() => message.delete().catch(() => { }), 200);
        if (!client.is_listening) {
            return message.channel.send({ content: 'I already stopped listening.' })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(() => { });
        }
        client.is_listening = false;
        return message.channel.send({ content: 'I stopped listening.' })
            .then(msg => setTimeout(() => msg.delete(), 2000))
            .catch(() => { });
    }
};
//# sourceMappingURL=admin_commands.js.map