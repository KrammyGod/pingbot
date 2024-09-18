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
exports.stop = exports.start = exports.del = exports.update = exports.sauce = exports.upload = exports.add = exports.resetdb = exports.purge = exports.desc = exports.name = void 0;
const _config_1 = __importDefault(require("../classes/config.js"));
const reset_db_1 = __importDefault(require("../modules/reset_db"));
const DB = __importStar(require("../modules/database"));
const Utils = __importStar(require("../modules/utils"));
const Purge = __importStar(require("../modules/purge_utils"));
const exceptions_1 = require("../classes/exceptions");
const scraper_1 = require("../modules/scraper");
const cdn_1 = require("../modules/cdn");
const discord_js_1 = require("discord.js");
const commands_1 = require("../classes/commands");
exports.name = 'Admin Message Commands';
exports.desc = "You shouldn't be seeing this";
const purge_privates = {
    buttons: new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('purge/confirm')
        .setLabel('Yes!')
        .setEmoji('🚮')
        .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder()
        .setCustomId('purge/cancel')
        .setLabel('No')
        .setStyle(discord_js_1.ButtonStyle.Secondary)),
};
exports.purge = new commands_1.MessageCommand({
    name: 'purge',
    admin: true,
    long_description: 'Purges messages, but easier.',
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
                return message.reply({ content: 'Enter a positive number.' }).then(Utils.VOID);
            }
        }
        if (message.channel.isDMBased()) {
            if (!message.channel.isSendable()) {
                return message.reply({ content: "Can't delete messages here for now." }).then(Utils.VOID);
            }
            // DMs
            const deleted = await Purge.purge_from_dm(message.channel, amount);
            return message.channel.send({ content: `Successfully deleted ${deleted} message(s).` })
                .then(m => {
                setTimeout(() => m.delete(), 3000);
            });
        }
        else if (!message.channel.permissionsFor(message.member)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: 'You do not have permission to purge.\n' +
                    'You need the `Manage Messages` permission.',
            }).then(Utils.VOID);
        }
        else if (!message.channel.permissionsFor(message.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: "I don't have permission to purge.\n" +
                    'I need the `Manage Messages` permission.',
            }).then(Utils.VOID);
        }
        else if (all) {
            // Extra permissions for purge all
            if (!message.channel.permissionsFor(message.member)
                .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
                return message.reply({
                    content: 'You do not have permission to purge all.\n' +
                        'You need the `Manage Channels` permission.',
                }).then(Utils.VOID);
            }
            else if (!message.channel.permissionsFor(message.guild.members.me)
                .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
                return message.reply({
                    content: "I don't have permission to purge all.\n" +
                        'I need the `Manage Channels` permission.',
                }).then(Utils.VOID);
            }
            const buttonMessage = await message.reply({
                content: "## Woah! That's a lot of messages!\n" +
                    '# Are you sure you want to delete all of them?',
                components: [purge_privates.buttons],
            });
            const confirmed = await buttonMessage.awaitMessageComponent({
                componentType: discord_js_1.ComponentType.Button,
                filter: i => i.user.id === message.author.id,
                time: 60_000,
            })
                .then(i => i.customId === 'purge/confirm')
                .catch(() => false);
            await buttonMessage.delete().catch(Utils.VOID);
            await message.delete().catch(Utils.VOID);
            if (!confirmed)
                return;
            if (message.channel.isThread()) {
                return message.reply({
                    content: 'To purge all in threads, just simply delete the thread.',
                }).then(Utils.VOID);
            }
            const new_channel = await Purge.purge_clean_channel(message.channel).catch(() => {
                message.edit({ content: "I can't purge here. Make sure I have permissions to modify the channel." });
                throw new exceptions_1.PermissionError();
            });
            return new_channel.send({ content: `${message.author} Purged all messages.` })
                .then(msg => {
                setTimeout(() => msg.delete(), 3000);
            }).catch(Utils.VOID);
        }
        // Use our handy helper to purge for us.
        // Also delete the message command itself in the purge, so amount + 1
        const deleted = await Purge.purge_from_channel(message.channel, amount + 1);
        // We also delete the command message, so deleted - 1
        return message.channel.send({ content: `${message.author} deleted ${deleted - 1} message(s).` })
            .then(m => {
            setTimeout(() => m.delete(), 3000);
        }).catch(Utils.VOID);
    },
});
exports.resetdb = new commands_1.MessageCommand({
    name: 'resetdb',
    admin: true,
    long_description: 'Performs emergency reset on whales and daily.',
    async execute(message) {
        setTimeout(() => message.delete().catch(Utils.VOID), 200);
        const msg = await message.reply({
            content: 'Resetting...',
            allowedMentions: { repliedUser: false },
        });
        await (0, reset_db_1.default)();
        return msg.edit({
            content: 'Successfully reset.',
        }).then(msg => msg.delete().then(Utils.VOID, Utils.VOID));
    },
});
exports.add = new commands_1.MessageCommand({
    name: 'add',
    admin: true,
    long_description: 'Adds brons to a user.',
    async execute(message, args) {
        if (!message.channel.isSendable()) {
            return message.reply({ content: "Can't use that command here." }).then(Utils.VOID);
        }
        if (message.guild?.id !== _config_1.default.guild) {
            setTimeout(() => message.delete().catch(Utils.VOID), 200);
        }
        await message.channel.sendTyping();
        if (args.length < 2) {
            return message.channel.send({ content: 'Too less arguments.' })
                .then(msg => {
                setTimeout(() => message.delete().catch(Utils.VOID), 200);
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
                setTimeout(() => message.delete().catch(Utils.VOID), 200);
                setTimeout(() => msg.delete(), 1000);
            });
        }
        let res = await Utils.convert_user(message.client, args[0]);
        if (res || args[0].match(discord_js_1.MessageMentions.UsersPattern)) {
            if (!res)
                res = message.mentions.users.get(args[0].replaceAll(/^[<@!]+|>+$/g, ''));
        }
        else {
            return message.channel.send({ content: 'No users found.' })
                .then(msg => {
                setTimeout(() => message.delete().catch(Utils.VOID), 200);
                setTimeout(() => msg.delete(), 1000);
            });
        }
        await DB.addBrons(res.id, amount);
        await message.channel.send({
            content: `${res} ${amount < 0 ? 'lost' : 'gained'} ` +
                `${Math.abs(amount)} ${message.client.bot_emojis.brons}.`,
            allowedMentions: { users: [] },
        }).then(msg => {
            if (message.guild?.id === _config_1.default.guild)
                return;
            setTimeout(() => msg.delete(), 1000);
        });
    },
});
exports.upload = new commands_1.MessageCommand({
    name: 'upload',
    admin: true,
    long_description: 'Uses latest tech to upload images without {/submit}.',
    async execute(message, args) {
        if (!message.channel.isSendable()) {
            return message.reply({ content: "Can't use that command here." }).then(Utils.VOID);
        }
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(Utils.VOID), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        const res = [];
        setTimeout(() => message.edit({ flags: discord_js_1.MessageFlags.SuppressEmbeds }), 200);
        const flags = discord_js_1.MessageFlags.SuppressEmbeds | discord_js_1.MessageFlags.SuppressNotifications;
        await message.channel.sendTyping();
        const all = await Promise.all(args.map(url => (0, scraper_1.getRawImageLink)(url).catch(() => ({ images: [url], source: url }))));
        if (all.length) {
            const formdata = new FormData();
            for (const obj of all) {
                const images = await Promise.all(obj.images.map(cdn_1.getImage));
                for (const { ext, blob } of images) {
                    formdata.append('images', blob, `tmp.${ext}`);
                    formdata.append('sources', obj.source);
                }
            }
            res.push(...await (0, cdn_1.uploadToCDN)(formdata));
        }
        await message.reply({ content: `${res.map((r, i) => `${i + 1}. ${r}`).join('\n')}`, flags });
    },
});
exports.sauce = new commands_1.MessageCommand({
    name: 'sauce',
    admin: true,
    long_description: 'Uses saucenao to find the source of an image.',
    async execute(message, args) {
        if (!message.channel.isSendable()) {
            return message.reply({ content: "Can't use that command here." }).then(Utils.VOID);
        }
        if (args.length < 1) {
            message.client.is_using_lambda = !message.client.is_using_lambda;
            const content = message.client.is_using_lambda ? 'Using lambda.' : 'Not using lambda.';
            return message.channel.send({ content }).then(msg => {
                setTimeout(() => message.delete().catch(Utils.VOID), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        setTimeout(() => message.edit({ flags: discord_js_1.MessageFlags.SuppressEmbeds }), 200);
        const flags = discord_js_1.MessageFlags.SuppressEmbeds | discord_js_1.MessageFlags.SuppressNotifications;
        await message.channel.sendTyping();
        let content = args.map((arg, i) => `${i + 1}. ${arg}`).join('\n') + '\n\n';
        for (const [i, arg] of args.entries()) {
            const response = await (0, scraper_1.getSauce)(arg, message.client.is_using_lambda);
            // pixiv sauces have different link, prefer en/artworks/ format.
            content += `${i + 1}. ${response.sauce.replace(/member_illust.php?mode=.*&illust_id=/g, 'en/artworks/')}\n`;
            if (response.error) {
                return message.reply({ content, flags }).then(Utils.VOID);
            }
        }
        await message.reply({ content, flags });
    },
});
exports.update = new commands_1.MessageCommand({
    name: 'update',
    admin: true,
    long_description: 'Updates the sources of images in the CDN.',
    async execute(message, args) {
        if (!message.channel.isSendable()) {
            return message.reply({ content: "Can't use that command here." }).then(Utils.VOID);
        }
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(Utils.VOID), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        else if (args.length % 2 !== 0) {
            return message.channel.send({ content: 'Arguments must be in pairs.' }).then(msg => {
                setTimeout(() => message.delete().catch(Utils.VOID), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        setTimeout(() => message.edit({ flags: discord_js_1.MessageFlags.SuppressEmbeds }), 200);
        const flags = discord_js_1.MessageFlags.SuppressEmbeds | discord_js_1.MessageFlags.SuppressNotifications;
        await message.channel.sendTyping();
        const urls = args.splice(0, args.length / 2);
        const res = await (0, cdn_1.updateCDN)(urls.map(a => a.replace(`${_config_1.default.cdn}/images/`, '')), args);
        await message.reply({ content: `API replied with: ${res}`, flags });
    },
});
exports.del = new commands_1.MessageCommand({
    name: 'delete',
    admin: true,
    long_description: 'Deletes images from the CDN.',
    async execute(message, args) {
        if (!message.channel.isSendable()) {
            return message.reply({ content: "Can't use that command here." }).then(Utils.VOID);
        }
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(Utils.VOID), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        setTimeout(() => message.edit({ flags: discord_js_1.MessageFlags.SuppressEmbeds }), 200);
        await message.channel.sendTyping();
        // Remove CDN url to get the filename
        const res = await (0, cdn_1.deleteFromCDN)(args.map(a => a.replace(`${_config_1.default.cdn}/images/`, '')));
        await message.reply({ content: `API replied with: ${res}` });
    },
});
exports.start = new commands_1.MessageCommand({
    name: 'start',
    admin: true,
    long_description: 'For when bot is ready again.',
    async execute(message) {
        setTimeout(() => message.delete().catch(Utils.VOID), 200);
        if (message.client.is_listening) {
            await message.reply({ content: "I'm already listening." })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(Utils.VOID);
        }
        else {
            message.client.is_listening = true;
            await message.reply({ content: "I'm listening again." })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(Utils.VOID);
        }
    },
});
exports.stop = new commands_1.MessageCommand({
    name: 'stop',
    admin: true,
    long_description: 'For when bot needs to be shut down immediately.',
    async execute(message) {
        if (!message.channel.isSendable()) {
            return message.reply({ content: "Can't use that command here." }).then(Utils.VOID);
        }
        setTimeout(() => message.delete().catch(Utils.VOID), 200);
        if (!message.client.is_listening) {
            await message.channel.send({ content: 'I already stopped listening.' })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(Utils.VOID);
        }
        else {
            message.client.is_listening = false;
            await message.channel.send({ content: 'I stopped listening.' })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(Utils.VOID);
        }
    },
});
//# sourceMappingURL=admin_commands.js.map