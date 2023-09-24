import fs from 'fs';
import axios from 'axios';
import reset from '@modules/reset_db';
import scrape from '@modules/scraper';
import config from '@config';
import FormData from 'form-data';
import * as DB from '@modules/database';
import * as Utils from '@modules/utils';
import { PermissionError } from '@classes/exceptions';
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
    MessageMentions, PermissionsBitField
} from 'discord.js';
import type DTypes from 'discord.js';
import type { MessageCommand } from '@classes/client';

// Setup ffmpeg
import { path } from '@ffmpeg-installer/ffmpeg';
import ffmpeg from 'fluent-ffmpeg';
ffmpeg.setFfmpegPath(config.ffmpeg || path);

export const name = 'Admin Message Commands';
export const desc = "You shouldn't be seeing this";

type PurgePrivates = {
    buttons: ActionRowBuilder<DTypes.MessageActionRowComponentBuilder>;
    delete_single: (msgs: DTypes.Message[]) => Promise<number>;
    fetch_history: (
        channel: DTypes.TextBasedChannel,
        amount: number,
        filter?: (m: DTypes.Message) => boolean
    ) => Promise<[string, DTypes.Message<boolean>][]>;
    delete_dms: (message: DTypes.Message, amount: number, all: boolean) => Promise<void>;
    delete_channel: (message: DTypes.Message<true>) => Promise<void>;
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
                .setEmoji('✅')
                .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
                .setCustomId('purge/cancel')
                .setLabel('No.')
                .setEmoji('❎')
                .setStyle(ButtonStyle.Danger)),

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
        const history: [string, DTypes.Message][] = [];
        let prev = undefined;
        // Set upper limit to prevent true infinite loop.
        while (i <= 100_000_000) {
            const to_fetch = (amount - i * 100) > 100 ? 100 : amount - i * 100;
            if (to_fetch <= 0) break;
            let messages = await channel.messages.fetch({
                limit: to_fetch,
                before: prev
            });
            messages = messages.filter(filter);
            if (!messages.size) break;
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
            return message.reply({ content: 'Can\'t delete all messages in DMs.' }).then(() => { });
        } else if (amount <= 0) {
            return message.reply({ content: 'Enter a positive number.' }).then(() => { });
        }
        let deleted = 0;
        while (amount > 0) {
            const messages = await this.fetch_history(
                message.channel,
                amount + 1,
                (m) => m.author.id === message.client.user.id
            );
            if (messages.length === 0) break;
            const msgs = [...messages].map(m => m[1]);
            const burst: number = await this.delete_single(msgs);
            amount -= burst;
            deleted += burst;
        }
        return message.channel.send({ content: `Successfully deleted ${deleted} message(s).` })
            .then(m => { setTimeout(() => m.delete(), 3000); });
    },

    async delete_channel(message) {
        if (!message.channel.permissionsFor(message.member!)
            .has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({
                content: 'You do not have permission to purge all.\n' +
                    'You need the Manage Channels permission.'
            }).then(() => { });
        } else if (!message.channel.permissionsFor(message.guild.members.me!)
            .has(PermissionsBitField.Flags.ManageChannels)) {
            return message.reply({
                content: "I don't have permission to purge all.\n" +
                    'I need the Manage Channels permission.'
            }).then(() => { });
        }
        const buttonMessage = await message.reply({
            content: "Woah! That's a lot of messages!\n" +
                'Are you sure you want to delete all of them?',
            components: [this.buttons]
        });

        const confirmed = await buttonMessage.awaitMessageComponent({
            componentType: ComponentType.Button,
            filter: i => i.user.id === message.author.id,
            time: 60_000
        }).then(async i => {
            if (i.customId === 'purge/cancel') return;
            return true;
        }).catch(() => { });
        await buttonMessage.delete().catch(() => { });
        await message.delete().catch(() => { });
        if (!confirmed) return;

        if (message.channel.isThread()) {
            return message.reply({
                content: 'To purge threads, just simply delete the thread.'
            }).then(() => { });
        }
        const new_channel = await message.channel.clone({
            position: message.channel.rawPosition
        }).catch(async () => {
            await message.edit({
                content: 'I can\'t purge here. Give me permissions to see the channel.'
            });
            throw new PermissionError();
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
            if (args[0].toLowerCase() === 'all') all = true;
            else amount = parseInt(args[0]);
            if (isNaN(amount)) return message.reply({ content: 'Enter a positive number.' });
        }
        if (message.channel.isDMBased() || !message.inGuild()) {
            // DMs
            return this.delete_dms(message, amount, all);
        } else if (all) {
            // Purge all
            return this.delete_channel(message);
        } else if (!message.channel.permissionsFor(message.member!)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: 'You do not have permission to purge.\n' +
                    'You need the Manage Messages permission.'
            });
        } else if (!message.channel.permissionsFor(message.guild.members.me!)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return message.reply({
                content: 'I don\'t have permission to purge.\n' +
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
                    content: 'I can\'t purge here. Give me permissions to read the messages.'
                });
                throw new PermissionError();
            });
        if (___.size === 0) {
            return message.reply({ content: 'No messages to delete.' });
        }

        if (amount >= 100 && message.author.id !== message.client.admin.id) {
            const buttonMessage = await message.reply({
                content: 'Woah! That\'s a lot of messages!\nAre you sure ' +
                    `you want to delete ${amount} messages?`,
                components: [this.buttons]
            });

            const buttonInteraction = await buttonMessage.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: i => i.user.id === message.author.id,
                time: 60_000
            }).catch(() => { });
            if (buttonInteraction) {
                await buttonInteraction.deferUpdate();
                await buttonInteraction.deleteReply().catch(() => { });
            } else {
                await buttonMessage.delete().catch(() => { });
            }
            if (!buttonInteraction || buttonInteraction.customId === 'purge/cancel') {
                return message.delete().catch(() => { });
            }
        }
        const history: [string, DTypes.Message][] = await this.fetch_history(message.channel, amount + 1);
        const min_date = new Date().getTime() - 14 * 24 * 60 * 60 * 1000;
        const iterator = history[Symbol.iterator]();
        let to_delete: DTypes.Message[] = [];
        let deleted = 0;
        let msg = iterator.next();
        while (!msg.done) {
            // Older than 14 days
            if (msg.value[1].createdTimestamp < min_date) {
                if (to_delete.length) {
                    if (to_delete.length === 1) {
                        await to_delete[0].delete();
                        ++deleted;
                    } else {
                        const arr = await message.channel.bulkDelete(to_delete);
                        deleted += arr.size;
                    }
                }
                const arr = [msg.value];
                arr.push(...iterator);
                deleted += await this.delete_single(arr.map(m => m[1]));
                to_delete = [];
                break;
            } else if (to_delete.length === 100) {
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
            } else {
                const arr = await message.channel.bulkDelete(to_delete);
                deleted += arr.size;
            }
        }

        return message.channel.send({ content: `${message.author} deleted ${deleted - 1} message(s).` })
            .then(m => setTimeout(() => m.delete(), 3000)).catch(() => { });
    }
};

export const resetdb: MessageCommand = {
    name: 'resetdb',
    admin: true,
    desc: 'Performs emergency reset on whales and daily.',

    async execute(message) {
        message.delete();
        await message.channel.sendTyping();
        await reset();
        return message.channel.send({
            content: 'Successfully reset.'
        }).then(msg => msg.delete().then(() => { }).catch(() => { }));
    }
};

export const add: MessageCommand = {
    name: 'add',
    admin: true,
    desc: 'Adds brons to a user.',

    async execute(message, args) {
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
                `${Math.abs(amount)} ${message.client.bot_emojis.brons}.`,
            allowedMentions: { users: [] }
        }).then(msg => {
            if (message.guild?.id === config.guild) return;
            setTimeout(() => msg.delete(), 1000);
        });
    }
};

type UploadPrivates = {
    uniqueFileName: (ext: string) => string;
    uploadToImgur: (message: DTypes.Message, url: string, title?: string, description?: string) => Promise<string>;
};
export const upload: MessageCommand & UploadPrivates = {
    name: 'upload',
    admin: true,
    desc: 'Uses latest tech to upload images without {/submit}.',

    // Helper to generate a random, unique filename
    uniqueFileName(ext) {
        let id = 0;
        let test = `./files/tmp${id++}${ext}`;
        while (fs.existsSync(test)) {
            test = `./files/tmp${id++}${ext}`;
        }
        return test;
    },

    async uploadToImgur(message, url, title, description) {
        let headers: string | undefined = undefined; // Custom headers for ffmpeg in case of pixiv images.
        let imageData: string | fs.ReadStream = url;

        // For now, we only ignore gifs (all animated will be ignored)
        if (!imageData.includes('.gif')) {
            // Add headers to prevent 403.
            if (imageData.startsWith('https://i.pximg.net/')) {
                headers = 'Referer: https://www.pixiv.net/';
            }
            // Use ffmpeg to quickly convert into jpg.
            const filePath = this.uniqueFileName('.jpg');
            // This allows us to block until ffmpeg is done.
            await new Promise(resolve => {
                const cmd = ffmpeg().input(imageData);
                if (headers) cmd.inputOption('-headers', headers);
                cmd.save(filePath).on('end', () => {
                    // Clean up after reading file.
                    imageData = fs.createReadStream(filePath).on('end', () => {
                        return fs.promises.unlink(filePath).catch(() => { });
                    });
                    resolve(undefined);
                }).on('error', async err => {
                    await message.reply(`FFmpeg error: ${err}`);
                    resolve(undefined);
                });
            });
        }
        // Post to imgur to upload and send back the link.
        const formdata = new FormData();
        formdata.append('image', imageData);
        if (title) formdata.append('title', title);
        if (description) formdata.append('description', description);
        const request_config = {
            method: 'POST',
            maxBodyLength: Infinity,
            url: 'https://api.imgur.com/3/image',
            headers: {
                'Authorization': `Client-ID ${config.imgur}`,
                ...formdata.getHeaders()
            },
            data: formdata
        };
        // Gave up w/ fetch and had to use axios.
        return axios(request_config)
            .then(i => i.data.data.link)
            .catch(err => err.response.data.data.error.message ??
                err.response.data.data.error);
    },

    async execute(message, args) {
        if (args.length < 1) {
            return message.channel.send({ content: 'Too few arguments.' }).then(msg => {
                setTimeout(() => message.delete().catch(() => { }), 200);
                setTimeout(() => msg.delete(), 2000);
            });
        }
        let url = args[0];
        const title = args[1];
        let description = args[2];
        await message.channel.sendTyping();

        // Use our helper to get the image data.
        const all: string[] = [];
        await scrape(url, all).then(res => {
            url = res.source;
            if (res.sauce) description = res.sauce;
        }).catch(() => { });

        const res: string[] = [];
        if (!all.length) {
            res.push(await this.uploadToImgur(message, url, title, description));
        }
        // All is defined for multiple images in twitter or pixiv.
        for (const url of all) {
            res.push(await this.uploadToImgur(message, url, title, description));
        }
        return message.reply({ content: `<${res.join('>\n<')}>` });
    }
};

export const start: MessageCommand = {
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

export const stop: MessageCommand = {
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
