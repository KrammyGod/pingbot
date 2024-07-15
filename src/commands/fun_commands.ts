import config from '@config';
import * as DB from '@modules/database';
import * as Hoyo from '@modules/hoyolab';
import * as Utils from '@modules/utils';
import { parseDate } from 'chrono-node';
import {
    ActionRowBuilder,
    ApplicationCommandType,
    ButtonBuilder,
    ButtonStyle,
    ChannelSelectMenuBuilder,
    ChannelSelectMenuInteraction,
    ChannelType,
    Client,
    Colors,
    ComponentType,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    Message,
    ModalBuilder,
    NewsChannel,
    OAuth2Scopes,
    PermissionsBitField,
    RepliableInteraction,
    Serialized,
    SlashCommandBuilder,
    TextChannel,
    TextInputBuilder,
    TextInputStyle,
} from 'discord.js';
import { ContextCommand, SlashCommandNoSubcommand } from '@classes/commands';

export const name = 'Fun';
export const desc = 'This category contains all the commands for fun, or are informational.';

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
export const count = new SlashCommandNoSubcommand<{ amt: number }>({
    data: new SlashCommandBuilder()
        .setName('count')
        .setDescription('Count me, because why not?'),

    long_description:
        'Count how many times you wasted on this command!\n\n' +
        'Usage: `/count`',

    async execute(interaction) {
        const id = interaction.user.id;
        await interaction.deferReply({ ephemeral: true });
        let cache = await this.cache.get(id);
        if (!cache) cache = { amt: 0 };
        cache.amt++;
        await this.cache.set(id, cache);
        const image = images[Math.floor(Math.random() * images.length)];
        await interaction.editReply({
            content: `Hey there, its been ${cache.amt} times already...\nTake this....`,
            embeds: [new EmbedBuilder().setImage(image).setColor('Random')],
        });
    },
});

const invite_docs =
    `Get the invite link for the bot. 
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

export const invite = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get the invite link for me! (See /help command: invite)'),

    long_description: invite_docs,

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        // Generated via discord's helper with the above permissions.
        const permissions = '1512670883152';
        const url = interaction.client.generateInvite({
            permissions: permissions,
            scopes: [OAuth2Scopes.Bot, OAuth2Scopes.ApplicationsCommands],
        });
        await interaction.editReply({
            content: `Hey there, here's the [invite link](${url}) for the bot!\n` +
                'Please do not forget to use `/help command: invite` to verify permissions required!',
        });
    },
});

export const support = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('support')
        .setDescription('Join the support server!'),

    long_description:
        'Join a server to hang out and bond with others over your favourite waifus!' +
        '~~And get bot support if needed.~~\n' +
        'Usage: `/support`',

    async execute(interaction) {
        const invite_code = 'BKAWvgVZtN';
        await interaction.deferReply({ ephemeral: true });
        // While we can get guild from fetching, it breaks the point of sharding
        // Maybe guild is unobtainable from fetching...?
        const invite_link = await Utils.fetch_guild_cache(interaction.client, config.guild, (guild, invite_code) => {
            return guild?.invites.fetch(invite_code).then(invite => invite.url);
        }, invite_code);
        // Constant non-expiring invite
        const link = invite_link ?? `https://discord.gg/${invite_code}`;
        await interaction.editReply({
            content: `Hey there, here's the [invite link](${link}) for the support server!\n`,
        });
    },
});

export const getid = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('getid')
        .addStringOption(option =>
            option
                .setName('user')
                .setDescription("The user's name to get the ID of")
                .setRequired(true))
        .setDescription('Get the discord ID of a user'),

    long_description:
        'Get the discord ID of a user, so you can use it for all the anime commands!\n' +
        'You can search for partial matches too!\n\n' +
        'Usage: `/getid user: <username>`\n\n' +
        '__**Options**__\n' +
        '*username:* The name of the user you would like to search for. (Required)\n\n' +
        'Examples: `/getid user: Krammy`, `/getid user: @Krammy`',

    async execute(interaction) {
        let query = interaction.options.getString('user')!;
        if (!query.startsWith('@')) {
            query = `@${query}`;
        }
        const users = await interaction.client.shard?.broadcastEval(
            (client, query) => {
                const u = client.users.cache.filter(u =>
                    u.displayName.toLowerCase().includes(query) ||
                    u.tag.toLowerCase().includes(query),
                );
                return u.map(u => ({ name: `@${u.username}`, id: u.id }));
            }, { context: query },
        ).then(results => results.flat()) ?? [];
        const res = await Utils.get_results(interaction, users, {
            title_fmt: n => `Found ${n} users:`,
            desc_fmt: u => `${u.name}`,
            sel_fmt: u => `**${u.name}**`,
        });
        if (res === null) {
            return interaction.deleteReply();
        } else if (!res) {
            await interaction.editReply({ content: `No users found with name ${query}!` });
        } else {
            await interaction.editReply({ content: `${res.name}'s ID is \`${res.id}\`` });
        }
    },
});

const all_collector_docs =
    `Edit your entries in the auto-collect system.
Essentially, the bot will automatically collect hoyolab dailies for you!
Visit https://tinyurl.com/ayakacookiegist for help extracting your cookie.
Furthermore, it will by default send you a message everyday when it collects with crucial information.
You can disable this by clicking the notify button.\n
__DISCLAIMER:__
Yes, giving out the cookie is a bad idea if you are scared of being hacked.
Only use this if you trust me...\n\n`;

const all_collector_buttons = [
    new ButtonBuilder({
        emoji: '🔔',
        style: ButtonStyle.Primary,
    }),
    new ButtonBuilder({
        emoji: '🔕',
        style: ButtonStyle.Secondary,
    }),
    new ButtonBuilder({
        emoji: '✖️',
        style: ButtonStyle.Danger,
    }),
];
type HoyoStrings = 'HI3' | 'GI' | 'HSR';

function get_collector_buttons(cmd_name: string, hoyo: HoyoStrings[], idx: string) {
    const rows = [];
    for (const name of hoyo) {
        const buttons = [];
        let suffix = '';
        if (name === 'HI3') {
            suffix = 'h';
        } else if (name === 'GI') {
            suffix = 'g';
        } else {
            suffix = 's';
        }
        buttons.push(ButtonBuilder.from(all_collector_buttons[0]).setLabel(name).setCustomId(
            `${cmd_name}/0/n${suffix}/${idx}`,
        ));
        buttons.push(ButtonBuilder.from(all_collector_buttons[1]).setLabel(name).setCustomId(
            `${cmd_name}/0/c${suffix}/${idx}`,
        ));
        buttons.push(ButtonBuilder.from(all_collector_buttons[2]).setLabel(name).setCustomId(
            `${cmd_name}/0/d${suffix}/${idx}`,
        ));
        rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons));
    }
    return rows;
}

const hoyolab_privates = {
    input: new ModalBuilder({
        title: 'Add to auto-collector',
        customId: 'hoyolab',
        components: [
            new ActionRowBuilder<TextInputBuilder>({
                components: [
                    new TextInputBuilder({
                        label: 'Cookie',
                        customId: 'cookie',
                        placeholder: 'Enter your hoyolab cookie here.',
                        style: TextInputStyle.Short,
                        required: true,
                    }),
                ],
            }),
        ],
    }),

    async delete(interaction: RepliableInteraction, id: string, name: string) {
        const buttons = [
            new ButtonBuilder({
                label: 'Yes!',
                emoji: '🚮',
                customId: 'hconfirm',
                style: ButtonStyle.Danger,
            }),
            new ButtonBuilder({
                label: 'No',
                customId: 'hcancel',
                style: ButtonStyle.Secondary,
            }),
        ];
        const message = await interaction.followUp({
            content: '# Are you sure you want to delete this account?',
            components: [
                new ActionRowBuilder<ButtonBuilder>({
                    components: buttons,
                }),
            ],
            ephemeral: true,
        });

        const confirmed = await message.awaitMessageComponent({
            componentType: ComponentType.Button,
            time: 10 * 60 * 1000, // 10 mins before interaction expires
        }).then(i => {
            if (i.customId === 'hcancel') return;
            return true;
        }).catch(() => undefined);
        await Utils.delete_ephemeral_message(interaction, message);
        if (!confirmed) return;

        const res = await DB.deleteCookie(interaction.user.id, id);
        if (!res) {
            return interaction.followUp({
                content: 'Failed to delete cookie, the embed is out of date!\n' +
                    'Please make sure to only use this command once!',
                ephemeral: true,
            }).then(Utils.VOID);
        }
        const retval = await hoyolab_privates.getAccount(interaction, 1, name);
        await interaction.editReply(retval);
        return interaction.followUp({
            content: 'Successfully deleted cookie!',
            ephemeral: true,
        }).then(Utils.VOID);
    },

    async getAccount(interaction: RepliableInteraction, pageOrIdx: number | string, name: string) {
        const max_pages = await DB.fetchAutocollectLength(interaction.user.id);
        let account;
        // If there exists an account, and we're getting a page #
        if (typeof pageOrIdx === 'number' && max_pages !== 0) {
            if (pageOrIdx < 1) pageOrIdx = 1;
            else if (pageOrIdx > max_pages) pageOrIdx = max_pages;
            account = await DB.fetchAutocollectByPage(interaction.user.id, pageOrIdx - 1);
        } else if (typeof pageOrIdx === 'string') {
            account = await DB.fetchAutocollectByIdx(interaction.user.id, pageOrIdx);
        }
        const page = parseInt(account?.page ?? '0');

        const embed = new EmbedBuilder({
            title: 'Hoyolab Autocollect Details',
            color: Colors.Gold,
        });
        const components = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder({
                    label: 'Add New',
                    emoji: '➕',
                    customId: 'hoyolab/0/add',
                    style: ButtonStyle.Primary,
                }),
                new ButtonBuilder({
                    label: 'Delete',
                    emoji: '✖️',
                    customId: `hoyolab/0/delete/${account?.idx}`,
                    style: ButtonStyle.Danger,
                }),
                new ButtonBuilder({
                    label: 'Help',
                    emoji: '❓',
                    style: ButtonStyle.Link,
                    url: 'https://gist.github.com/KrammyGod/bca6eb7d424064517d779a5e449d4586',
                }),
            ),
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder({
                    label: 'Previous',
                    emoji: '⬅️',
                    style: ButtonStyle.Primary,
                    customId: `hoyolab/0/${page - 1}`,
                    disabled: !account || page === 1,
                }),
                new ButtonBuilder({
                    label: 'Next',
                    emoji: '➡️',
                    style: ButtonStyle.Primary,
                    customId: `hoyolab/0/${page + 1}`,
                    disabled: !account || page === max_pages,
                }),
            ),
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

        function getStatus(notifyStatus: string | undefined) {
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
        components.push(...get_collector_buttons(name, Object.keys(games) as HoyoStrings[], account.idx));
        return { embeds: [embed], components };
    },

    async toggleNotify(interaction: RepliableInteraction, type: string, g: string, idx: string) {
        let game: 'honkai' | 'genshin' | 'star_rail' | undefined;
        let toggle: 'none' | 'checkin' | 'notify' | undefined;
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
        return DB.toggleAutocollect(interaction.user.id, game!, toggle!, idx);
    },
};
export const hoyolab = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
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
                ephemeral: true,
            }).then(Utils.VOID);
        }
        const res = await DB.addCookie(interaction.user.id, cookie);
        if (!res) {
            return interaction.followUp({
                content: 'Failed to add account to autocollector.\nEither you reached the max of 5 accounts, ' +
                    'or you are entering a duplicate cookie.',
                ephemeral: true,
            }).then(Utils.VOID);
        }
        // Adding new account always brings user to first page to properly reload everything.
        const retval = await hoyolab_privates.getAccount(interaction, 1, this.data.name);
        await interaction.editReply(retval);
        await interaction.followUp({
            content: 'Successfully added account to autocollector!',
            ephemeral: true,
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
        } else if (action === 'delete') {
            return hoyolab_privates.delete(interaction, id, this.data.name);
        }
        // Reached here means it is some sort of toggle.
        await hoyolab_privates.toggleNotify(interaction, action[0], action[1], id);
        const retval = await hoyolab_privates.getAccount(interaction, id, this.data.name);
        await interaction.editReply(retval);
    },

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
        const retval = await hoyolab_privates.getAccount(interaction, 1, this.data.name);
        await interaction.editReply(retval);
    },
});

const poll_privates = {
    async getPollEditor(id: string) {
        const pollInfo = await poll.cache.get(id);
        let desc = '';
        desc += `**Poll Title:**\n${pollInfo!.title || '*(empty)*'}\n\n`;
        desc += `**Destination Channel:**\n<#${pollInfo!.cid}>\n\n`;
        desc += '**Choices:**\n';
        for (const [i, choice] of pollInfo!.choices.entries()) {
            desc += `**${i + 1}.** ${choice.name}\n`;
        }
        if (pollInfo!.choices.length === 0) {
            desc += '*(empty)*\n';
        }
        desc += '\n**Expires:**\n';
        if (pollInfo!.expires) {
            desc += Utils.timestamp(new Date(pollInfo!.expires));
        } else {
            desc += '*(never)*';
        }
        const embed = new EmbedBuilder({
            title: 'Poll Editor',
            color: Colors.Gold,
            description: desc,
        });
        const components = [
            new ActionRowBuilder<ButtonBuilder>().addComponents(
                new ButtonBuilder({
                    label: 'Edit Title',
                    emoji: '📝',
                    customId: 'poll/0/title',
                    style: ButtonStyle.Primary,
                }),
                new ButtonBuilder({
                    label: 'Edit Choices',
                    emoji: '✏️',
                    customId: 'poll/0/add',
                    style: ButtonStyle.Primary,
                }),
                new ButtonBuilder({
                    label: 'Edit Expiry',
                    emoji: '⏱️',
                    customId: 'poll/0/expiry',
                    style: ButtonStyle.Primary,
                }),
                new ButtonBuilder({
                    label: 'Send',
                    emoji: '📨',
                    customId: 'poll/0/send',
                    style: ButtonStyle.Success,
                    disabled: pollInfo!.choices.length === 0 || pollInfo!.title === '',
                }),
            ),
            new ActionRowBuilder<ChannelSelectMenuBuilder>().addComponents(
                new ChannelSelectMenuBuilder({
                    customId: 'poll/0/channel',
                    maxValues: 1,
                    minValues: 1,
                    placeholder: 'Click to change the destination channel.',
                    channelTypes: [ChannelType.GuildText, ChannelType.GuildAnnouncement],
                }),
            ),
        ];
        return { embeds: [embed], components };
    },

    async getPoll(client: Client, id: string) {
        const pollInfo = await poll.cache.get(id);
        const user = await Utils.fetch_user_fast(client, pollInfo!.uid, u => {
            return u ? { name: u.displayName, avatar: u.displayAvatarURL() } : undefined;
        });
        let desc = '';
        if (pollInfo!.expires) {
            if (new Date >= new Date(pollInfo!.expires)) {
                pollInfo!.title = `(ENDED) ${pollInfo!.title}`;
                desc += `**This poll has ended on ${Utils.timestamp(new Date())}**\n\n`;
                await poll.cache.delete(id); // Remove from cache
            } else {
                desc += `**This poll expires on ${Utils.timestamp(new Date(pollInfo!.expires))}**\n\n`;
            }
        }
        const buttons = [];
        for (const [i, choice] of pollInfo!.choices.entries()) {
            desc += `**${i + 1}.** ${choice.name}\n`;
            for (const user of choice.users) {
                desc += `<@${user}>\n`;
            }
            if (choice.users.length === 1) {
                desc += '*(1 vote)*\n\n';
            } else {
                desc += `*(${choice.users.length} votes)*\n\n`;
            }
            let label = choice.name;
            if (choice.name.length > 80) {
                label = `Choice ${i + 1}`;
            }
            buttons.push(new ButtonBuilder({
                label,
                customId: `poll/0/${i}`,
                style: ButtonStyle.Primary,
            }));
        }
        const components = [];
        while (buttons.length > 0) {
            components.push(new ActionRowBuilder<ButtonBuilder>({ components: buttons.splice(0, 5) }));
        }
        const embed = new EmbedBuilder({
            title: pollInfo!.title,
            description: desc,
            color: Colors.Gold,
        }).setAuthor({ name: `${user!.name} started a poll`, iconURL: user!.avatar });
        return { embeds: [embed], components };
    },

    deserialize(pollInfoSerialized: Serialized<PollObject>) {
        return {
            ...pollInfoSerialized,
            expires: pollInfoSerialized.expires ? new Date(pollInfoSerialized.expires) : undefined,
        };
    },
};
type PollObject = {
    uid: string; // User ID
    cid: string; // Channel ID
    mid?: string; // Message ID (for editing)
    title: string;
    choices: { name: string, users: string[] }[];
    expires?: Date;
};
export const poll = new SlashCommandNoSubcommand<PollObject>({
    data: new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Start a poll for users to vote on.')
        .setDMPermission(false),

    long_description:
        'Start a poll that allows users to vote for a choice!\n' +
        'The maximum number of options is 25.\n\n' +
        'Usage: `/poll`',

    async textInput(interaction) {
        await interaction.deferUpdate();
        const action = interaction.customId.split('/')[1];

        let pollInfo = await this.cache.get(interaction.message!.id, poll_privates.deserialize);
        // Somehow lost cache, delete poll
        if (!pollInfo) return interaction.message?.delete().then(Utils.VOID, Utils.VOID);
        // Not sure why this is needed, maybe to get the most up to date?
        if (pollInfo.mid) {
            pollInfo = await this.cache.get(pollInfo.mid, poll_privates.deserialize) ?? pollInfo;
        }
        if (action === 'title') {
            pollInfo.title = interaction.fields.getTextInputValue('title');
        } else if (action === 'add') {
            const c = interaction.fields.getTextInputValue('choice');
            const choices = c.trim().split('\n').map(x => x.trim()).filter(x => x !== '');
            if (!choices.length) {
                return interaction.followUp({
                    content: 'You must provide at least one choice.', ephemeral: true,
                }).then(Utils.VOID);
            } else if (choices.length > 25) {
                return interaction.followUp({
                    content: 'You cannot provide more than 25 choices.', ephemeral: true,
                }).then(Utils.VOID);
            } else if (new Set(choices).size !== choices.length) {
                return interaction.followUp({
                    content: 'All choices must be unique.', ephemeral: true,
                }).then(Utils.VOID);
            }
            pollInfo.choices = choices.map(c => {
                const prevChoice = pollInfo!.choices.find(x => x.name === c);
                return prevChoice ?? { name: c, users: [] };
            });
        } else if (action === 'expiry') {
            const expiry = interaction.fields.getTextInputValue('expiry');
            if (expiry) {
                const date = parseDate(expiry) as Date | null;
                if (!date) {
                    return interaction.followUp({
                        content: `\`${expiry}\` is not a valid date/relative time!`,
                        ephemeral: true,
                    }).then(Utils.VOID);
                } else if (new Date() >= date) {
                    return interaction.followUp({
                        content: `${Utils.timestamp(date)} is in the past!`,
                        ephemeral: true,
                    }).then(Utils.VOID);
                }
                pollInfo.expires = date;
            } else {
                pollInfo.expires = undefined;
            }
        } else {
            throw new Error(`Invalid action ${action}!`);
        }
        await this.cache.set(interaction.message!.id, pollInfo);
        const retval = await poll_privates.getPollEditor(interaction.message!.id);
        await interaction.editReply(retval);
    },

    async buttonReact(interaction) {
        const action = interaction.customId.split('/')[2];
        const pollInfo = await this.cache.get(interaction.message.id, poll_privates.deserialize);
        if (!pollInfo) return interaction.message.delete().then(Utils.VOID, Utils.VOID); // Somehow lost cache
        const idx = parseInt(action);
        if (isNaN(idx)) {
            const send = async () => {
                await interaction.deferUpdate();
                const channel = await interaction.client.channels.fetch(pollInfo.cid) as TextChannel;
                const { embeds, components } = await poll_privates.getPoll(interaction.client, interaction.message.id);
                let message: Message | undefined;
                if (pollInfo.mid) {
                    // This means that we are editing the poll.
                    message = await channel.messages.fetch(pollInfo.mid).catch(() => undefined);
                    if (message) {
                        await message.edit({ embeds, components });
                    } else {
                        message = await channel.send({ embeds, components });
                    }
                    // Also delete from cache and remove editing capability.
                    await this.cache.delete(interaction.message.id);
                    await interaction.deleteReply().catch(() => {
                        // If we can't delete the reply, we can't delete the original message either.
                        // So we just edit it to remove the buttons.
                        return interaction.message.edit({ embeds, components: [] }).then(Utils.VOID, Utils.VOID);
                    });
                } else {
                    message = await channel.send({ embeds, components });
                    await interaction.followUp({
                        content: 'Successfully sent poll! You may now close this dialog.',
                        ephemeral: true,
                    });
                }
                await this.cache.delete(pollInfo.mid); // Remove old poll from cache
                pollInfo.mid = message.id;
                await this.cache.set(message.id, pollInfo);
            };

            const input = new ModalBuilder();
            switch (action) {
            case 'title':
                input.setTitle('Edit Poll Title')
                    .setCustomId('poll/title')
                    .addComponents(
                        new ActionRowBuilder({
                            components: [
                                new TextInputBuilder({
                                    label: 'Set New Title',
                                    customId: 'title',
                                    placeholder: 'Enter the new title here.',
                                    style: TextInputStyle.Short,
                                    required: true,
                                }),
                            ],
                        }),
                    );
                return interaction.showModal(input);
            case 'add':
                input.setTitle('Edit Poll Choices')
                    .setCustomId('poll/add')
                    .addComponents(
                        new ActionRowBuilder({
                            components: [
                                new TextInputBuilder({
                                    label: 'Add New Choices',
                                    customId: 'choice',
                                    value: pollInfo.choices.map(
                                        c => c.name).join('\n'),
                                    placeholder: 'Enter choices here, separated by newlines.',
                                    style: TextInputStyle.Paragraph,
                                    required: true,
                                }),
                            ],
                        }),
                    );
                return interaction.showModal(input);
            case 'expiry':
                input.setTitle('Edit Poll Expiry')
                    .setCustomId('poll/expiry')
                    .addComponents(
                        new ActionRowBuilder({
                            components: [
                                new TextInputBuilder({
                                    label: 'Set New Expiry (Leave blank to remove)',
                                    customId: 'expiry',
                                    value: pollInfo.expires ?
                                        new Date(pollInfo.expires).toUTCString() :
                                        '',
                                    placeholder: 'Enter the date/relative time in UTC/GMT.',
                                    style: TextInputStyle.Short,
                                    required: false,
                                }),
                            ],
                        }),
                    );
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
        if (!choice) throw new Error('Choice out of bounds!');
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
        if (!pollInfo) return interaction.message.delete().then(Utils.VOID, Utils.VOID); // Somehow lost cache
        const channel = (interaction as ChannelSelectMenuInteraction).channels.first() as TextChannel | NewsChannel;
        if (!channel.permissionsFor(interaction.user.id)!.has(PermissionsBitField.Flags.SendMessages)) {
            return interaction.followUp({
                content: `You don't have permissions to send messages in ${channel}.`,
                ephemeral: true,
            }).then(Utils.VOID);
        } else if (!channel.permissionsFor(interaction.client.user.id)!.has(PermissionsBitField.Flags.SendMessages)) {
            return interaction.followUp({
                content: `I don't have permissions to send messages in ${channel}.`,
                ephemeral: true,
            }).then(Utils.VOID);
        }

        pollInfo.cid = channel.id;
        await this.cache.set(interaction.message.id, pollInfo);
        const retval = await poll_privates.getPollEditor(interaction.message.id);
        await interaction.editReply(retval);
    },

    async execute(interaction) {
        await interaction.deferReply({ ephemeral: true });
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

export const poll_edit = new ContextCommand({
    data: new ContextMenuCommandBuilder()
        .setName('Edit Poll')
        .setType(ApplicationCommandType.Message),

    long_description: 'Edit a poll that you have created, as a message context command.',

    async execute(interaction) {
        if (!interaction.isMessageContextMenuCommand()) return;
        await interaction.deferReply({ ephemeral: true });
        const thisId = await interaction.fetchReply().then(m => m.id);
        const id = interaction.targetId;
        const pollInfo = await poll.cache.get(id, poll_privates.deserialize);
        // Cache outdated, ignore
        if (!pollInfo) {
            return interaction.deleteReply();
        } else if (pollInfo.uid !== interaction.user.id) {
            return interaction.editReply({
                content: 'You are not the owner of this poll!',
            }).then(Utils.VOID);
        }
        // Create a new edit dialog, and make it expire in 24 hours.
        await poll.cache.set(thisId, pollInfo, Utils.date_after_hours(24));
        const retval = await poll_privates.getPollEditor(thisId);
        await interaction.editReply(retval);
    },
});

export const poll_end = new ContextCommand({
    data: new ContextMenuCommandBuilder()
        .setName('End Poll')
        .setType(ApplicationCommandType.Message),

    long_description: 'End a poll that you have created, as a message context command.',

    async execute(interaction) {
        if (!interaction.isMessageContextMenuCommand()) return;
        await interaction.deferReply({ ephemeral: true });
        const id = interaction.targetId;
        const pollInfo = await poll.cache.get(id, poll_privates.deserialize);
        // Cache outdated, ignore
        if (!pollInfo) {
            return interaction.deleteReply();
        }
        pollInfo.expires = new Date();
        await poll.cache.set(id, pollInfo);
        const { embeds } = await poll_privates.getPoll(interaction.client, id);
        await interaction.targetMessage.edit({ embeds, components: [] });
        return interaction.deleteReply();
    },
});
