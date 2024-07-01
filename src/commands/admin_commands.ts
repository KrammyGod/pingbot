import config from '@config';
import reset from '@modules/reset_db';
import * as DB from '@modules/database';
import * as Utils from '@modules/utils';
import * as Purge from '@modules/purge_utils';
import { PermissionError, } from '@classes/exceptions';
import { getRawImageLink, getSauce, } from '@modules/scraper';
import { deleteFromCDN, getCDNMetrics, getImage, updateCDN, uploadToCDN, } from '@modules/cdn';
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
    MessageFlags, MessageMentions, PermissionsBitField,
} from 'discord.js';
import type DTypes from 'discord.js';
import type { MessageCommand, } from '@classes/client';

export const name = 'Admin Message Commands';
export const desc = "You shouldn't be seeing this";

type PurgePrivates = {
    buttons: ActionRowBuilder<DTypes.MessageActionRowComponentBuilder>;
};
export const purge: MessageCommand & PurgePrivates = {
    name: 'purge',
    admin: true,
    desc: 'Purges messages, but easier.',

    buttons: new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('purge/confirm')
                .setLabel('Yes!')
                .setEmoji('🚮')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('purge/cancel')
                .setLabel('No')
                .setStyle(ButtonStyle.Secondary)),

    async execute(message, args) {
        // Defaults to 100
        let amount = 100;
        let all = false;
        if (args.length > 0) {
            if (args[0].toLowerCase() === 'all') all = true;
            else amount = parseInt(args[0]);
            if (isNaN(amount) || amount <= 0) {
                return message.reply({ content: 'Enter a positive number.' }).then(() => { });
            }
        }
        if (message.channel.isDMBased()) {
            // DMs
            const deleted = await Purge.purge_from_dm(message.channel, amount);
            return message.channel.send({ content: `Successfully deleted ${deleted} message(s).` })
                .then(m => { setTimeout(() => m.delete(), 3000); });
        } else if (!message.channel.permissionsFor(message.member!)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: 'You do not have permission to purge.\n' +
                    'You need the `Manage Messages` permission.',
            }).then(() => { });
        } else if (!message.channel.permissionsFor(message.guild!.members.me!)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: "I don't have permission to purge.\n" +
                    'I need the `Manage Messages` permission.',
            }).then(() => { });
        } else if (all) {
            // Extra permissions for purge all
            if (!message.channel.permissionsFor(message.member!)
                .has(PermissionsBitField.Flags.ManageChannels)) {
                return message.reply({
                    content: 'You do not have permission to purge all.\n' +
                        'You need the `Manage Channels` permission.',
                }).then(() => { });
            } else if (!message.channel.permissionsFor(message.guild!.members.me!)
                .has(PermissionsBitField.Flags.ManageChannels)) {
                return message.reply({
                    content: "I don't have permission to purge all.\n" +
                        'I need the `Manage Channels` permission.',
                }).then(() => { });
            }
            const buttonMessage = await message.reply({
                content: "## Woah! That's a lot of messages!\n" +
                    '# Are you sure you want to delete all of them?',
                components: [this.buttons],
            });

            const confirmed = await buttonMessage.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: i => i.user.id === message.author.id,
                time: 60_000,
            }).then(i => i.customId === 'purge/confirm').catch(() => false);
            await buttonMessage.delete().catch(() => { });
            await message.delete().catch(() => { });
            if (!confirmed) return;

            if (message.channel.isThread()) {
                return message.reply({
                    content: 'To purge all in threads, just simply delete the thread.',
                }).then(() => { });
            }
            const new_channel = await Purge.purge_clean_channel(message.channel).catch(() => {
                message.edit({ content: "I can't purge here. Make sure I have permissions to modify the channel." });
                throw new PermissionError();
            });
            return new_channel.send({ content: `${message.author} Purged all messages.` })
                .then(msg => {
                    setTimeout(() => msg.delete(), 3000);
                }).catch(() => { });
        }

        // Use our handy helper to purge for us.
        // Also delete the message command itself in the purge, so amount + 1
        const deleted = await Purge.purge_from_channel(message.channel, amount + 1);

        // We also delete the command message, so deleted - 1
        return message.channel.send({ content: `${message.author} deleted ${deleted - 1} message(s).` })
            .then(m => { setTimeout(() => m.delete(), 3000); }).catch(() => { });
    },
};

export const resetdb: MessageCommand = {
    name: 'resetdb',
    admin: true,
    desc: 'Performs emergency reset on whales and daily.',

    async execute(message) {
        setTimeout(() => message.delete().catch(() => { }), 200);
        await message.channel.sendTyping();
        await reset();
        return message.channel.send({
            content: 'Successfully reset.',
        }).then(msg => msg.delete().then(() => { }, () => { }));
    },
};

export const add: MessageCommand = {
    name: 'add',
    admin: true,
    desc: 'Adds brons to a user.',

    async execute(message, args, client) {
        if (message.guild?.id !== config.guild) {
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
        } else if (!isNaN(parseInt(args[1]))) {
            amount = parseInt(args[1]);
            args.pop();
        } else {
            return message.channel.send({ content: 'Missing number.' })
                .then(msg => {
                    setTimeout(() => message.delete().catch(() => { }), 200);
                    setTimeout(() => msg.delete(), 1000);
                });
        }
        let res = await Utils.convert_user(args[0]);
        if (res || args[0].match(MessageMentions.UsersPattern)) {
            if (!res) res = message.mentions.users.get(args[0].replaceAll(/^[<@!]+|>+$/g, ''));
        } else {
            return message.channel.send({ content: 'No users found.' })
                .then(msg => {
                    setTimeout(() => message.delete().catch(() => { }), 200);
                    setTimeout(() => msg.delete(), 1000);
                });
        }
        await DB.addBrons(res!.id, amount);
        await message.channel.send({
            content: `${res} ${amount < 0 ? 'lost' : 'gained'} ` +
                `${Math.abs(amount)} ${client.bot_emojis.brons}.`,
            allowedMentions: { users: [] },
        }).then(msg => {
            if (message.guild?.id === config.guild) return;
            setTimeout(() => msg.delete(), 1000);
        });
    },
};

export const metrics: MessageCommand = {
    name: 'metrics',
    admin: true,
    desc: 'Shows metrics from the CDN.',

    async execute(message) {
        await message.channel.sendTyping();
        const { metrics } = await getCDNMetrics();
        let content = 'Code | Count\n------|--------\n';
        for (const metric of metrics) {
            content += `  ${metric.statuscode}  |    ${metric.count}\n`;
        }
        if (!metrics.length) content = 'No metrics found.';
        await message.reply({ content });
    },
};

export const upload: MessageCommand = {
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
        setTimeout(() => message.edit({ flags: MessageFlags.SuppressEmbeds }), 200);
        const flags = MessageFlags.SuppressEmbeds | MessageFlags.SuppressNotifications;
        await message.channel.sendTyping();
        const all = await Promise.all(args.map(url => 
            getRawImageLink(url).catch(() => ({ images: [url], source: url })),
        ));
        if (all.length) {
            const formdata = new FormData();
            for (const obj of all) {
                const images = await Promise.all(obj.images.map(getImage));
                for (const { ext, blob } of images) {
                    formdata.append('images', blob, `tmp.${ext}`);
                    formdata.append('sources', obj.source);
                }
            }
            res.push(...await uploadToCDN(formdata));
        }
        await message.reply({ content: `${res.map((r, i) => `${i + 1}. ${r}`).join('\n')}`, flags });
    },
};

export const sauce: MessageCommand = {
    name: 'sauce',
    admin: true,
    desc: 'Uses saucenao to find the source of an image.',

    async execute(message, args) {
        if (args.length < 1) {
            config.lambda = !config.lambda;
            const content = config.lambda ? 'Using lambda.' : 'Not using lambda.';
            return message.channel.send({ content }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        setTimeout(() => message.edit({ flags: MessageFlags.SuppressEmbeds }), 200);
        const flags = MessageFlags.SuppressEmbeds | MessageFlags.SuppressNotifications;
        await message.channel.sendTyping();
        let content = args.map((arg, i) => `${i + 1}. ${arg}`).join('\n') + '\n\n';
        for (const [i, arg] of args.entries()) {
            const response = await getSauce(arg);
            // pixiv sauces have different link, prefer en/artworks/ format.
            content += `${i + 1}. ${response.sauce.replace(
                'member_illust.php?mode=medium&illust_id=',
                'en/artworks/',
            )}\n`;
            if (response.error) {
                return message.reply({ content, flags }).then(() => { });
            }
        }
        await message.reply({ content, flags });
    },
};

export const update: MessageCommand = {
    name: 'update',
    admin: true,
    desc: 'Updates the sources of images in the CDN.',

    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        } else if (args.length % 2 !== 0) {
            return message.channel.send({ content: 'Arguments must be in pairs.' }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        setTimeout(() => message.edit({ flags: MessageFlags.SuppressEmbeds }), 200);
        const flags = MessageFlags.SuppressEmbeds | MessageFlags.SuppressNotifications;
        await message.channel.sendTyping();
        const urls = args.splice(0, args.length / 2);
        const res = await updateCDN(
            urls.map(a => a.replace(`${config.cdn}/images/`, '')),
            args, // Rest of the args are new sources
        );
        await message.reply({ content: `API replied with: ${res}`, flags });
    },
};

export const del: MessageCommand = {
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
        setTimeout(() => message.edit({ flags: MessageFlags.SuppressEmbeds }), 200);
        await message.channel.sendTyping();
        // Remove CDN url to get the filename
        const res = await deleteFromCDN(args.map(a => a.replace(`${config.cdn}/images/`, '')));
        await message.reply({ content: `API replied with: ${res}` });
    },
};

export const start: MessageCommand = {
    name: 'start',
    admin: true,
    desc: 'For when bot is ready again.',

    async execute(message, _args, client) {
        setTimeout(() => message.delete().catch(() => { }), 200);
        if (client.is_listening) {
            await message.reply({ content: "I'm already listening." })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(() => { });
        } else {
            client.is_listening = true;
            await message.reply({ content: "I'm listening again." })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(() => { });
        }
    },
};

export const stop: MessageCommand = {
    name: 'stop',
    admin: true,
    desc: 'For when bot needs to be shut down immediately.',

    async execute(message, _args, client) {
        setTimeout(() => message.delete().catch(() => { }), 200);
        if (!client.is_listening) {
            await message.channel.send({ content: 'I already stopped listening.' })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(() => { });
        } else {
            client.is_listening = false;
            await message.channel.send({ content: 'I stopped listening.' })
                .then(msg => setTimeout(() => msg.delete(), 2000))
                .catch(() => { });
        }
    },
};
