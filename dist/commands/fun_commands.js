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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.poll_end = exports.poll_edit = exports.poll = exports.hoyolab = exports.getid = exports.support = exports.invite = exports.count = exports.desc = exports.name = void 0;
const _config_1 = __importDefault(require("../classes/config.js"));
const DB = __importStar(require("../modules/database"));
const Hoyo = __importStar(require("../modules/hoyolab"));
const Utils = __importStar(require("../modules/utils"));
const chrono_node_1 = require("chrono-node");
const discord_js_1 = require("discord.js");
const v10_1 = require("discord-api-types/v10");
const commands_1 = require("../classes/commands");
exports.name = 'Fun';
exports.desc = 'This category contains all the commands for fun, or are informational.';
// A purely random collection of images
// Definitely not by @ryu_minoru
const images = [
    'https://i.imgur.com/yI5mrdj.png',
    'https://i.imgur.com/PjF7G4n.jpg',
    'https://i.imgur.com/qQ1oiPX.jpg',
    'https://i.imgur.com/59EGQUd.jpg',
    'https://i.imgur.com/fJ8iRIr.jpg',
    'https://i.imgur.com/8at5hhW.jpg',
    'https://i.imgur.com/BJPKfo3.jpg',
    'https://i.imgur.com/C3pchc9.jpg',
    'https://i.imgur.com/insEa8u.jpg',
    'https://i.imgur.com/KoGmcOh.jpg',
    'https://i.imgur.com/D44fbJu.jpg',
    'https://i.imgur.com/Ldr5DBI.jpg',
    'https://i.imgur.com/q0jk1HQ.jpg',
];
exports.count = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('count')
        .setDescription('Count me, because why not?'),
    long_description: 'Count how many times you wasted on this command!\n\n' +
        'Usage: `/count`',
    async execute(interaction) {
        const id = interaction.user.id;
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        let cache = await this.cache.get(id);
        if (!cache)
            cache = { amt: 0 };
        cache.amt++;
        await this.cache.set(id, cache);
        const image = images[Math.floor(Math.random() * images.length)];
        await interaction.editReply({
            content: `Hey there, its been ${cache.amt} times already...\nTake this....`,
            embeds: [new discord_js_1.EmbedBuilder().setImage(image).setColor('Random')],
        });
    },
});
const invite_docs = `Get the invite link for the bot. 
__Permissions required:__
> **Manage Roles** *(Mute command)*
> **Manage Channels** *(Mute/purge all command)*
> **Manage Webhooks** *(emoji replacements)*
> **Read Messages/View Channels** *(for multiple commands)*
> **Moderate Members** *(Mod commands)*
> **Send Messages** *(for a few commands)*
> **Send Messages in Threads** *(for a few commands)*
> **Manage Messages** *(purge command)*
> **Embed Links** *(almost all commands)*
> **Attach files** *(for minigames only currently)*
> **Read Message History** *(for multiple commands)*
> **Use External Emojis** *(for multiple commands)*
> **Use External Stickers** *(for multiple commands)*
> **Add Reactions** *(legacy permission)*
> **Connect** *(music commands)*
> **Speak** *(music commands)*
> **Use Voice Activity** *(music commands)*
> **Priority Speaker** *(music commands)*

Usage: \`/invite\``;
exports.invite = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get the invite link for me! (See /help command: invite)'),
    long_description: invite_docs,
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        // Generated via discord's helper with the above permissions.
        const permissions = '1512670883152';
        const url = interaction.client.generateInvite({
            permissions: permissions,
            scopes: [discord_js_1.OAuth2Scopes.Bot, discord_js_1.OAuth2Scopes.ApplicationsCommands],
        });
        await interaction.editReply({
            content: `Hey there, here's the [invite link](${url}) for the bot!\n` +
                'Please do not forget to use `/help command: invite` to verify permissions required!',
        });
    },
});
exports.support = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('support')
        .setDescription('Join the support server!'),
    long_description: 'Join a server to hang out and bond with others over your favourite waifus!' +
        '~~And get bot support if needed.~~\n' +
        'Usage: `/support`',
    async execute(interaction) {
        const invite_code = 'BKAWvgVZtN';
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        // While we can get guild from fetching, it breaks the point of sharding
        // Maybe guild is unobtainable from fetching...?
        const invite_link = await Utils.fetch_guild_cache(interaction.client, _config_1.default.guild, (guild, invite_code) => {
            return guild?.invites.fetch(invite_code).then(invite => invite.url);
        }, invite_code);
        // Constant non-expiring invite
        const link = invite_link ?? `https://discord.gg/${invite_code}`;
        await interaction.editReply({
            content: `Hey there, here's the [invite link](${link}) for the support server!\n`,
        });
    },
});
exports.getid = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('getid')
        .addStringOption(option => option
        .setName('user')
        .setDescription("The user's name to get the ID of")
        .setRequired(true))
        .setDescription('Get the discord ID of a user'),
    long_description: 'Get the discord ID of a user, so you can use it for all the anime commands!\n' +
        'You can search for partial matches too!\n\n' +
        'Usage: `/getid user: <username>`\n\n' +
        '__**Options**__\n' +
        '*username:* The name of the user you would like to search for. (Required)\n\n' +
        'Examples: `/getid user: Krammy`, `/getid user: @Krammy`',
    async execute(interaction) {
        let query = interaction.options.getString('user');
        if (!query.startsWith('@')) {
            query = `@${query}`;
        }
        const users = await interaction.client.shard?.broadcastEval((client, query) => {
            const u = client.users.cache.filter(u => u.displayName.toLowerCase().includes(query) ||
                u.tag.toLowerCase().includes(query));
            return u.map(u => ({ name: `@${u.username}`, id: u.id }));
        }, { context: query }).then(results => results.flat()) ?? [];
        const res = await Utils.get_results(interaction, users, {
            title_fmt: n => `Found ${n} users:`,
            desc_fmt: u => `${u.name}`,
            sel_fmt: u => `**${u.name}**`,
        });
        if (res === null) {
            return interaction.deleteReply();
        }
        else if (!res) {
            await interaction.editReply({ content: `No users found with name ${query}!` });
        }
        else {
            await interaction.editReply({ content: `${res.name}'s ID is \`${res.id}\`` });
        }
    },
});
const all_collector_docs = `Edit your entries in the auto-collect system.
Essentially, the bot will automatically collect hoyolab dailies for you!
Visit https://tinyurl.com/ayakacookiegist for help extracting your cookie.
Furthermore, it will by default send you a message everyday when it collects with crucial information.
You can disable this by clicking the notify button.\n
__DISCLAIMER:__
Yes, giving out the cookie is a bad idea if you are scared of being hacked.
Only use this if you trust me...\n\n`;
const all_collector_buttons = [
    new discord_js_1.ButtonBuilder({
        emoji: '🔔',
        style: discord_js_1.ButtonStyle.Primary,
    }),
    new discord_js_1.ButtonBuilder({
        emoji: '🔕',
        style: discord_js_1.ButtonStyle.Secondary,
    }),
    new discord_js_1.ButtonBuilder({
        emoji: '✖️',
        style: discord_js_1.ButtonStyle.Danger,
    }),
];
function get_collector_buttons(cmd_name, hoyo, idx) {
    const rows = [];
    for (const name of hoyo) {
        const buttons = [];
        let suffix = '';
        if (name === 'HI3') {
            suffix = 'h';
        }
        else if (name === 'GI') {
            suffix = 'g';
        }
        else {
            suffix = 's';
        }
        buttons.push(discord_js_1.ButtonBuilder.from(all_collector_buttons[0]).setLabel(name).setCustomId(`${cmd_name}/0/n${suffix}/${idx}`));
        buttons.push(discord_js_1.ButtonBuilder.from(all_collector_buttons[1]).setLabel(name).setCustomId(`${cmd_name}/0/c${suffix}/${idx}`));
        buttons.push(discord_js_1.ButtonBuilder.from(all_collector_buttons[2]).setLabel(name).setCustomId(`${cmd_name}/0/d${suffix}/${idx}`));
        rows.push(new discord_js_1.ActionRowBuilder().addComponents(buttons));
    }
    return rows;
}
const hoyolab_privates = {
    input: new discord_js_1.ModalBuilder({
        title: 'Add to auto-collector',
        customId: 'hoyolab',
        components: [
            new discord_js_1.ActionRowBuilder({
                components: [
                    new discord_js_1.TextInputBuilder({
                        label: 'Cookie',
                        customId: 'cookie',
                        placeholder: 'Enter your hoyolab cookie here.',
                        style: discord_js_1.TextInputStyle.Short,
                        required: true,
                    }),
                ],
            }),
        ],
    }),
    async delete(interaction, id, name) {
        const buttons = [
            new discord_js_1.ButtonBuilder({
                label: 'Yes!',
                emoji: '🚮',
                customId: 'hconfirm',
                style: discord_js_1.ButtonStyle.Danger,
            }),
            new discord_js_1.ButtonBuilder({
                label: 'No',
                customId: 'hcancel',
                style: discord_js_1.ButtonStyle.Secondary,
            }),
        ];
        const message = await interaction.followUp({
            content: '# Are you sure you want to delete this account?',
            components: [
                new discord_js_1.ActionRowBuilder({
                    components: buttons,
                }),
            ],
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
        const confirmed = await message.awaitMessageComponent({
            componentType: discord_js_1.ComponentType.Button,
            time: 10 * 60 * 1000, // 10 mins before interaction expires
        }).then(i => {
            if (i.customId === 'hcancel')
                return;
            return true;
        }).catch(() => undefined);
        await Utils.delete_ephemeral_message(interaction, message);
        if (!confirmed)
            return;
        const res = await DB.deleteCookie(interaction.user.id, id);
        if (!res) {
            return interaction.followUp({
                content: 'Failed to delete cookie, the embed is out of date!\n' +
                    'Please make sure to only use this command once!',
                flags: discord_js_1.MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        const retval = await hoyolab_privates.getAccount(interaction, 1, name);
        await interaction.editReply(retval);
        return interaction.followUp({
            content: 'Successfully deleted cookie!',
            flags: discord_js_1.MessageFlags.Ephemeral,
        }).then(Utils.VOID);
    },
    async getAccount(interaction, pageOrIdx, name) {
        const max_pages = await DB.fetchAutocollectLength(interaction.user.id);
        let account;
        // If there exists an account, and we're getting a page #
        if (typeof pageOrIdx === 'number' && max_pages !== 0) {
            if (pageOrIdx < 1)
                pageOrIdx = 1;
            else if (pageOrIdx > max_pages)
                pageOrIdx = max_pages;
            account = await DB.fetchAutocollectByPage(interaction.user.id, pageOrIdx - 1);
        }
        else if (typeof pageOrIdx === 'string') {
            account = await DB.fetchAutocollectByIdx(interaction.user.id, pageOrIdx);
        }
        const page = parseInt(account?.page ?? '0');
        const embed = new discord_js_1.EmbedBuilder({
            title: 'Hoyolab Autocollect Details',
            color: discord_js_1.Colors.Gold,
        });
        const components = [
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder({
                label: 'Add New',
                emoji: '➕',
                customId: 'hoyolab/0/add',
                style: discord_js_1.ButtonStyle.Primary,
            }), new discord_js_1.ButtonBuilder({
                label: 'Delete',
                emoji: '✖️',
                customId: `hoyolab/0/delete/${account?.idx}`,
                style: discord_js_1.ButtonStyle.Danger,
            }), new discord_js_1.ButtonBuilder({
                label: 'Help',
                emoji: '❓',
                style: discord_js_1.ButtonStyle.Link,
                url: 'https://gist.github.com/KrammyGod/bca6eb7d424064517d779a5e449d4586',
            })),
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder({
                label: 'Previous',
                emoji: '⬅️',
                style: discord_js_1.ButtonStyle.Primary,
                customId: `hoyolab/0/${page - 1}`,
                disabled: !account || page === 1,
            }), new discord_js_1.ButtonBuilder({
                label: 'Next',
                emoji: '➡️',
                style: discord_js_1.ButtonStyle.Primary,
                customId: `hoyolab/0/${page + 1}`,
                disabled: !account || page === max_pages,
            })),
        ];
        if (!account) {
            embed.setDescription('No accounts found! Add one by clicking the add button!');
            return { embeds: [embed], components };
        }
        let desc = `**Account ${page}/${max_pages}:**\n`;
        const info = await Hoyo.getHoyoLabData(account.cookie);
        if (!info) {
            desc += 'Invalid cookie! This account needs to be deleted and re-added!';
            return { embeds: [embed.setDescription(desc)], components };
        }
        desc += `**HoyoLab ID:** ${info.uid}\n\n`;
        function getStatus(notifyStatus) {
            switch (notifyStatus) {
                case 'none':
                    return '> **Status:** *Disabled* ❌\n';
                case 'checkin':
                    return '> **Status:** *Check-in only* 🔕\n';
                case 'notify':
                    return '> **Status:** *Notified* 🔔\n';
            }
        }
        const { retval, games } = info.loadAllGames({
            honkaiStatus: getStatus(account.honkai),
            genshinStatus: getStatus(account.genshin),
            starrailStatus: getStatus(account.star_rail),
        });
        desc += retval;
        embed.setDescription(desc);
        components.push(...get_collector_buttons(name, Object.keys(games), account.idx));
        return { embeds: [embed], components };
    },
    async toggleNotify(interaction, type, g, idx) {
        let game;
        let toggle;
        switch (type) {
            case 'd':
                toggle = 'none';
                break;
            case 'c':
                toggle = 'checkin';
                break;
            case 'n':
                toggle = 'notify';
                break;
            default:
                throw new Error(`Invalid type ${type}!`);
        }
        switch (g) {
            case 'h':
                game = 'honkai';
                break;
            case 'g':
                game = 'genshin';
                break;
            case 's':
                game = 'star_rail';
                break;
            default:
                throw new Error(`Invalid game ${g}!`);
        }
        return DB.toggleAutocollect(interaction.user.id, game, toggle, idx);
    },
};
exports.hoyolab = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('hoyolab')
        .setDescription('Change hoyolab auto collector settings.'),
    long_description: all_collector_docs + 'Usage: `/hoyolab`',
    async textInput(interaction) {
        const cookie = interaction.fields.getTextInputValue('cookie').trim().replaceAll(/^'+|'+$/g, '');
        await interaction.deferUpdate();
        const info = await Hoyo.getHoyoLabData(cookie);
        if (!info) {
            return interaction.followUp({
                content: 'Unable to retrieve account information. Please check your cookie and try again.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        const res = await DB.addCookie(interaction.user.id, cookie);
        if (!res) {
            return interaction.followUp({
                content: 'Failed to add account to autocollector.\nEither you reached the max of 5 accounts, ' +
                    'or you are entering a duplicate cookie.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        // Adding new account always brings user to first page to properly reload everything.
        const retval = await hoyolab_privates.getAccount(interaction, 1, this.data.name);
        await interaction.editReply(retval);
        await interaction.followUp({
            content: 'Successfully added account to autocollector!',
            flags: discord_js_1.MessageFlags.Ephemeral,
        });
    },
    async buttonReact(interaction) {
        const [action, id] = interaction.customId.split('/').slice(2);
        if (action === 'add') {
            return interaction.showModal(hoyolab_privates.input);
        }
        const page = parseInt(action);
        await interaction.deferUpdate();
        if (!isNaN(page)) {
            const retval = await hoyolab_privates.getAccount(interaction, page, this.data.name);
            return interaction.editReply(retval).then(Utils.VOID);
        }
        else if (action === 'delete') {
            return hoyolab_privates.delete(interaction, id, this.data.name);
        }
        // Reached here means it is some sort of toggle.
        await hoyolab_privates.toggleNotify(interaction, action[0], action[1], id);
        const retval = await hoyolab_privates.getAccount(interaction, id, this.data.name);
        await interaction.editReply(retval);
    },
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        const retval = await hoyolab_privates.getAccount(interaction, 1, this.data.name);
        await interaction.editReply(retval);
    },
});
const poll_privates = {
    async getPollEditor(id) {
        const pollInfo = await exports.poll.cache.get(id);
        let desc = '';
        desc += `**Poll Title:**\n${pollInfo.title || '*(empty)*'}\n\n`;
        desc += `**Destination Channel:**\n<#${pollInfo.cid}>\n\n`;
        desc += '**Choices:**\n';
        for (const [i, choice] of pollInfo.choices.entries()) {
            desc += `**${i + 1}.** ${choice.name}\n`;
        }
        if (pollInfo.choices.length === 0) {
            desc += '*(empty)*\n';
        }
        desc += '\n**Expires:**\n';
        if (pollInfo.expires) {
            desc += Utils.timestamp(new Date(pollInfo.expires));
        }
        else {
            desc += '*(never)*';
        }
        const embed = new discord_js_1.EmbedBuilder({
            title: 'Poll Editor',
            color: discord_js_1.Colors.Gold,
            description: desc,
        });
        const components = [
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder({
                label: 'Edit Title',
                emoji: '📝',
                customId: 'poll/0/title',
                style: discord_js_1.ButtonStyle.Primary,
            }), new discord_js_1.ButtonBuilder({
                label: 'Edit Choices',
                emoji: '✏️',
                customId: 'poll/0/add',
                style: discord_js_1.ButtonStyle.Primary,
            }), new discord_js_1.ButtonBuilder({
                label: 'Edit Expiry',
                emoji: '⏱️',
                customId: 'poll/0/expiry',
                style: discord_js_1.ButtonStyle.Primary,
            }), new discord_js_1.ButtonBuilder({
                label: 'Send',
                emoji: '📨',
                customId: 'poll/0/send',
                style: discord_js_1.ButtonStyle.Success,
                disabled: pollInfo.choices.length === 0 || pollInfo.title === '',
            })),
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ChannelSelectMenuBuilder({
                customId: 'poll/0/channel',
                maxValues: 1,
                minValues: 1,
                placeholder: 'Click to change the destination channel.',
                channelTypes: [discord_js_1.ChannelType.GuildText, discord_js_1.ChannelType.GuildAnnouncement],
            })),
        ];
        return { embeds: [embed], components };
    },
    async getPoll(client, id) {
        const pollInfo = await exports.poll.cache.get(id);
        const user = await Utils.fetch_user_fast(client, pollInfo.uid, u => {
            return u ? { name: u.displayName, avatar: u.displayAvatarURL() } : undefined;
        });
        let desc = '';
        if (pollInfo.expires) {
            if (new Date >= new Date(pollInfo.expires)) {
                pollInfo.title = `(ENDED) ${pollInfo.title}`;
                desc += `**This poll has ended on ${Utils.timestamp(new Date())}**\n\n`;
                await exports.poll.cache.delete(id); // Remove from cache
            }
            else {
                desc += `**This poll expires on ${Utils.timestamp(new Date(pollInfo.expires))}**\n\n`;
            }
        }
        const buttons = [];
        for (const [i, choice] of pollInfo.choices.entries()) {
            desc += `**${i + 1}.** ${choice.name}\n`;
            for (const user of choice.users) {
                desc += `<@${user}>\n`;
            }
            if (choice.users.length === 1) {
                desc += '*(1 vote)*\n\n';
            }
            else {
                desc += `*(${choice.users.length} votes)*\n\n`;
            }
            let label = choice.name;
            if (choice.name.length > 80) {
                label = `Choice ${i + 1}`;
            }
            buttons.push(new discord_js_1.ButtonBuilder({
                label,
                customId: `poll/0/${i}`,
                style: discord_js_1.ButtonStyle.Primary,
            }));
        }
        const components = [];
        while (buttons.length > 0) {
            components.push(new discord_js_1.ActionRowBuilder({ components: buttons.splice(0, 5) }));
        }
        const embed = new discord_js_1.EmbedBuilder({
            title: pollInfo.title,
            description: desc,
            color: discord_js_1.Colors.Gold,
        }).setAuthor({ name: `${user.name} started a poll`, iconURL: user.avatar });
        return { embeds: [embed], components };
    },
    deserialize(pollInfoSerialized) {
        return {
            ...pollInfoSerialized,
            expires: pollInfoSerialized.expires ? new Date(pollInfoSerialized.expires) : undefined,
        };
    },
};
exports.poll = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('poll')
        .setDescription('Start a poll for users to vote on.')
        .setDMPermission(false),
    long_description: 'Start a poll that allows users to vote for a choice!\n' +
        'The maximum number of options is 25.\n\n' +
        'Usage: `/poll`',
    async textInput(interaction) {
        await interaction.deferUpdate();
        const action = interaction.customId.split('/')[1];
        let pollInfo = await this.cache.get(interaction.message.id, poll_privates.deserialize);
        // Somehow lost cache, delete poll
        if (!pollInfo)
            return interaction.message?.delete().then(Utils.VOID, Utils.VOID);
        // Not sure why this is needed, maybe to get the most up to date?
        if (pollInfo.mid) {
            pollInfo = await this.cache.get(pollInfo.mid, poll_privates.deserialize) ?? pollInfo;
        }
        if (action === 'title') {
            pollInfo.title = interaction.fields.getTextInputValue('title');
        }
        else if (action === 'add') {
            const c = interaction.fields.getTextInputValue('choice');
            const choices = c.trim().split('\n').map(x => x.trim()).filter(x => x !== '');
            if (!choices.length) {
                return interaction.followUp({
                    content: 'You must provide at least one choice.', flags: discord_js_1.MessageFlags.Ephemeral,
                }).then(Utils.VOID);
            }
            else if (choices.length > 25) {
                return interaction.followUp({
                    content: 'You cannot provide more than 25 choices.', flags: discord_js_1.MessageFlags.Ephemeral,
                }).then(Utils.VOID);
            }
            else if (new Set(choices).size !== choices.length) {
                return interaction.followUp({
                    content: 'All choices must be unique.', flags: discord_js_1.MessageFlags.Ephemeral,
                }).then(Utils.VOID);
            }
            pollInfo.choices = choices.map(c => {
                const prevChoice = pollInfo.choices.find(x => x.name === c);
                return prevChoice ?? { name: c, users: [] };
            });
        }
        else if (action === 'expiry') {
            const expiry = interaction.fields.getTextInputValue('expiry');
            if (expiry) {
                const date = (0, chrono_node_1.parseDate)(expiry);
                if (!date) {
                    return interaction.followUp({
                        content: `\`${expiry}\` is not a valid date/relative time!`,
                        flags: discord_js_1.MessageFlags.Ephemeral,
                    }).then(Utils.VOID);
                }
                else if (new Date() >= date) {
                    return interaction.followUp({
                        content: `${Utils.timestamp(date)} is in the past!`,
                        flags: discord_js_1.MessageFlags.Ephemeral,
                    }).then(Utils.VOID);
                }
                pollInfo.expires = date;
            }
            else {
                pollInfo.expires = undefined;
            }
        }
        else {
            throw new Error(`Invalid action ${action}!`);
        }
        await this.cache.set(interaction.message.id, pollInfo);
        const retval = await poll_privates.getPollEditor(interaction.message.id);
        await interaction.editReply(retval);
    },
    async buttonReact(interaction) {
        const action = interaction.customId.split('/')[2];
        const pollInfo = await this.cache.get(interaction.message.id, poll_privates.deserialize);
        if (!pollInfo)
            return interaction.message.delete().then(Utils.VOID, Utils.VOID); // Somehow lost cache
        const idx = parseInt(action);
        if (isNaN(idx)) {
            const send = async () => {
                await interaction.deferUpdate();
                const channel = await interaction.client.channels.fetch(pollInfo.cid);
                const { embeds, components } = await poll_privates.getPoll(interaction.client, interaction.message.id);
                let message;
                if (pollInfo.mid) {
                    // This means that we are editing the poll.
                    message = await channel.messages.fetch(pollInfo.mid).catch(() => undefined);
                    if (message) {
                        await message.edit({ embeds, components });
                    }
                    else {
                        message = await channel.send({ embeds, components });
                    }
                    // Also delete from cache and remove editing capability.
                    await this.cache.delete(interaction.message.id);
                    await interaction.deleteReply().catch(() => {
                        // If we can't delete the reply, we can't delete the original message either.
                        // So we just edit it to remove the buttons.
                        return interaction.message.edit({ embeds, components: [] }).then(Utils.VOID, Utils.VOID);
                    });
                }
                else {
                    message = await channel.send({ embeds, components });
                    await interaction.followUp({
                        content: 'Successfully sent poll! You may now close this dialog.',
                        flags: discord_js_1.MessageFlags.Ephemeral,
                    });
                }
                await this.cache.delete(pollInfo.mid); // Remove old poll from cache
                pollInfo.mid = message.id;
                await this.cache.set(message.id, pollInfo);
            };
            const input = new discord_js_1.ModalBuilder();
            switch (action) {
                case 'title':
                    input.setTitle('Edit Poll Title')
                        .setCustomId('poll/title')
                        .addComponents(new discord_js_1.ActionRowBuilder({
                        components: [
                            new discord_js_1.TextInputBuilder({
                                label: 'Set New Title',
                                customId: 'title',
                                placeholder: 'Enter the new title here.',
                                style: discord_js_1.TextInputStyle.Short,
                                required: true,
                            }),
                        ],
                    }));
                    return interaction.showModal(input);
                case 'add':
                    input.setTitle('Edit Poll Choices')
                        .setCustomId('poll/add')
                        .addComponents(new discord_js_1.ActionRowBuilder({
                        components: [
                            new discord_js_1.TextInputBuilder({
                                label: 'Add New Choices',
                                customId: 'choice',
                                value: pollInfo.choices.map(c => c.name).join('\n'),
                                placeholder: 'Enter choices here, separated by newlines.',
                                style: discord_js_1.TextInputStyle.Paragraph,
                                required: true,
                            }),
                        ],
                    }));
                    return interaction.showModal(input);
                case 'expiry':
                    input.setTitle('Edit Poll Expiry')
                        .setCustomId('poll/expiry')
                        .addComponents(new discord_js_1.ActionRowBuilder({
                        components: [
                            new discord_js_1.TextInputBuilder({
                                label: 'Set New Expiry (Leave blank to remove)',
                                customId: 'expiry',
                                value: pollInfo.expires ?
                                    new Date(pollInfo.expires).toUTCString() :
                                    '',
                                placeholder: 'Enter the date/relative time in UTC/GMT.',
                                style: discord_js_1.TextInputStyle.Short,
                                required: false,
                            }),
                        ],
                    }));
                    return interaction.showModal(input);
                case 'send':
                    return send();
                default:
                    throw new Error(`Invalid action ${action}!`);
            }
        }
        // Otherwise is a choice.
        await interaction.deferUpdate();
        const choice = pollInfo.choices[idx];
        if (!choice)
            throw new Error('Choice out of bounds!');
        const uid = interaction.user.id;
        let i = -1;
        for (const [j, choice] of pollInfo.choices.entries()) {
            if (choice.users.includes(uid)) {
                choice.users.splice(choice.users.indexOf(uid), 1);
                i = j;
                break;
            }
        }
        // Only add if they want to vote for a different option.
        // We also have to make sure that the poll hasn't expired yet.
        if (i !== idx && (!pollInfo.expires || new Date() < new Date(pollInfo.expires))) {
            pollInfo.choices[idx].users.push(uid);
        }
        await this.cache.set(interaction.message.id, pollInfo);
        const retval = await poll_privates.getPoll(interaction.client, interaction.message.id);
        await interaction.editReply(retval);
    },
    async menuReact(interaction) {
        await interaction.deferUpdate();
        const pollInfo = await this.cache.get(interaction.message.id, poll_privates.deserialize);
        if (!pollInfo)
            return interaction.message.delete().then(Utils.VOID, Utils.VOID); // Somehow lost cache
        const channel = interaction.channels.first();
        if (!channel.permissionsFor(interaction.user.id).has(discord_js_1.PermissionsBitField.Flags.SendMessages)) {
            return interaction.followUp({
                content: `You don't have permissions to send messages in ${channel}.`,
                flags: discord_js_1.MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        else if (!channel.permissionsFor(interaction.client.user.id).has(discord_js_1.PermissionsBitField.Flags.SendMessages)) {
            return interaction.followUp({
                content: `I don't have permissions to send messages in ${channel}.`,
                flags: discord_js_1.MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        pollInfo.cid = channel.id;
        await this.cache.set(interaction.message.id, pollInfo);
        const retval = await poll_privates.getPollEditor(interaction.message.id);
        await interaction.editReply(retval);
    },
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        const id = await interaction.fetchReply().then(m => m.id);
        await this.cache.set(id, {
            uid: interaction.user.id,
            cid: interaction.channelId,
            title: '',
            choices: [],
        }, Utils.date_after_hours(24)); // Expires in 24 hours.
        const retval = await poll_privates.getPollEditor(id);
        await interaction.editReply(retval);
    },
});
exports.poll_edit = new commands_1.ContextCommand({
    data: new discord_js_1.ContextMenuCommandBuilder()
        .setName('Edit Poll')
        .setType(v10_1.ApplicationCommandType.Message),
    long_description: 'Edit a poll that you have created, as a message context command.',
    async execute(interaction) {
        if (!interaction.isMessageContextMenuCommand())
            return;
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        const thisId = await interaction.fetchReply().then(m => m.id);
        const id = interaction.targetId;
        const pollInfo = await exports.poll.cache.get(id, poll_privates.deserialize);
        // Cache outdated, ignore
        if (!pollInfo) {
            return interaction.deleteReply();
        }
        else if (pollInfo.uid !== interaction.user.id) {
            return interaction.editReply({
                content: 'You are not the owner of this poll!',
            }).then(Utils.VOID);
        }
        // Create a new edit dialog, and make it expire in 24 hours.
        await exports.poll.cache.set(thisId, pollInfo, Utils.date_after_hours(24));
        const retval = await poll_privates.getPollEditor(thisId);
        await interaction.editReply(retval);
    },
});
exports.poll_end = new commands_1.ContextCommand({
    data: new discord_js_1.ContextMenuCommandBuilder()
        .setName('End Poll')
        .setType(v10_1.ApplicationCommandType.Message),
    long_description: 'End a poll that you have created, as a message context command.',
    async execute(interaction) {
        if (!interaction.isMessageContextMenuCommand())
            return;
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        const id = interaction.targetId;
        const pollInfo = await exports.poll.cache.get(id, poll_privates.deserialize);
        // Cache outdated, ignore
        if (!pollInfo) {
            return interaction.deleteReply();
        }
        pollInfo.expires = new Date();
        await exports.poll.cache.set(id, pollInfo);
        const { embeds } = await poll_privates.getPoll(interaction.client, id);
        await interaction.targetMessage.edit({ embeds, components: [] });
        return interaction.deleteReply();
    },
});
//# sourceMappingURL=fun_commands.js.map