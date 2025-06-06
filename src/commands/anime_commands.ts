import fs from 'fs';
import config from '@config';
import * as DB from '@modules/database';
import * as Utils from '@modules/utils';
import { getRawImageLink } from '@modules/scraper';
import { getImage, uploadToCDN } from '@modules/cdn';
import {
    ActionRowBuilder,
    AnySelectMenuInteraction,
    ButtonBuilder,
    ButtonInteraction,
    ButtonStyle,
    ChatInputCommandInteraction,
    Client,
    Colors,
    ComponentType,
    ContextMenuCommandBuilder,
    EmbedBuilder,
    GuildTextBasedChannel,
    InteractionReplyOptions,
    MessageFlags,
    ModalBuilder,
    ModalSubmitInteraction,
    RepliableInteraction,
    SlashCommandBuilder,
    StringSelectMenuBuilder,
    TextBasedChannel,
    TextInputBuilder,
    TextInputStyle,
    User,
} from 'discord.js';
import { ApplicationCommandType } from 'discord-api-types/v10';
import type { NodePgJsonSerialized } from '@typings/serialize';
import { ContextCommand, SlashCommandNoSubcommand } from '@classes/commands';

export const name = 'Animes/Gacha';
export const desc = 'This category is for commands that deal with the character gacha.';

const NO_NUM = -1;
const submission_log_id = config.submit!;
const new_characters_log_id = config.chars!;
const GLOBAL_BUTTONS = [
    new ButtonBuilder()
        .setEmoji('⏪')
        .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
        .setEmoji('⬅️')
        .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
        .setEmoji('➡️')
        .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
        .setEmoji('⏩')
        .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
        .setEmoji('❓')
        .setStyle(ButtonStyle.Secondary),
];
const GLOBAL_BUTTONS2 = [
    new ButtonBuilder()
        .setEmoji('📄')
        .setStyle(ButtonStyle.Primary),
];

function getGlobalButtons() {
    return GLOBAL_BUTTONS.map(b => ButtonBuilder.from(b));
}

function getGlobalButtons2() {
    return GLOBAL_BUTTONS2.map(b => ButtonBuilder.from(b));
}

const GLOBAL_HELP =
    `
⏪: First page
⬅️: Previous page
➡️: Next page
⏩: Last page
❓: This help message
📄: Jump to page
`;

// Global helper for searching for waifus using name
async function search_waifu(
    interaction: RepliableInteraction,
    name: string,
) {
    // Search waifu by name
    const res = await DB.searchWaifuByName(name);
    if (!res.length) return undefined;
    return Utils.get_results(
        interaction, res,
        {
            title_fmt: (idx: number) => `Found ${idx} waifus. Please select one:`,
            desc_fmt: choice => `⭐ **${choice.name}** from *${choice.origin}*`,
            sel_fmt: choice => `⭐ ${choice.name}`,
        },
    );
}

// Global helper for searching for user characters using number/name
async function search_character(
    interaction: RepliableInteraction,
    userID: string,
    number_or_name: string,
    high: boolean,
) {
    // Search waifu by number
    const idx = parseInt(number_or_name);
    if (!isNaN(idx)) {
        if (idx < 1) return NO_NUM;
        const res = high ?
            await DB.fetchUserHighCharactersList(userID, idx).catch(() => undefined) :
            await DB.fetchUserCharactersList(userID, idx).catch(() => undefined);
        return res?.at(0);
    }
    // Search waifu by name
    const res = high ?
        await DB.queryUserHighCharacter(userID, number_or_name) :
        await DB.queryUserCharacter(userID, number_or_name);
    if (!res.length) return undefined;
    return Utils.get_results(
        interaction, res,
        {
            title_fmt: (idx: number) =>
                `Found ${idx} characters in ` +
                `${interaction.user.id === (userID) ? 'your' : 'their'} ` +
                'list. Please select one:',
            desc_fmt: choice =>
                `${choice.getWFC(interaction.channel!)} ` +
                `**${choice.name}** from *${choice.origin}*`,
            sel_fmt: choice => `${choice.getWFC(interaction.channel!)} ${choice.name}`,
        },
    );
}

// Simple function to calculate how many pages there are if there are 10 items per page.
function totalPages(pages: number) {
    return Math.floor(pages / 10) + (pages % 10 ? 1 : 0);
}

function getPage(idx: number) {
    return Math.floor(idx / 10) + (idx % 10 ? 1 : 0);
}

function getStart(page: number) {
    return (page - 1) * 10 + 1;
}

type HelperRetVal = InteractionReplyOptions & { followUp?: InteractionReplyOptions };

async function collect_anime(userID: string, anime: string) {
    const completed = await DB.getCompleted(userID, anime);
    const cnt = await DB.fetchUserAnimeCount(userID, anime);
    const gain = (cnt - (completed ?? 0)) * 100;
    if (!gain) return 0;
    await DB.setCompleted(userID, anime, cnt);
    await DB.addBrons(userID, gain);
    return gain;
}

const animes_privates = {
    async getPage(authorID: string, target: User, page: number) {
        const max_pages = totalPages(await DB.getAnimesCount());

        const embed = new EmbedBuilder({
            title: 'All anime listing:',
            footer: { text: `Viewing User: @${target.tag}` },
        }).setColor('Random').setThumbnail(target.displayAvatarURL());
        // This represents any followup messages that should be sent
        const followUp: {
            embeds: EmbedBuilder[],
            flags: MessageFlags.Ephemeral
        } = {
            embeds: [],
            flags: MessageFlags.Ephemeral,
        };
        if (max_pages === 0) {
            embed.setDescription(`Page 0/${max_pages}`).setFields({
                name: '**No Users found. :(**',
                value: "Why don't you start rolling today?",
            });
            return { embeds: [embed] };
        } else if (page < 1) {
            const error_embed = new EmbedBuilder({
                title: 'Please enter a positive number.',
                color: Colors.Red,
            });
            followUp.embeds.push(error_embed);
            page = 1;
        } else if (page > max_pages) {
            const error_embed = new EmbedBuilder({
                title: `Too high. Max page: ${max_pages}`,
                color: Colors.Red,
            });
            followUp.embeds.push(error_embed);
            page = max_pages;
        }

        embed.setDescription(`Page ${page}/${max_pages}`);
        const start = (page - 1) * 10;
        const menu = new StringSelectMenuBuilder()
            .setPlaceholder(authorID === target.id ? 'No bonuses.' : 'Not your list.')
            .setDisabled(true)
            .setCustomId(`animes/${authorID}/${page}`)
            .setMinValues(1)
            .addOptions({ label: 'None.', value: 'none' });
        let field = '';
        let options = 0;
        const completed = await DB.getAllCompleted(target.id);
        const allAnimes = await DB.getAnimes(start);
        for (const [i, anime] of allAnimes.entries()) {
            const user_count = await DB.fetchUserAnimeCount(target.id, anime.origin);
            if (user_count === anime.count) {
                if (completed.get(anime.origin) === anime.count) {
                    field += '✅ ';
                } else {
                    field += '✳️ ';
                    if (authorID === target.id) {
                        const total_gain = (anime.count - (completed.get(anime.origin) ?? 0)) * 100;
                        // Add if there exists an uncollected series.
                        menu.setPlaceholder('Click me to claim bonuses!')
                            .addOptions({
                                label: `${start + i + 1}. ${anime.origin}`,
                                value: `${anime.origin}`,
                                emoji: '✳️',
                                description: `Total gain: +${total_gain} brons.`,
                            });
                        ++options;
                    }
                }
            } else {
                field += '🟩 ';
            }
            field += `${start + i + 1}. **${anime.origin}** *(${user_count}/${anime.count})*\n`;
        }

        // Add as field if possible
        if (field.length <= 1024) {
            embed.addFields({
                name: `Listing ${authorID === target.id ? 'your' : "someone's"} animes ` +
                    `${start + 1}-${start + allAnimes.length}:`,
                value: field,
            });
            // Otherwise add as description
        } else {
            embed.setDescription(
                `${embed.data.description}\n\n**Listing ` +
                `${authorID === target.id ? 'your' : "someone's"} animes ` +
                `${start + 1}-${start + allAnimes.length}:**\n${field}`,
            );
        }

        if (options > 0) {
            // Delete "None" option if there are other options
            menu.spliceOptions(0, 1).setMaxValues(options).setDisabled(false);
        }

        // These buttons are specialized per user/page
        const buttons = getGlobalButtons();
        const buttons2 = getGlobalButtons2();
        buttons[0].setCustomId(`animes/${authorID}/1/${target.id}`);
        buttons[1].setCustomId(`animes/${authorID}/${page - 1}/${target.id}/`);
        buttons[2].setCustomId(`animes/${authorID}/${page + 1}/${target.id}/`);
        buttons[3].setCustomId(`animes/${authorID}/${max_pages}/${target.id}//`); // Required for unique id
        buttons[4].setCustomId(`animes/${authorID}/help`);
        buttons2[0].setCustomId(`animes/${authorID}/input/${target.id}`);
        if (page === 1) {
            buttons[0].setDisabled(true);
            buttons[1].setDisabled(true);
        }
        if (page === max_pages) {
            buttons[2].setDisabled(true);
            buttons[3].setDisabled(true);
        }
        // Return the proper object to update
        const retval: HelperRetVal = {
            embeds: [embed],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
                new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons2),
                new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
            ],
        };
        if (followUp.embeds.length > 0) {
            retval.followUp = followUp;
        }
        return retval;
    },
};
export const animes = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('animes')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('The page number to jump to. (Default: 1)')
                .setMinValue(1))
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to view. (Default: You)'))
        .setDescription('Find all available anime series.'),

    long_description:
        'Show all anime available in the custom database.\n\n' +
        'Usage: `/animes page: [page] user: [user]`\n\n' +
        '__**Options:**__\n' +
        '*page:* The page number to jump to. (Default: 1)\n' +
        "*user:* Check a different user's list. (Default: You)\n\n" +
        'Examples: `/animes page: 2` `/animes page: 5 user: @krammygod`',

    async textInput(interaction) {
        const [userID] = interaction.customId.split('/').splice(1);
        const value = interaction.fields.getTextInputValue('value');

        await interaction.deferUpdate();
        const user = await interaction.client.users.fetch(userID).catch(() => null);
        if (!user) return interaction.deleteReply().then(Utils.VOID);
        const page = parseInt(value);
        if (isNaN(page)) {
            return interaction.followUp({
                content: 'Invalid page number.',
                flags: MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        const { embeds, components, followUp } = await animes_privates.getPage(interaction.user.id, user, page);
        await interaction.editReply({ embeds, components });
        if (followUp) await interaction.followUp(followUp);
    },

    async buttonReact(interaction) {
        const [page, userID] = interaction.customId.split('/').splice(2);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const input = new ModalBuilder({
                    title: 'Jump to page',
                    customId: `animes/${userID}`,
                    components: [
                        new ActionRowBuilder<TextInputBuilder>({
                            components: [
                                new TextInputBuilder({
                                    label: 'Page #',
                                    customId: 'value',
                                    placeholder: 'Enter the page number to jump to...',
                                    style: TextInputStyle.Short,
                                    maxLength: 100,
                                    required: true,
                                }),
                            ],
                        }),
                    ],
                });
                return interaction.showModal(input);
            } else if (page === 'help') {
                return interaction.reply({ content: GLOBAL_HELP, flags: MessageFlags.Ephemeral }).then(Utils.VOID);
            } else {
                throw new Error(`Button type: ${page} not found.`);
            }
        }
        await interaction.deferUpdate();
        const user = await interaction.client.users.fetch(userID).catch(() => null);
        if (!user) return interaction.deleteReply().then(Utils.VOID);
        const { embeds, components } = await animes_privates.getPage(interaction.user.id, user, parseInt(page));
        await interaction.editReply({ embeds, components });
    },

    async menuReact(interaction) {
        await interaction.deferUpdate();
        const [userID, page] = interaction.customId.split('/').splice(1);
        let gain = 0;
        for (const anime of interaction.values) {
            gain += await collect_anime(userID, anime);
        }
        const user = await interaction.client.users.fetch(userID).catch(() => null);
        if (!user) return interaction.deleteReply();
        const { embeds, components } = await animes_privates.getPage(interaction.user.id, user, parseInt(page));
        await interaction.editReply({ embeds, components });
        if (gain) {
            await interaction.followUp({
                content: `You collected bonuses for ${interaction.values.length} anime(s), ` +
                    `and gained +${gain} ${interaction.client.bot_emojis.brons}!`,
                flags: MessageFlags.Ephemeral,
            }).catch(Utils.VOID);
        }
    },

    async execute(interaction) {
        const page = interaction.options.getInteger('page') ?? 1;
        const user = interaction.options.getUser('user') ?? interaction.user;

        await interaction.deferReply();
        const { embeds, components, followUp } = await animes_privates.getPage(
            interaction.user.id, user, page,
        );
        await interaction.editReply({ embeds, components });
        if (followUp) await interaction.followUp(followUp);
    },
});

export const anime = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('anime')
        .addStringOption(option =>
            option
                .setName('anime')
                .setDescription('The name of the anime.')
                .setRequired(true))
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to stalk.'))
        .setDescription('Show all characters available to obtain from an anime.'),

    long_description:
        'Show all characters collected from an anime.\n' +
        'If there are multiple results, selection times out in 60 seconds.\n' +
        'This command is case-insensitive.\n\n' +
        'Usage: `/anime anime: <anime_name> user: [user]`\n\n' +
        '__**Options**__\n' +
        '*anime:* The name of the anime to search for. (Required)\n' +
        "*user:* Check a different user's list. (Default: You)\n\n" +
        'Examples: `/anime anime: COTE`, `/anime anime: Genshin user: @krammygod`',

    async execute(interaction) {
        const name = interaction.options.getString('anime');
        const user = interaction.options.getUser('user') ?? interaction.user;
        const embed = new EmbedBuilder({ title: 'Waiting for selection...' }).setColor('Gold');
        await interaction.reply({ embeds: [embed] });
        const res = await DB.searchOriginByName(name!);
        const series = await Utils.get_results(
            interaction, res,
            { title_fmt: (idx: number) => `Found ${idx} animes. Please select one:` },
        );
        if (series === null) {
            return interaction.deleteReply();
        } else if (!series) {
            embed.setTitle(`No anime found with name \`${name}\`.`).setColor(Colors.Red);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        embed.setTitle('Search results:');
        const anime_chars = await DB.getAnime(series);
        const count = anime_chars.length;
        let desc = `__Anime found:__\n*${series}*\n\n**Found ${count} character(s):**\n`;
        for (const [idx, char] of anime_chars.entries()) {
            let obtained = '🟩';
            let uStatus = '';
            let wFC = char.fc ? '⭐ ' : '';
            const user_char = await DB.fetchUserCharacter(user.id, char.wid).catch(Utils.VOID);
            if (user_char) {
                obtained = '✅';
                await user_char.loadWaifu();
                uStatus = user_char.getUStatus();
                wFC = user_char.getWFC(interaction.channel!);
            }
            desc += `${obtained} ${idx + 1}. ${wFC}` +
                `[${char.name}](${user_char?.getImage(interaction.channel!) ?? char.img[0]})` +
                `${char.getGender()}${uStatus}\n`;
        }
        embed.setDescription(desc).setFooter({ text: `Viewing User: @${user.tag}` });
        if (interaction.user.id !== user.id) {
            embed.setFooter({ text: 'Note: This is NOT your list.' });
        }
        await interaction.editReply({ embeds: [embed] });
        // Automatically collect if user is looking at own.
        if (user.id === interaction.user.id) {
            const cnt = await DB.fetchUserAnimeCount(user.id, series);
            if (cnt === anime_chars.length) {
                const gain = await collect_anime(user.id, series);
                if (gain) {
                    await interaction.followUp({
                        content: `You collected bonuses for \`${series}\`! ` +
                            `+${gain} ${interaction.client.bot_emojis.brons}`,
                        flags: MessageFlags.Ephemeral,
                    });
                }
            }
        }
    },
});

export const bal = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('bal')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to stalk.'))
        .setDescription('Show your current balance.'),

    long_description:
        "Check anyone's current balance of brons!\n\n" +
        'Usage: `/bal user: [user]`\n\n' +
        '__**Options**__\n' +
        '*user:* The user to stalk. (Default: You)\n\n' +
        'Examples: `/bal`, `/bal user: @krammygod`',

    async execute(interaction) {
        const user = interaction.options.getUser('user') ?? interaction.user;
        await interaction.deferReply();
        const brons = await DB.getBrons(user.id);
        if (brons === undefined) {
            const dailyCmd = await Utils.get_rich_cmd('daily', interaction.client);
            if (user.id === interaction.user.id) {
                return interaction.editReply({
                    content: `You don't have an account. Create one by using ${dailyCmd}`,
                }).then(Utils.VOID);
            }
            return interaction.editReply({
                content: `${user} does not have an account. Tell them to join by using ${dailyCmd}`,
                allowedMentions: { users: [] },
            }).then(Utils.VOID);
        }
        if (user.id === interaction.user.id) {
            return interaction.editReply({
                content: `You currently have ${brons} ${interaction.client.bot_emojis.brons}.`,
            }).then(Utils.VOID);
        } else if (user.id === interaction.client.user.id) {
            return interaction.editReply({
                content: `I have ∞ ${interaction.client.bot_emojis.brons}.`,
            }).then(Utils.VOID);
        }
        return interaction.editReply({
            content: `${user} has ${brons} ${interaction.client.bot_emojis.brons}.`,
            allowedMentions: { users: [] },
        }).then(Utils.VOID);
    },
});

const lb_privates = {
    async getPage(client: Client, authorID: string, page: number) {
        const max_pages = totalPages(await DB.getUserCount());

        const embed = new EmbedBuilder({
            title: 'Leaderboards',
            color: Colors.Blue,
        });
        // This represents any followup messages that should be sent
        const followUp: {
            embeds: EmbedBuilder[],
            flags: MessageFlags.Ephemeral
        } = {
            embeds: [],
            flags: MessageFlags.Ephemeral,
        };
        if (max_pages === 0) {
            embed.setDescription(`Page 0/${max_pages}`).setFields({
                name: '**No Users found. :(**',
                value: "Why don't you start rolling today?",
            });
            return { embeds: [embed] };
        } else if (page < 1) {
            const error_embed = new EmbedBuilder({
                title: 'Please enter a positive number.',
                color: Colors.Red,
            });
            followUp.embeds.push(error_embed);
            page = 1;
        } else if (page > max_pages) {
            const error_embed = new EmbedBuilder({
                title: `Too high. Max page: ${max_pages}`,
                color: Colors.Red,
            });
            followUp.embeds.push(error_embed);
            page = max_pages;
        }

        embed.setDescription(`Page ${page}/${max_pages}`);
        const start = (page - 1) * 10;
        const users = await DB.getLeaderboards(start);

        let field = '';
        for (const data of users) {
            const displayName = await Utils.fetch_user_fast(client, data.uid, u => u?.displayName);
            field += `${data.idx}. __${displayName ?? data.uid}` +
                `:__ **${data.brons}** ${client.bot_emojis.brons} *(${data.waifus} ` +
                `${data.waifus === 1 ? 'waifu' : 'waifus'})*`;
            if (authorID === data.uid) {
                field += ' ⬅️ (You)';
            }
            field += '\n';
        }
        // Add as field if possible
        if (field.length <= 1024) {
            embed.addFields({
                name: `Top ${users[0].idx}-${users[users.length - 1].idx} Users:`,
                value: field,
            });
        } else {
            // Otherwise add as description
            embed.setDescription(
                `${embed.data.description}\n\n**Top ` +
                `${users[0].idx}-${users[users.length - 1].idx} Users:**\n${field}`,
            );
        }
        const place = await DB.getUserLBStats(authorID).then(p => p?.idx);
        let place_suffix = 'th';
        if (place && !(10 < place && place < 13)) {
            switch (place % 10) {
            case 1:
                place_suffix = 'st';
                break;
            case 2:
                place_suffix = 'nd';
                break;
            case 3:
                place_suffix = 'rd';
                break;
            }
        }
        embed.setFooter({
            text: place ?
                `You are in ${place}${place_suffix} place!` :
                'Sign up for an account to be on the leaderboards!',
        });
        // These buttons are specialized per user/page
        const buttons = getGlobalButtons();
        const buttons2 = getGlobalButtons2();
        buttons[0].setCustomId(`lb/${authorID}/1`);
        buttons[1].setCustomId(`lb/${authorID}/${page - 1}/`);
        buttons[2].setCustomId(`lb/${authorID}/${page + 1}/`);
        buttons[3].setCustomId(`lb/${authorID}/${max_pages}//`); // Required for unique id
        buttons[4].setCustomId(`lb/${authorID}/help`);
        buttons2[0].setCustomId(`lb/${authorID}/input`);
        buttons2.push(
            new ButtonBuilder()
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`top/${authorID}/${page}`),
        );
        if (page === 1) {
            buttons[0].setDisabled(true);
            buttons[1].setDisabled(true);
        }
        if (page === max_pages) {
            buttons[2].setDisabled(true);
            buttons[3].setDisabled(true);
        }
        // Return the proper object to update
        const retval: HelperRetVal = {
            embeds: [embed],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
                new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons2),
            ],
        };
        if (followUp.embeds.length > 0) {
            retval.followUp = followUp;
        }
        return retval;
    },
};
export const lb = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('lb')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Page to jump to. (Default: 1)')
                .setMinValue(1))
        .setDescription('Show leaderboards for brons.'),

    long_description:
        'Shows the top x users with the highest brons!\n\n' +
        'Usage: `/lb page: [page]`\n\n' +
        '__**Options**__\n' +
        '*page:* The page number to jump to. (Default: 1)\n\n' +
        'Examples: `/lb`, `/lb page: 2`',

    async textInput(interaction) {
        const value = interaction.fields.getTextInputValue('value');

        await interaction.deferUpdate();
        const page = parseInt(value);
        if (isNaN(page)) {
            return interaction.followUp({
                content: 'Invalid page number.',
                flags: MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        const { embeds, components, followUp } = await lb_privates.getPage(
            interaction.client,
            interaction.user.id,
            page,
        );
        await interaction.editReply({ embeds, components });
        if (followUp) await interaction.followUp(followUp);
    },

    async buttonReact(interaction) {
        const [page] = interaction.customId.split('/').splice(2);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const input = new ModalBuilder({
                    title: 'Jump to page',
                    customId: 'lb',
                    components: [
                        new ActionRowBuilder<TextInputBuilder>({
                            components: [
                                new TextInputBuilder({
                                    label: 'Page #',
                                    customId: 'value',
                                    placeholder: 'Enter the page number to jump to...',
                                    style: TextInputStyle.Short,
                                    maxLength: 100,
                                    required: true,
                                }),
                            ],
                        }),
                    ],
                });
                return interaction.showModal(input);
            } else if (page === 'help') {
                return interaction.reply({
                    content: GLOBAL_HELP + '🔄: Swaps to leaderboards sorted by stars',
                    flags: MessageFlags.Ephemeral,
                }).then(Utils.VOID);
            } else {
                throw new Error(`Button type: ${page} not found.`);
            }
        }
        await interaction.deferUpdate();
        const { embeds, components } = await lb_privates.getPage(interaction.client, interaction.user.id, val);
        await interaction.editReply({ embeds, components });
    },

    async execute(interaction) {
        await interaction.deferReply();
        const page = interaction.options.getInteger('page') ?? 1;
        const { embeds, components, followUp } = await lb_privates.getPage(
            interaction.client,
            interaction.user.id,
            page,
        );
        await interaction.editReply({ embeds, components });
        if (followUp) await interaction.followUp(followUp);
    },
});

export const daily = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('daily')
        .setDescription('Get your daily brons.'),

    long_description:
        'What is {/daily} you ask?  Well, here you will learn\n' +
        'That once in a day, 200 bron you may earn.\n\n' +
        'And if a waifu is at level 5 or more,\n' +
        "Then there's a chance extra bron is in store!\n\n" +
        'But if you are new, use {/daily} to start,\n' +
        "And 1000 bron just this once I'll impart.\n\n" +
        'So when does your next {/daily} go live?\n' +
        'The answer is midnight, UTC -5!\n' +
        '\\- *A prose by @ryu_minoru*\n\n' +
        'Usage: `/daily`',

    async execute(interaction) {
        await interaction.deferReply();
        const { collect_success, amt } = await DB.getAndSetDaily(interaction.user.id);
        const embed = new EmbedBuilder({ color: Colors.Yellow });
        if (collect_success) {
            // Constant from database.ts; should stay same
            if (amt === 1000) {
                // First sign up
                embed.setColor(Colors.Gold).setTitle(
                    `You have collected your first daily! +1000 ${interaction.client.bot_emojis.brons}!`,
                );
                return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
            }
            embed.setTitle(`You have collected your daily! +200 ${interaction.client.bot_emojis.brons}!`);
            const chosen = await DB.fetchRandomStarred(interaction.user.id);
            let bonus_brons = 0;
            if (chosen) {
                if (chosen.lvl >= 5) bonus_brons = 125 + chosen.lvl * 15;
                const level_str = chosen.lvl < 5 ?
                    `Your affection with ${chosen.name} is too low right now!` :
                    `Congrats on level ${chosen.lvl}!`;
                embed.setColor(Colors.Gold).setTitle(
                    `${embed.data.title}\naaaaand ${chosen.name} gave you another +` +
                    `${bonus_brons} ${interaction.client.bot_emojis.brons}! ${level_str}`,
                );
                DB.addBrons(interaction.user.id, bonus_brons);
            }
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        // Otherwise already collected
        // Hack I figured out a long time ago. Something about 5am UTC.
        const time_left = new Date().setUTCHours(new Date().getUTCHours() >= 5 ? 29 : 5, 0, 0, 0);
        embed.setColor(Colors.Red).setTitle(
            `You have already collected your dailies.\nNext daily reset ${Utils.timestamp(time_left, 'R')}.`,
        );
        await interaction.editReply({ embeds: [embed] });
    },
});

export const profile = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('profile')
        .addUserOption(options =>
            options
                .setName('user')
                .setDescription('The user to view. (Default: You)'))
        .setDescription('View statistics of a user.'),

    long_description:
        'All stats combined into one simple and clean display!\n\n' +
        'Usage: `/profile user: [user]`\n\n' +
        '__**Options**__\n' +
        "*user:* The user's profile to see. (Default: You)\n\n" +
        'Examples: `/profile`, `/profile user: @krammygod`',

    async execute(interaction) {
        const user = interaction.options.getUser('user') ?? interaction.user;
        const me = interaction.client.user.id;
        await interaction.deferReply();
        const promises = [
            DB.getCollected(user.id),
            DB.getWhales(user.id),
            DB.fetchUserCharacterCount(user.id),
            DB.getAllCompleted(user.id),
            DB.getUserLBStats(user.id),
            DB.getUserStarLBStats(user.id),
            DB.fetchWaifuCount(),
        ];
        const [
            collected, whales, ccount, completed,
            lbs, star_lb, stars,
        ] = await Promise.all(promises);
        // Bots or no account
        if ((user.bot || collected === undefined) && user.id !== me) {
            const embed = new EmbedBuilder({
                title: `${user.displayName}'s Profile`,
                description: `**${user.bot ?
                    'Bots have no accounts :(' :
                    'No info :('}**`,
                color: Colors.Gold,
            }).setThumbnail(user.displayAvatarURL());
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        const brons = (lbs as { brons: number } | undefined)?.brons ?? -1;

        /* Setup fields for embed */
        const time_left = new Date().setUTCHours(new Date().getUTCHours() >= 5 ? 29 : 5, 0, 0, 0);
        // Collected string
        const c_str = collected ?
            `❎ More available\n${Utils.timestamp(time_left, 'R')}` :
            '✅ Available now!';
        // Whales string
        const w_str = whales ?
            `❎ More available\n${Utils.timestamp(time_left, 'R')}` :
            '✅ Available now!';
        // This is here because it makes the embed look pretty, used to have a use case.
        const cus_str = '✅ Registered!';
        const a_str = user.id === me ? '∞' : `${(completed as Map<string, number>).size}`;
        const wai_str = user.id === me ? '∞' : ccount;
        const scount_str = user.id === me ? '∞ 🌟' :
            // I'm too lazy to fix this typescript weirdness
            `${(star_lb as unknown as { stars: number }).stars}` +
            `${stars === (star_lb as unknown as { stars: number }).stars ? '🌟' : '⭐'}`;
        const pos = user.id === me ? 0 : (lbs as { idx: number }).idx;
        const spos = user.id === me ? 0 : (star_lb as { idx: number }).idx;
        /* End fields for embed */

        const embed = new EmbedBuilder({
            title: `${user.displayName}'s Profile`,
            description: `**「${brons < 0 ?
                '∞' :
                brons} ${interaction.client.bot_emojis.brons}」**`,
            color: Colors.Gold,
        }).addFields([
            {
                name: '__Daily Check-in:__ ',
                value: `**${c_str}**`,
                inline: true,
            },
            {
                name: '__Daily Whale:__ ',
                value: `**${w_str}**`,
                inline: true,
            },
            {
                name: '__Custom database:__ ',
                value: `**${cus_str}**`,
                inline: true,
            },
            {
                name: '__Animes collected:__',
                value: `> **${a_str}**`,
                inline: true,
            },
            {
                name: '__Number of waifus:__ ',
                value: `> **${wai_str}**`,
                inline: true,
            },
            {
                name: '__Number of stars:__ ',
                value: `> **${scount_str}**`,
                inline: true,
            },
            {
                name: '__Leaderboard Position:__',
                value: `> **#${pos}**`,
                inline: true,
            },
            {
                name: '__Most Stars Position:__',
                value: `> **#${spos}**`,
                inline: true,
            },
        ]).setThumbnail(user.displayAvatarURL());

        if (user.id === me) {
            // Rig for self
            const nsfwSafe = Utils.channel_is_nsfw_safe(interaction.channel!);
            const link = nsfwSafe ?
                'https://d1irvsiobt1r8d.cloudfront.net/images/bLwQU3.jpg' :
                'https://d1irvsiobt1r8d.cloudfront.net/images/Rywo6C.jpg';
            const field = `> **${nsfwSafe ? '🔞' : '⭐'} Kamisato Ayaka ♀️` +
                ' (Lvl ∞ 🔥)**\n' +
                '> __From:__ *Genshin Impact*\n' +
                `> [Chosen Image](${link})`;
            embed.addFields([{ name: '__Favourite *and Top* waifu:__', value: field }]);
        } else {
            // I'm not even going to document this because this was written 3 years ago...
            const favourite = await DB.fetchUserCharactersList(user.id, 1).then(c => c.at(0));
            const highest = await DB.fetchUserHighestCharacter(user.id);
            if (highest && favourite) {
                await favourite.loadWaifu();
                await highest.loadWaifu();
                let field = `> **${favourite.getWFC(interaction.channel!)} ${favourite.name} ` +
                    `${favourite.getGender()} (Lvl ${favourite.displayLvl}${favourite.getUStatus(' ')})**\n`;
                field += `> __From:__ *${favourite.origin}*\n`;
                field += `> [Chosen Image](${favourite.getImage(interaction.channel!)})`;
                // Favourite (#1 waifu) is not the same as highest level waifu.
                if (favourite.wid !== highest.wid) {
                    embed.addFields([{ name: '__Favourite waifu:__ ', value: field }]);
                    field = `> **${highest.getWFC(interaction.channel!)} ${highest.name} ` +
                        `${highest.getGender()} (Lvl ${highest.displayLvl}${highest.getUStatus(' ')})**\n`;
                    field += `> __From:__ *${highest.origin}*\n`;
                    field += `> [Chosen Image](${highest.getImage(interaction.channel!)})`;
                    embed.addFields([{ name: '__Top waifu:__ ', value: field, inline: true }]);
                } else {
                    embed.addFields([{ name: '__Favourite *and Top* waifu:__ ', value: field }]);
                }
            } else {
                embed.addFields([{ name: '__Favourite *and Top* waifu:__ ', value: 'No waifus :(' }]);
            }
        }
        embed.setFooter({ text: 'Note: The favourite waifu is the waifu at position #1.' });
        await interaction.editReply({ embeds: [embed] });
    },
});

export const profile_menu = new ContextCommand({
    data: new ContextMenuCommandBuilder()
        .setName('Profile')
        .setType(ApplicationCommandType.User),

    long_description: 'Show /profile command on the user',

    execute(interaction) {
        return profile.execute(interaction as unknown as ChatInputCommandInteraction);
    },
});

// Helper that gets a list as an embed
async function get_list_as_embed(
    channel: TextBasedChannel,
    authorID: string,
    target: User,
    page: number,
    high: boolean,
) {
    const max_pages = totalPages(high ?
        await DB.fetchUserHighCount(target.id) :
        await DB.fetchUserCharacterCount(target.id),
    );
    const embed = new EmbedBuilder({
        title: `${high ? 'Highest Upgradable Waifus' : 'All Waifu List'}`,
        footer: { text: `Viewing User: @${target.tag}\nPlease use raw source if image is unavailable.` },
        color: high ? Colors.Gold : Colors.Blue,
    }).setThumbnail(target.displayAvatarURL());
    // This represents any followup messages that should be sent
    const followUp: {
        embeds: EmbedBuilder[],
        flags: MessageFlags.Ephemeral
    } = {
        embeds: [],
        flags: MessageFlags.Ephemeral,
    };
    if (max_pages === 0) {
        embed.setDescription(`Page 0/${max_pages}`).setFields({
            name: '**No Waifus found. :(**',
            value: "Why don't you start rolling today?",
        });
        return { embeds: [embed] };
    } else if (page < 1) {
        const error_embed = new EmbedBuilder({
            color: Colors.Red,
            title: 'Please enter a positive number.',
        });
        followUp.embeds.push(error_embed);
        page = 1;
    } else if (page > max_pages) {
        const error_embed = new EmbedBuilder({
            color: Colors.Red,
            title: `Too high. Max page: ${max_pages}`,
        });
        followUp.embeds.push(error_embed);
        page = max_pages;
    }

    embed.setDescription(`Page ${page}/${max_pages}`);
    const start = getStart(page);
    let end = start;
    let field = '';
    const characters = high ?
        await DB.fetchUserHighCharactersList(target.id, start) :
        await DB.fetchUserCharactersList(target.id, start);
    for (const character of characters) {
        await character.loadWaifu();
        const img = character.getImage(channel);
        field += `${character.idx}. ${character.getWFC(channel)} ` +
            `[${character.name}](${img})${character.getGender()} ` +
            `(Lvl ${character.displayLvl}${character.getUStatus(' ')})\n`;
        end = character.idx!;
    }
    if (field.length <= 1024) {
        embed.setFields({
            name: `Listing waifus ${start}-${end}:`,
            value: field,
            inline: true,
        });
    } else {
        embed.setDescription(`${embed.data.description}\n\n**Listing waifus ${start}-${end}:**\n${field}`);
    }

    const buttons = getGlobalButtons();
    const buttons2 = getGlobalButtons2();
    const fn = high ? 'high' : 'list';
    const oppositeFn = high ? 'list' : 'high';
    buttons[0].setCustomId(`${fn}/${authorID}/list/1/${target.id}`);
    buttons[1].setCustomId(`${fn}/${authorID}/list/${page - 1}/${target.id}/`);
    buttons[2].setCustomId(`${fn}/${authorID}/list/${page + 1}/${target.id}/`);
    buttons[3].setCustomId(`${fn}/${authorID}/list/${max_pages}/${target.id}//`); // Required for unique id
    buttons[4].setCustomId(`${fn}/${authorID}/list/help/${target.id}`);
    buttons2[0].setCustomId(`${fn}/${authorID}/list/input/${target.id}`);
    buttons2.push(
        new ButtonBuilder()
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`${fn}/${authorID}/find/input/${target.id}`),
        new ButtonBuilder()
            .setEmoji('⬇️')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`${fn}/${authorID}/find/${start}/${target.id}`),
        new ButtonBuilder()
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`${oppositeFn}/${authorID}/list/1/${target.id}`),
    );
    if (page === 1) {
        buttons[0].setDisabled(true);
        buttons[1].setDisabled(true);
    }
    if (page === max_pages) {
        buttons[2].setDisabled(true);
        buttons[3].setDisabled(true);
    }
    const retval: HelperRetVal = {
        embeds: [embed],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
            new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons2),
        ],
    };
    if (followUp.embeds.length > 0) {
        retval.followUp = followUp;
    }
    return retval;
}

// Helper that gets a character as an embed
async function get_char_as_embed(
    channel: TextBasedChannel,
    authorID: string,
    target: User,
    idx: number,
    high: boolean,
): Promise<HelperRetVal>;
async function get_char_as_embed(
    channel: TextBasedChannel,
    authorID: string,
    target: User,
    wid: string,
    high: boolean,
): Promise<HelperRetVal>;
async function get_char_as_embed(
    channel: TextBasedChannel,
    authorID: string,
    target: User,
    idx_or_wid: number | string,
    high: boolean,
): Promise<HelperRetVal> {
    const max_idx = high ?
        await DB.fetchUserHighCount(target.id) :
        await DB.fetchUserCharacterCount(target.id);
    const embed = new EmbedBuilder({
        title: `${high ? 'Highest Upgradable Waifus' : 'All Waifu List'}`,
        footer: { text: `Viewing User: @${target.tag}\nPlease use raw source if image is unavailable.` },
    }).setColor('Random').setThumbnail(target.displayAvatarURL());
    let wid: string | undefined;
    let idx: number | undefined;
    if (typeof idx_or_wid === 'number') {
        idx = idx_or_wid;
    } else {
        wid = idx_or_wid;
    }
    // This represents any followup messages that should be sent
    const followUp: {
        embeds: EmbedBuilder[],
        flags: MessageFlags.Ephemeral
    } = {
        embeds: [],
        flags: MessageFlags.Ephemeral,
    };
    if (max_idx === 0) {
        embed.setDescription(`Waifu 0/${max_idx}`).setFields({
            name: '**No Waifus found. :(**',
            value: "Why don't you start rolling today?",
        });
        return { embeds: [embed] };
    } else if (idx && idx < 1) {
        const error_embed = new EmbedBuilder({
            title: 'Please only use positive numbers.',
            color: Colors.Red,
        });
        followUp.embeds.push(error_embed);
        idx = 1;
    } else if (idx && idx > max_idx) {
        const error_embed = new EmbedBuilder({
            title: `Too high. Max page: ${max_idx}`,
            color: Colors.Red,
        });
        followUp.embeds.push(error_embed);
        idx = max_idx;
    }

    async function getCharacter() {
        if (idx) {
            if (high)
                return DB.fetchUserHighCharactersList(target.id, idx).then(c => c[0]);
            return DB.fetchUserCharactersList(target.id, idx).then(c => c[0]);
        }
        let char: DB.Character | undefined;
        if (high) {
            char = await DB.fetchUserHighCharacter(target.id, wid!);
        } else {
            char = await DB.fetchUserCharacter(target.id, wid!);
        }
        if (!char) {
            if (high)
                return DB.fetchUserHighCharactersList(target.id, 1).then(c => c[0]);
            return DB.fetchUserCharactersList(target.id, 1).then(c => c[0]);
        }
        return char;
    }

    const character = await getCharacter();
    await character.loadWaifu();
    embed.setDescription(`Waifu ${character.idx}/${max_idx}`);
    const charEmbed = character.getEmbed(channel);
    embed.setFields(charEmbed.data.fields!).setColor(charEmbed.data.color!).setImage(charEmbed.data.image!.url!);
    const fn = high ? 'high' : 'list';
    const oppositeFn = high ? 'list' : 'high';
    const menu = new StringSelectMenuBuilder()
        .setPlaceholder(authorID === target.id ? 'No actions.' : 'Not your list.')
        .setDisabled(true)
        .setCustomId(`${fn}/${authorID}/find/${character.idx}`)
        .addOptions({ label: 'None.', value: 'none' });

    // Only enable if user is the author.
    if (authorID === target.id) {
        await character.loadWaifu();
        const is_nsfw = Utils.channel_is_nsfw_safe(channel) && character.nsfw;
        // Switching image is always available; not all images are always available, however.
        if (character.fc) {
            if (!is_nsfw) {
                menu.addOptions({
                    label: 'Change image!',
                    value: `${fn}/${authorID}/toggle_char/${character.wid}`,
                    emoji: '🔄',
                });
            } else if (is_nsfw) {
                menu.addOptions({
                    label: 'Change lewd!',
                    value: `${fn}/${authorID}/toggle_char/${character.wid}`,
                    emoji: '🔄',
                });
            }
            if (Utils.channel_is_nsfw_safe(channel) && character.isNToggleable) {
                menu.addOptions({
                    label: `${character.nsfw ? 'Give me original!' : 'Give me lewd!'}`,
                    value: `${fn}/${authorID}/ntoggle_char/${character.wid}`,
                    emoji: '🔀',
                });
            }
        }
        menu.addOptions({
            label: 'Sell this character!',
            value: `${fn}/${authorID}/delete_char/${character.wid}`,
            emoji: '💰',
        });
    }
    // Enable if there are options
    if (menu.options.length > 1) {
        menu.setOptions(menu.options.slice(1));
        menu.setDisabled(false);
        menu.setPlaceholder('Click me for options!');
    }
    const buttons = getGlobalButtons();
    const buttons2 = getGlobalButtons2();
    buttons[0].setCustomId(`${fn}/${authorID}/find/1/${target.id}`);
    buttons[1].setCustomId(`${fn}/${authorID}/find/${character.idx! - 1}/${target.id}/`);
    buttons[2].setCustomId(`${fn}/${authorID}/find/${character.idx! + 1}/${target.id}/`);
    buttons[3].setCustomId(`${fn}/${authorID}/find/${max_idx}/${target.id}//`); // Required for unique id
    buttons[4].setCustomId(`${fn}/${authorID}/find/help/${target.id}`);
    buttons2[0].setCustomId(`${fn}/${authorID}/list/input/${target.id}`);
    buttons2.push(
        new ButtonBuilder()
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`${fn}/${authorID}/find/input/${target.id}`),
        new ButtonBuilder()
            .setEmoji('⬆️')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`${fn}/${authorID}/list/${getPage(character.idx!)}/${target.id}`),
        new ButtonBuilder()
            .setEmoji('🔄')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`${oppositeFn}/${authorID}/find/1/${target.id}`),
    );
    if (character.idx === 1) {
        buttons[0].setDisabled(true);
        buttons[1].setDisabled(true);
    }
    if (character.idx === max_idx) {
        buttons[2].setDisabled(true);
        buttons[3].setDisabled(true);
    }
    const retval: HelperRetVal = {
        embeds: [embed],
        components: [
            new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
            new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons2),
            new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
        ],
    };
    if (followUp.embeds.length > 0) {
        retval.followUp = followUp;
    }
    return retval;
}

const fnMappings = {
    'toggle_char': switch_char_image,
    'ntoggle_char': toggle_char_nsfw,
    'delete_char': delete_char,
};

async function switch_char_image(interaction: AnySelectMenuInteraction, char: DB.Character) {
    const is_nsfw = Utils.channel_is_nsfw_safe(interaction.channel!) && char.nsfw;

    async function get_char_images_embed(start: number): Promise<InteractionReplyOptions> {
        const embed = new EmbedBuilder({ color: Colors.Gold });
        const buttons = [];
        // Assuming char is switchable
        const embeds = [];
        await char.loadWaifu();
        const accessibleImages = is_nsfw ?
            char.waifu!.nimg.slice(0, char.max_nimg) :
            char.waifu!.img.slice(0, char.max_img);
        const image_page = accessibleImages.slice(start, start + 10);
        for (const [i, img] of image_page.entries()) {
            embed.setTitle(`Image #${start + i + 1}:`)
                .setDescription(`[Source](${DB.getSource(img)})\n[Raw Image](${img})`)
                .setImage(img);
            embeds.push(new EmbedBuilder(embed.data));
            buttons.push(new ButtonBuilder({
                label: `${start + i + 1}`,
                style: ButtonStyle.Primary,
                customId: `select_char/${start + i + 1}`,
            }));
        }

        // Buttons for navigating over 10 images
        const toggle_buttons = [
            new ButtonBuilder()
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`toggle_char/${start - 10}`)
                .setDisabled(start === 0),
            new ButtonBuilder()
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`toggle_char/${start + 10}`)
                .setDisabled(start + 10 >= accessibleImages.length),
            new ButtonBuilder()
                .setLabel('Cancel')
                .setStyle(ButtonStyle.Danger)
                .setCustomId('select_char/cancel'),
        ];
        const components = [new ActionRowBuilder<ButtonBuilder>().addComponents(toggle_buttons)];
        while (buttons.length > 0) {
            components.push(new ActionRowBuilder<ButtonBuilder>().addComponents(buttons.splice(0, 5)));
        }
        return {
            embeds,
            components,
            flags: MessageFlags.Ephemeral,
        };
    }

    const opts = await get_char_images_embed(0);
    const message = await interaction.followUp(opts);

    // Recursively create ourselves to handle pagination
    const createCollector = () => {
        const collector = message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            filter: i => i.customId.startsWith('toggle_char'),
            max: 1,
            time: 15 * 60 * 1000, // 15 minutes before interaction expires
        });
        collector.once('collect', async i => {
            await i.deferUpdate();
            const page = parseInt(i.customId.split('/')[1]);
            const opts = await get_char_images_embed(page);
            await i.editReply({ ...opts, flags: undefined });
        });
        collector.once('end', (_, reason) => {
            if (reason !== 'time' && reason !== 'messageDelete') {
                return createCollector();
            }
        });
    };
    createCollector();

    const selected = await message.awaitMessageComponent({
        componentType: ComponentType.Button,
        filter: i => i.customId.startsWith('select_char'),
        time: 15 * 60 * 1000, // 15 minutes before interaction expires
    }).then(i => {
        const val = i.customId.split('/')[1];
        if (val === 'cancel') return;
        return parseInt(val);
    }).catch(() => undefined);
    Utils.delete_ephemeral_message(interaction, message).catch(Utils.VOID);

    let success = true;
    if (selected === undefined) {
        return;
    } else if (is_nsfw) {
        success = await char.setNImg(selected);
    } else {
        success = await char.setImg(selected);
    }
    if (!success) {
        const embed = new EmbedBuilder({
            title: 'Apologies, that action failed. Please contact the support server.',
            color: Colors.Red,
        });
        return { embeds: [embed], flags: MessageFlags.Ephemeral };
    }
}

async function toggle_char_nsfw(interaction: AnySelectMenuInteraction, char: DB.Character) {
    const res = await char.toggleNsfw();
    // We only return stuff on failure
    if (res) {
        const embed = new EmbedBuilder({
            title: `Failed to toggle ${char.name}'s lewd status.` +
                "Either you don't own the character anymore, or there is an error.",
            color: Colors.Red,
        });
        return { embeds: [embed], flags: MessageFlags.Ephemeral };
    }
}

// TODO: Rewrite
async function delete_char(interaction: AnySelectMenuInteraction, char: DB.Character) {
    await char.loadWaifu();
    const embed = new EmbedBuilder({
        description:
            '## Are you sure you want to delete ' +
            `${char.getWFC(interaction.channel!)} **[${char.name}]` +
            `(${DB.getSource(char.getImage(interaction.channel!))}) ` +
            `(Lvl ${char.displayLvl}${char.getUStatus(' ')})** from ` +
            `*${char.origin}*?\n# **This action cannot be undone.**`,
        color: Colors.Red,
    });
    const buttons = new ActionRowBuilder<ButtonBuilder>()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('delete_char/confirm')
                .setLabel('Yes... :(')
                .setEmoji('🚮')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('delete_char/cancel')
                .setLabel('No! Take me back!')
                .setStyle(ButtonStyle.Secondary),
        );
    const message = await interaction.followUp({
        embeds: [embed],
        components: [buttons],
        flags: MessageFlags.Ephemeral,
    });
    const confirmed = await Utils.wait_for_button(message, 'delete_char/confirm');
    await Utils.delete_ephemeral_message(interaction, message);
    if (!confirmed) return;
    embed.setDescription(null);

    const res = await DB.deleteUserCharacter(char);
    if (res === 0) {
        embed.setTitle(`Failed to delete ${char.name}. Please contact the support server.`);
        return { embeds: [embed], flags: MessageFlags.Ephemeral };
    }
    const refund = (char.fc ? 4 : 2) * res; // CONSTANT: Refund brons
    DB.addBrons(interaction.user.id, refund);
    embed.setTitle(
        `Successfully deleted ${char.getWFC(interaction.channel!)}${char.name} ` +
        `${char.gender}! +${refund} ${interaction.client.bot_emojis.brons}`,
    );
    return { embeds: [embed], flags: MessageFlags.Ephemeral };
}

// This collection of helpers is because list and high are identical, with one parameter difference
const listHelpers = {
    async buttonReact(interaction: ButtonInteraction, high: boolean) {
        const [cmdName, page, userID] = interaction.customId.split('/').splice(2);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const fn = high ? 'high' : 'list';
                const input = cmdName === 'list' ?
                    new ModalBuilder({
                        title: 'Jump to page',
                        customId: `${fn}/list/${userID}`,
                        components: [
                            new ActionRowBuilder<TextInputBuilder>({
                                components: [
                                    new TextInputBuilder({
                                        label: 'Page #',
                                        customId: 'value',
                                        placeholder: 'Enter the page number to jump to...',
                                        style: TextInputStyle.Short,
                                        maxLength: 100,
                                        required: true,
                                    }),
                                ],
                            }),
                        ],
                    }) :
                    new ModalBuilder({
                        title: 'Search for Waifu',
                        customId: `${fn}/find/${userID}`,
                        components: [
                            new ActionRowBuilder<TextInputBuilder>({
                                components: [
                                    new TextInputBuilder({
                                        label: 'Name/Index #',
                                        customId: 'value',
                                        placeholder: 'Enter name of waifu or index in your list...',
                                        style: TextInputStyle.Short,
                                        maxLength: 100,
                                        required: true,
                                    }),
                                ],
                            }),
                        ],
                    });
                return interaction.showModal(input);
            } else if (page === 'help') {
                return interaction.reply({
                    content:
                        GLOBAL_HELP +
                        '🔍: Search and jump to a specific waifu by name or index\n' +
                        '⬆️: Selects the first waifu on the current page\n' +
                        `🔄: ${high ?
                            'Swap to normal list' :
                            'Swap to list sorted by highest upgradable waifus'}`,
                    flags: MessageFlags.Ephemeral,
                }).then(Utils.VOID);
            } else {
                throw new Error(`Button type: ${page} not found.`);
            }
        }
        await interaction.deferUpdate();
        const user = await interaction.client.users.fetch(userID).catch(() => null);
        if (!user) return interaction.deleteReply();
        const { embeds, components } = cmdName === 'list' ?
            await get_list_as_embed(
                interaction.channel!,
                interaction.user.id, user, val, high,
            ) :
            await get_char_as_embed(
                interaction.channel!,
                interaction.user.id, user, val, high,
            );
        await interaction.editReply({ embeds, components });
    },
    async menuReact(interaction: AnySelectMenuInteraction, high: boolean) {
        const [fn, wid] = interaction.values[0].split('/').splice(2);
        const startDate = new Date();
        await interaction.deferUpdate();
        const char = high ?
            await DB.fetchUserHighCharacter(interaction.user.id, wid) :
            await DB.fetchUserCharacter(interaction.user.id, wid);
        const callFn = fnMappings[fn as keyof typeof fnMappings];
        if (callFn) {
            const res = await callFn(interaction, char!) as InteractionReplyOptions | null;
            if (res) {
                await interaction.followUp(res);
            }
        } else {
            await interaction.followUp({
                content: 'This feature does not exist. Please contact the support server.',
                flags: MessageFlags.Ephemeral,
            });
        }
        // 15 minutes passed, interaction expired
        if (startDate.getTime() + 15 * 60 * 1000 <= new Date().getTime()) {
            // Why did we do this? It's actually quite an interesting bug.
            // Discord throws 401 when using expired webhook token to edit interaction messages
            // Discord.JS in turn, tries to protect us from CF (CloudFront?) bans, and nulls the bot's token
            // This is a very bad thing, because now the bot is not functional.
            return;
        }
        let res = null;
        // Delete char means wid will not exist anymore.
        if (fn === 'delete_char') {
            res = get_char_as_embed(
                interaction.channel!, interaction.user.id,
                interaction.user, char!.idx!, high,
            );
        } else {
            res = get_char_as_embed(
                interaction.channel!, interaction.user.id,
                interaction.user, wid, high,
            );
        }
        const { embeds, components } = await res;
        await interaction.editReply({ embeds, components });
    },
    async textInput(interaction: ModalSubmitInteraction, high: boolean) {
        const [cmdName, userID] = interaction.customId.split('/').splice(1);
        const value = interaction.fields.getTextInputValue('value');

        await interaction.deferUpdate();
        const user = await interaction.client.users.fetch(userID).catch(() => null);
        if (!user) return interaction.deleteReply();
        if (cmdName === 'list') {
            const page = parseInt(value);
            if (isNaN(page)) {
                return interaction.followUp({
                    content: 'Invalid page number.',
                    flags: MessageFlags.Ephemeral,
                }).then(Utils.VOID);
            }
            const { embeds, components, followUp } = await get_list_as_embed(
                interaction.channel!,
                interaction.user.id,
                user,
                page,
                high,
            );
            await interaction.editReply({ embeds, components });
            if (followUp) await interaction.followUp(followUp);
        } else if (cmdName === 'find') {
            const error_embed = new EmbedBuilder({
                color: Colors.Red,
            });
            const char = await search_character(interaction, userID, value, high);
            if (char === null) {
                return;
            } else if (!char) {
                error_embed.setTitle(`No character found with name \`${value}\`.`);
                return interaction.followUp({ embeds: [error_embed], flags: MessageFlags.Ephemeral }).then(Utils.VOID);
            } else if (char === NO_NUM) {
                error_embed.setTitle(`No character found with index \`${value}\`.`);
                return interaction.followUp({ embeds: [error_embed], flags: MessageFlags.Ephemeral }).then(Utils.VOID);
            }
            const { embeds, components, followUp } = await get_char_as_embed(
                interaction.channel!,
                interaction.user.id,
                user,
                char.wid,
                high,
            );
            await interaction.editReply({ embeds, components });
            if (followUp) await interaction.followUp(followUp);
        } else {
            throw new Error(`Command type: ${cmdName} not found.`);
        }
    },
    async execute(interaction: ChatInputCommandInteraction, high: boolean) {
        const user = interaction.options.getUser('user') ?? interaction.user;
        const page = interaction.options.getInteger('page') ?? 1;
        await interaction.deferReply();
        const { embeds, components, followUp } = await get_list_as_embed(
            interaction.channel!,
            interaction.user.id,
            user,
            page,
            high,
        );
        await interaction.editReply({ embeds, components });
        if (followUp) await interaction.followUp(followUp);
    },
};

export const list = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('list')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user whose waifu list you want to view. (Default: You)'))
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('The page to jump to. (Default: 1)')
                .setMinValue(1))
        .setDescription("View a user's waifu list."),

    long_description:
        'Reveal the waifus a user collected in a beautiful embed.\n\n' +
        'Usage: `/list user: [user] page: [page]`\n\n' +
        '__**Options**__\n' +
        '*user:* The user you want to stalk. (Default: You)\n' +
        '*page:* The page number you want to jump to. (Default: 1)\n\n' +
        'Examples: `/list`, `/list user: @krammygod`, `/list page: 2`',

    async buttonReact(interaction) {
        return listHelpers.buttonReact(interaction, false);
    },

    async menuReact(interaction) {
        return listHelpers.menuReact(interaction, false);
    },

    async textInput(interaction) {
        return listHelpers.textInput(interaction, false);
    },

    async execute(interaction) {
        return listHelpers.execute(interaction, false);
    },
});

export const list_menu = new ContextCommand({
    data: new ContextMenuCommandBuilder()
        .setName('Character List')
        .setType(ApplicationCommandType.User),

    long_description: 'Show character list from a user',

    execute(interaction) {
        return list.execute(interaction as unknown as ChatInputCommandInteraction);
    },
});

export const high = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('high')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user whose waifu list you want to view. (Default: You)'))
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('The page to jump to. (Default: 1)')
                .setMinValue(1))
        .setDescription("View a user's waifu list sorted by level."),

    long_description:
        'Get your highest characters now! ~~Limited time offer.~~\n' +
        'Only shows characters that are upgradable (see {/uplist})!\n' +
        'Suggested by: @ryu_minoru\n\n' +
        'Usage: `/high user: [user] page: [page]`\n\n' +
        '__**Options**__\n' +
        '*user:* The user to stalk. (Default: You)\n' +
        '*page:* The page number to jump to. (Default: 1)\n\n' +
        'Examples: `/high`, `/high user: @krammygod`, `/high page: 2`',

    async buttonReact(interaction) {
        return listHelpers.buttonReact(interaction, true);
    },

    async menuReact(interaction) {
        return listHelpers.menuReact(interaction, true);
    },

    async textInput(interaction) {
        return listHelpers.textInput(interaction, true);
    },

    async execute(interaction) {
        return listHelpers.execute(interaction, true);
    },
});

// NOTE: Update docs if/when level threshold for images change
const gacha_docs =
    `1% Chance to roll from custom database.
Custom database courtesy of: @snypintyme
Thanks to @iridescent114514, @spud5r, @resenkonepshire, @synxxmodz, and @ryu_minoru for helping expand.

**NEW FEATURE:**
You can now submit your own custom waifus to be added to the database!
Check out {/submit} for more information!

__Gacha System Rules:__
> Every multi, the 11th roll will always be starred ⭐.
> 
> If the character is a common, and you receive a duplicate, you will be refunded 1 \
bron and the character will NOT level up.
> 
> If the character is a starred, and you receive a duplicate, you will be refunded 2 \
brons and the character will level up 🆙.
> 
> Every level up, your character will unlock a new image if there are available images.
> 
> Once a character hits level 5, it will unlock a "lewd mode" (limited for certain characters). 🔓
> 
> You can switch the character's image by selecting the waifu in {/list} and using the select menu.
> 
> You can toggle to lewd mode by using by selecting the waifu in {/list} and using the select menu.

__Image Unlocking rules:__
> Your character level corresponds to the amount of images available to choose from, \
provided that the character has enough images.
> 
> Starting from level 5, you unlock the lewd mode toggle, which will automatically unlock \
lewd images if available.
> 
> Lewd images are also locked proportional to your level, where level 5 corresponds to 1 image.
> 
> If the character has enough images, and you reach the level threshold, there will be a \
message displayed when you roll the character.`;

// Helper to generate new character display
async function generateCharacterDisplay(
    client: Client,
    character: DB.CharacterInsert,
    channel: TextBasedChannel,
    user: User,
) {
    await character.loadWaifu();
    const img = character.getImage(channel);
    let refund = 0;
    let add_on = '';
    let add_emoji = ' 🆕';
    if (!character.new) {
        add_emoji = ' 🆒';
        // CONSTANT: Refund brons
        refund = character.fc ? 2 : 1;
        add_on = `**Received +${refund} ${client.bot_emojis.brons}**\n`;
        if (character.lvl > 1) {
            add_emoji = ' 🆙';
            add_on += `**Lvl (${character.lvl - 1} -> ${character.lvl})**\n`;
            // Unlocked new img
            if (character.max_img <= character.waifu!.img.length) {
                add_on += 'You unlocked a new image! 🎉\n';
                add_on += 'Find the character to switch the image!\n';
            }
            // Lewd mode available
            if (character.unlockedNMode) {
                add_on += 'You unlocked a new mode! 🎉\n';
                add_on += 'Find the character to switch to lewd mode!\n';
                // Unlocked new nimg
            } else if (character.max_nimg <= character.waifu!.nimg.length) {
                add_on += 'You unlocked a new lewd image! 🎉\n';
                add_on += 'Use lewd mode on the character to switch the image!\n';
            }
        }
    }
    const embed = new EmbedBuilder({
        description:
            `## ${character.getWFC(channel)}${character.name}${character.getGender()}${add_emoji}\n` +
            `**__From:__ *${character.origin.replace('*', '\\*')}***\n` +
            `${add_on}` +
            `[Source](${DB.getSource(img)})\n` +
            `[Raw Image](${img})`,
        color: character.fc ? Colors.Gold : Colors.LightGrey,
    }).setAuthor({
        name: `@${user.tag}`,
        iconURL: user.displayAvatarURL(),
    }).setImage(img);
    return { embed, refund };
}

export const roll = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('roll')
        .addBooleanOption(option =>
            option
                .setName('ephemeral')
                .setDescription('Toggle sending as ephemeral message. (Default: false)'))
        .setDescription('Roll a random waifu.'),

    long_description:
        'Randomly gives you an anime character. Each roll costs 2 brons.\n' +
        `${gacha_docs}\n\n` +
        'Usage: `/roll ephemeral: [ephemeral]`\n\n' +
        '__**Options**__\n' +
        '*ephemeral:* A flag to hide your pulls. (Default: off)\n\n' +
        'Examples: `/roll`, `/roll flags: MessageFlags.Ephemeral`',

    async execute(interaction) {
        const eph = interaction.options.getBoolean('ephemeral') ?? false;
        await interaction.deferReply({ ephemeral: eph }).catch(Utils.VOID);
        const amtTaken = { amt: 0 };
        const res = await DB.generateAndAddCharacter(interaction.user.id, amtTaken);
        const error_embed = new EmbedBuilder({ color: Colors.Red });
        if (typeof res === 'string') {
            error_embed.setTitle(`Roll failed. Reason: \`${res}\``);
            return interaction.editReply({ embeds: [error_embed] }).then(Utils.VOID);
        }
        let total_refund = 0;
        const { embed, refund } = await generateCharacterDisplay(
            interaction.client,
            res,
            interaction.channel!,
            interaction.user,
        );
        total_refund += refund;
        await DB.addBrons(interaction.user.id, total_refund);
        const total_change = amtTaken.amt + total_refund;
        const brons = interaction.client.bot_emojis.brons;
        const brons_string = `${total_change > 0 ? '+' : ''}${total_change} ${brons}`;
        // Reusing error_embed
        error_embed.setTitle(`Total change for ${interaction.user.displayName}: ${brons_string}`).setColor('Aqua');
        return Utils.send_embeds_by_wave(interaction, [embed, error_embed]);
    },
});

export const multi = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('multi')
        .addBooleanOption(option =>
            option
                .setName('ephemeral')
                .setDescription('Toggle sending as ephemeral message. (Default: false)'))
        .setDescription('Roll 11 characters.'),

    long_description:
        'Randomly gives you 11 anime characters. Special deal of 11x for the price of 10x (20 brons).\n' +
        `${gacha_docs}\n\n` +
        'Usage: `/multi ephemeral: [ephemeral]`\n\n' +
        '__**Options**__\n' +
        '*ephemeral:* A flag to hide your pulls. (Default: off)\n\n' +
        'Examples: `/multi`, `/multi flags: MessageFlags.Ephemeral`',

    async execute(interaction) {
        const eph = interaction.options.getBoolean('ephemeral') ?? false;
        await interaction.deferReply({ ephemeral: eph }).catch(Utils.VOID);
        const amtTaken = { amt: 0 };
        const res = await DB.generateAndAddCharacters(interaction.user.id, false, amtTaken);
        const embed = new EmbedBuilder({ color: Colors.Red });
        if (typeof res === 'string') {
            embed.setTitle(`Multi failed. Reason: \`${res}\``);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        let total_refund = 0;
        const embeds = [];
        for (const character of res) {
            const { embed, refund } = await generateCharacterDisplay(
                interaction.client,
                character,
                interaction.channel!,
                interaction.user,
            );
            total_refund += refund;
            embeds.push(embed);
        }
        await DB.addBrons(interaction.user.id, total_refund);
        const total_change = amtTaken.amt + total_refund;
        const brons = interaction.client.bot_emojis.brons;
        const brons_string = `${total_change > 0 ? '+' : ''}${total_change} ${brons}`;
        embed.setTitle(`Total change for ${interaction.user.displayName}: ${brons_string}`).setColor('Aqua');
        embeds.push(embed);
        return Utils.send_embeds_by_wave(interaction, embeds);
    },
});

export const whale = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('whale')
        .addBooleanOption(option =>
            option
                .setName('ephemeral')
                .setDescription('Toggle sending as ephemeral message. (Default: false)'))
        .setDescription('Roll 11 special anime characters.'),

    long_description:
        'Randomly gives you 11 starred waifus. Each whale costs 100 brons. Can only be done once a day.\n' +
        'Guaranteed to roll from custom database.\n' +
        'The last character is guaranteed to be a character that has multiple images (lewd or normal).\n' +
        `${gacha_docs}\n\n` +
        'Command suggested by Ryu Minoru#5834. Unlike multi, it will only give you 11 ' +
        'starred characters (with one guaranteed special character) for a higher price.\n\n' +
        'Usage: `/whale ephemeral: [ephemeral]`\n\n' +
        '__**Options**__\n' +
        '*ephemeral:* A flag to hide your pulls. (Default: off)\n\n' +
        'Examples: `/whale`, `/whale flags: MessageFlags.Ephemeral`',

    async execute(interaction) {
        const eph = interaction.options.getBoolean('ephemeral') ?? false;
        await interaction.deferReply({ ephemeral: eph }).catch(Utils.VOID);
        const amtTaken = { amt: 0 };
        const res = await DB.generateAndAddCharacters(interaction.user.id, true, amtTaken);
        const embed = new EmbedBuilder({ color: Colors.Red });
        if (typeof res === 'string') {
            embed.setTitle(`Whale failed. Reason: \`${res}\``);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        let total_refund = 0;
        const embeds = [];
        for (const character of res) {
            const { embed, refund } = await generateCharacterDisplay(
                interaction.client,
                character,
                interaction.channel!,
                interaction.user,
            );
            total_refund += refund;
            embeds.push(embed);
        }
        await DB.addBrons(interaction.user.id, total_refund);
        const total_change = amtTaken.amt + total_refund;
        const brons = interaction.client.bot_emojis.brons;
        const brons_string = `${total_change > 0 ? '+' : ''}${total_change} ${brons}`;
        embed.setTitle(`Total change for ${interaction.user.displayName}: ${brons_string}`).setColor('Aqua');
        embeds.push(embed);
        return Utils.send_embeds_by_wave(interaction, embeds);
    },
});

export const dall = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('dall')
        .addStringOption(option =>
            option
                .setName('start')
                .setDescription('The name or index of the character to start deleting.'))
        .addStringOption(option =>
            option
                .setName('end')
                .setDescription('The name or index of the character to stop deleting.'))
        .setDescription('Deletes all common characters.'),

    long_description:
        'WARNING! DANGEROUS COMMAND! This command will delete ALL of the characters that are ' +
        'not starred from your list.\n' +
        'Provide ranges to start/end with that character. (Suggestion by BluThunder1406#4598)\n\n' +
        'Usage: `/trade start: [start_waifu] end: [end_waifu]`\n\n' +
        '__**Options**__\n' +
        '*start_waifu:* The waifu to start deleting from. (Default: 1)\n' +
        '*end_waifu:* The waifu to stop deleting from. (Default: last)\n\n' +
        'Examples: `/dall`, `/dall start: 5`',

    async execute(interaction) {
        const begin = interaction.options.getString('start');
        const finish = interaction.options.getString('end');
        const embed = new EmbedBuilder({
            title: 'Searching...',
            color: Colors.LightGrey,
        });
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        let first: DB.Character | -1 | null | undefined = undefined;
        let last: DB.Character | -1 | null | undefined = undefined;
        let start: number | undefined = undefined;
        let end: number | undefined = undefined;
        if (begin) {
            first = await search_character(interaction, interaction.user.id, begin, false);
            if (first === NO_NUM || !first) {
                embed.setTitle(`Invalid waifu \`${begin}\`. Defaulting to first waifu...`);
                embed.setColor(Colors.Red);
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
            } else {
                start = first.idx;
            }
        }
        if (finish) {
            last = await search_character(interaction, interaction.user.id, finish, false);
            if (last === NO_NUM || !last) {
                embed.setTitle(`Invalid waifu \`${finish}\`. Defaulting to last waifu...`);
                embed.setColor(Colors.Red);
                await interaction.followUp({ embeds: [embed], flags: MessageFlags.Ephemeral });
                last = undefined;
            } else {
                end = last.idx;
            }
        }
        const commons = await DB.fetchUserCommonCount(interaction.user.id, { start, end });
        if (commons === 0) {
            embed.setTitle('No common characters found.').setColor(Colors.Red);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        embed.setTitle('Confirm delete?').setDescription(
            `## Found ${commons} common(s).\n` +
            `## Total refund: +${commons} ` +
            `${interaction.client.bot_emojis.brons}\n` +
            '# **This action cannot be undone.**',
        );
        const buttons = new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setCustomId('dall/confirm')
                    .setLabel('Yes... :(')
                    .setEmoji('🚮')
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setCustomId('dall/cancel')
                    .setLabel('No! Take me back!')
                    .setStyle(ButtonStyle.Secondary),
            );
        // Setup confirmation
        const message = await interaction.editReply({
            embeds: [embed],
            components: [buttons],
        });
        const confirmed = await Utils.wait_for_button(message, 'dall/confirm');
        if (!confirmed) return Utils.delete_ephemeral_message(interaction, message);

        const deleted = await DB.deleteUserCommonCharacters(interaction.user.id, { start, end });
        await DB.addBrons(interaction.user.id, deleted);
        embed.setDescription(
            `Successfully deleted ${deleted} common(s)! ` +
            `+${deleted} ${interaction.client.bot_emojis.brons}`,
        );
        await interaction.editReply({ embeds: [embed] });
    },
});

export const stars = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('stars')
        .addUserOption(option =>
            option
                .setName('user')
                .setDescription('The user to show the stars of. (Default: you)'))
        .setDescription('Shows the number of stars someone has.'),

    long_description:
        'Check how many starred characters you or a user has!\n\n' +
        'Usage: `/stars user: [user]`\n\n' +
        '__**Options**__\n' +
        '*user:* The user you want to find the number of stars for. (Default: You)\n\n' +
        'Examples: `/stars`, `/stars user: @krammygod`',

    async execute(interaction) {
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const user = interaction.options.getUser('user') ?? interaction.user;
        const starsString = user.id === interaction.client.user.id ? '∞' :
            await DB.fetchUserStarredCount(user.id);
        const stars = await DB.fetchWaifuCount();
        let starSymbol = '⭐';
        if (starsString === '∞' || starsString === stars) {
            starSymbol = '🌟';
        }
        let whoHas = '';
        if (interaction.user.id === user.id) {
            whoHas += 'You have';
        } else if (interaction.client.user.id === user.id) {
            whoHas += 'I have';
        } else {
            whoHas += `${user} has`;
        }
        const embed = new EmbedBuilder({
            title: `${whoHas} ${starsString} ${starSymbol}!`,
            color: Colors.Gold,
        });
        await interaction.editReply({ embeds: [embed] });
    },
});

const top_privates = {
    async getPage(client: Client, authorID: string, page: number) {
        const max_pages = totalPages(await DB.getUserCount());

        const embed = new EmbedBuilder({
            title: 'Starred leaderboards',
            color: Colors.Gold,
        });
        // This represents any followup messages that should be sent
        const followUp: {
            embeds: EmbedBuilder[],
            flags: MessageFlags.Ephemeral
        } = {
            embeds: [],
            flags: MessageFlags.Ephemeral,
        };
        if (max_pages === 0) {
            embed.setDescription(`Page 0/${max_pages}`).setFields({
                name: '**No Users found. :(**',
                value: "Why don't you start rolling today?",
            });
            return { embeds: [embed] };
        } else if (page < 1) {
            const error_embed = new EmbedBuilder({
                title: 'Please enter a positive number.',
                color: Colors.Red,
            });
            followUp.embeds.push(error_embed);
            page = 1;
        } else if (page > max_pages) {
            const error_embed = new EmbedBuilder({
                title: `Too high. Max page: ${max_pages}`,
                color: Colors.Red,
            });
            followUp.embeds.push(error_embed);
            page = max_pages;
        }
        embed.setDescription(`Page ${page}/${max_pages}`);
        const start = (page - 1) * 10;
        const users = await DB.getStarLeaderboards(start);
        const stars = await DB.fetchWaifuCount();

        let field = '';
        for (const data of users) {
            const displayName = await Utils.fetch_user_fast(client, data.uid, u => u?.displayName);
            field += `${data.idx}. __${displayName ?? data.uid}` +
                `:__ **${data.stars}** ${data.stars === stars ? '🌟' : '⭐'}`;
            if (authorID === data.uid) {
                field += ' ⬅️ (You)';
            }
            field += '\n';
        }
        // Add as field if possible
        if (field.length <= 1024) {
            embed.setFields({
                name: `Top ${users[0].idx}-${users[users.length - 1].idx} Users:`,
                value: field,
            });
        } else {
            // Otherwise add as description
            embed.setDescription(
                `${embed.data.description}\n\n**Top ${users[0].idx}-${users[users.length - 1].idx} Users:**\n${field}`,
            );
        }
        embed.setFooter({ text: `There are currently ${stars} ⭐!` });
        // These buttons are specialized per user/page
        const buttons = getGlobalButtons();
        const buttons2 = getGlobalButtons2();
        buttons[0].setCustomId(`top/${authorID}/1`);
        buttons[1].setCustomId(`top/${authorID}/${page - 1}/`);
        buttons[2].setCustomId(`top/${authorID}/${page + 1}/`);
        buttons[3].setCustomId(`top/${authorID}/${max_pages}//`); // Required for unique id
        buttons[4].setCustomId(`top/${authorID}/help`);
        buttons2[0].setCustomId(`top/${authorID}/input`);
        buttons2.push(
            new ButtonBuilder()
                .setEmoji('🔄')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`lb/${authorID}/${page}`),
        );
        if (page === 1) {
            buttons[0].setDisabled(true);
            buttons[1].setDisabled(true);
        }
        if (page === max_pages) {
            buttons[2].setDisabled(true);
            buttons[3].setDisabled(true);
        }
        // Return the proper object to update
        const retval: HelperRetVal = {
            embeds: [embed],
            components: [
                new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons),
                new ActionRowBuilder<ButtonBuilder>().addComponents(...buttons2),
            ],
        };
        if (followUp.embeds.length > 0) {
            retval.followUp = followUp;
        }
        return retval;
    },
};
export const top = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('top')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('Page to jump to. (Default: 1)')
                .setMinValue(1))
        .setDescription('Show top users with most starred waifus.'),

    long_description:
        'Shows the top users with the most amount of stars!\n\n' +
        'Usage: `/top page: [page]`\n\n' +
        '__**Options**__\n' +
        '*page:* The page number to jump to. (Default: 1)\n\n' +
        'Examples: `/top`, `/top page: 2`',

    async textInput(interaction) {
        const value = interaction.fields.getTextInputValue('value');

        await interaction.deferUpdate();
        const page = parseInt(value);
        if (isNaN(page)) {
            return interaction.followUp({
                content: 'Invalid page number.',
                flags: MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        const { embeds, components, followUp } = await top_privates.getPage(
            interaction.client,
            interaction.user.id,
            page,
        );
        await interaction.editReply({ embeds, components });
        if (followUp) await interaction.followUp(followUp);
    },

    async buttonReact(interaction) {
        const [page] = interaction.customId.split('/').splice(2);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const input = new ModalBuilder({
                    title: 'Jump to page',
                    customId: 'top',
                    components: [
                        new ActionRowBuilder<TextInputBuilder>({
                            components: [
                                new TextInputBuilder({
                                    label: 'Page #',
                                    customId: 'value',
                                    placeholder: 'Enter the page number to jump to...',
                                    style: TextInputStyle.Short,
                                    maxLength: 100,
                                    required: true,
                                }),
                            ],
                        }),
                    ],
                });
                return interaction.showModal(input);
            } else if (page === 'help') {
                return interaction.reply({
                    content: GLOBAL_HELP + '🔄: Swaps to leaderboards sorted by brons',
                    flags: MessageFlags.Ephemeral,
                }).then(Utils.VOID);
            } else {
                throw new Error(`Button type: ${page} not found.`);
            }
        }
        await interaction.deferUpdate();
        const { embeds, components } = await top_privates.getPage(
            interaction.client,
            interaction.user.id,
            parseInt(page),
        );
        await interaction.editReply({ embeds, components });
    },

    async execute(interaction) {
        await interaction.deferReply();
        const page = interaction.options.getInteger('page') ?? 1;
        const { embeds, components, followUp } = await top_privates.getPage(
            interaction.client,
            interaction.user.id,
            page,
        );
        await interaction.editReply({ embeds, components });
        if (followUp) await interaction.followUp(followUp);
    },
});

export const users = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('users')
        .addStringOption(option =>
            option
                .setName('waifu_name')
                .setDescription('The name of the character to search for.')
                .setRequired(true))
        .setDescription('Get a list of all users that have a certain character.'),

    long_description:
        'Find all the users that own that character. This will give the waifu number too so\n' +
        'you can trade with them. The waifu name is case-insensitive, and will prioritize\n' +
        'names equal to the given name.\n\n' +
        'This command also shows all the details about the waifu!\n\n' +
        'Usage: `/users waifu_name: <waifu_name>`\n\n' +
        '__**Options**__\n' +
        '*waifu_name:* The name of the waifu you want details of. (Required)\n\n' +
        'Examples: `/users waifu_name: Kamisato Ayaka`',

    async execute(interaction) {
        const waifu_name = interaction.options.getString('waifu_name')!;
        // If anything goes wrong with replying, don't do anything
        const embed = new EmbedBuilder({
            title: 'Searching database...',
            color: Colors.Gold,
        });
        const error_embed = new EmbedBuilder({ color: Colors.Red });
        await interaction.reply({ embeds: [embed] });
        embed.setTitle('Character Details:');

        const waifu = await search_waifu(interaction, waifu_name);
        if (waifu === null) {
            error_embed.setTitle('No character selected.');
            return interaction.editReply({ embeds: [error_embed] }).then(Utils.VOID);
        } else if (waifu === undefined) {
            error_embed.setTitle(`No character found with name \`${waifu_name}\`.`);
            return interaction.editReply({ embeds: [error_embed] }).then(Utils.VOID);
        }

        const users = await DB.fetchAllUsers(waifu.wid);
        let desc =
            `__Name:__ **${waifu.name}**\n` +
            `__From:__ *${waifu.origin}*\n` +
            `__Gender:__ ${waifu.gender}\n` +
            `__Normal images:__ ${waifu.img.length}\n` +
            `__Lewd images:__ ${waifu.nimg.length}\n` +
            `[Source](${DB.getSource(waifu.img[0])})\n` +
            `[Raw Image](${waifu.img[0]})\n\n` +
            `**Top ${users.length} users:**\n`;
        embed.setThumbnail(waifu.img[0]);
        // Keeping this for when trade improved is implemented
        // .setFooter({
        //     text: 'Get the user ID by using /getid user: <user>,\n' +
        //           'and then use /trade to trade with them!'
        // });
        for (const [i, char] of users.entries()) {
            const user = await interaction.client.users.fetch(char.uid).catch(() => null);
            if (!user) return interaction.deleteReply();
            desc +=
                `${i + 1}. **@${user?.tag ?? char.uid}** ` +
                `***(waifu #${char.idx})** (Level ${char.displayLvl})* ` +
                `${interaction.user.id === char.uid ? '⬅️ (You)' : ''}\n`;
        }
        embed.setDescription(desc);
        await interaction.editReply({ embeds: [embed] });
    },
});

export const swap = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('swap')
        .addStringOption(option =>
            option
                .setName('char1')
                .setDescription('The name or index number of the first character.')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('char2')
                .setDescription('The name or index number of the second character.')
                .setRequired(true))
        .setDescription('Swap two characters in your list.'),

    long_description:
        'Changes a characters position with another for simple sorting.\n\n' +
        'Usage: `/swap char1: <char1> char2: <char2>`\n\n' +
        '__**Options**__\n' +
        '*char1:* One character you want to change positions. (Required)\n' +
        '*char2:* The other character you would like to switch with. (Required)\n\n' +
        'Examples: `/swap char1: 1 char2: 2` <- Swaps characters at position 1 with 2.',

    async execute(interaction) {
        const c1 = interaction.options.getString('char1')!;
        const c2 = interaction.options.getString('char2')!;
        const embed = new EmbedBuilder({
            title: 'Waiting for selection...',
            color: Colors.Yellow,
        });
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        embed.setColor(Colors.Red);
        const char1 = await search_character(interaction, interaction.user.id, c1, false);
        if (char1 === null) {
            return interaction.deleteReply();
        } else if (!char1) {
            embed.setTitle(`First character not found with name \`${c1}\`.`);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        } else if (char1 === NO_NUM) {
            embed.setTitle(`First character not found with index \`${c1}\`.`);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        const char2 = await search_character(interaction, interaction.user.id, c2, false);
        if (char2 === null) {
            return;
        } else if (!char2) {
            embed.setTitle(`Second character not found with name \`${c2}\`.`);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        } else if (char2 === NO_NUM) {
            embed.setTitle(`Second character not found with index \`${c2}\`.`);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        if (char1.idx === char2.idx) {
            embed.setTitle('Why are you swapping the same character?');
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        await DB.swapUserCharacters(char1, char2);
        embed.setTitle(
            `${char1.getWFC(interaction.channel!)} ${char1.name}` +
            `${char1.getGender()} (position ${char1.idx}) is now at position ${char2.idx}\n` +
            `${char2.getWFC(interaction.channel!)} ${char2.name}` +
            `${char2.getGender()} (position ${char2.idx}) is now at position ${char1.idx}`,
        ).setColor(Colors.Gold);
        await interaction.editReply({ embeds: [embed] });
    },
});

export const move = new SlashCommandNoSubcommand({
    data: new SlashCommandBuilder()
        .setName('move')
        .addStringOption(option =>
            option
                .setName('char')
                .setDescription('The character to move.')
                .setRequired(true))
        .addIntegerOption(option =>
            option
                .setName('position')
                .setDescription('The position to move the character to.')
                .setMinValue(1)
                .setRequired(true))
        .setDescription('Moves a character from one position to another in your list.'),

    long_description:
        'Moves a character from one position to another in your list.\n\n' +
        '**Usage:** `/move char: <char> position: <position>`\n\n' +
        '__**Options:**__\n' +
        '*char:* The character to move. Can be an index or position. (Required)\n' +
        '*position:* The position to move the character to. (Required)\n\n' +
        'Examples: `/move char: 1 position: 2`',

    async execute(interaction) {
        const c = interaction.options.getString('char')!;
        const pos = interaction.options.getInteger('position')!;
        const embed = new EmbedBuilder({
            title: 'Waiting for selection...',
            color: Colors.Yellow,
        });
        await interaction.reply({ embeds: [embed], flags: MessageFlags.Ephemeral });
        embed.setColor(Colors.Red);
        const char = await search_character(interaction, interaction.user.id, c, false);
        if (char === null) {
            return interaction.deleteReply();
        } else if (!char) {
            embed.setTitle(`Character not found with name \`${c}\`.`);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        } else if (char === NO_NUM) {
            embed.setTitle(`Character not found with index \`${c}\`.`);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        } else if (char.idx === pos) {
            embed.setTitle(`${char.name} is already at that position.`);
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        const success = await DB.moveUserCharacter(char, pos);
        if (!success) {
            embed.setTitle('Position is out of range.');
            return interaction.editReply({ embeds: [embed] }).then(Utils.VOID);
        }
        embed.setTitle(`${char.getWFC(interaction.channel!)} ${char.name} ` +
            `${char.getGender()} is now at position ${pos}`)
            .setColor(Colors.Gold);
        await interaction.editReply({ embeds: [embed] });
    },
});

type SubmissionCache = {
    mid: string;
    uid: string;
    readonly data: DB.PartialWaifu;
};
// I'm out of names
type ImpartialWaifu = {
    name?: string;
    gender?: 'Male' | 'Female' | 'Unknown';
    origin?: string;
    img: string[];
    nimg: string[];
};
const submit_privates = {
    // Helper to generate a random, unique filename
    uniqueFileName(ext: string) {
        let id = 0;
        let test = `./files/tmp${id++}${ext}`;
        while (fs.existsSync(test)) {
            test = `./files/tmp${id++}${ext}`;
        }
        return test;
    },

    secretButtons: new ActionRowBuilder<ButtonBuilder>({
        components: [
            new ButtonBuilder({
                label: 'Approve',
                customId: 'submit/0/approve',
                style: ButtonStyle.Success,
            }),
            new ButtonBuilder({
                label: 'Edit',
                customId: 'submit/0/edit',
                style: ButtonStyle.Primary,
            }),
            new ButtonBuilder({
                label: 'Upload to CDN',
                customId: 'submit/0/upload',
                style: ButtonStyle.Secondary,
            }),
            new ButtonBuilder({
                label: 'Reject',
                customId: 'submit/0/reject',
                style: ButtonStyle.Danger,
            }),
        ],
    }),

    // ?????????
    input: new ModalBuilder({
        title: 'Add new character',
        customId: 'submit',
        components: [
            new ActionRowBuilder<TextInputBuilder>({
                components: [
                    new TextInputBuilder({
                        label: "Character's name",
                        customId: 'name',
                        placeholder: "Enter the character's name",
                        style: TextInputStyle.Short,
                        maxLength: 100,
                        required: true,
                    }),
                ],
            }),
            new ActionRowBuilder<TextInputBuilder>({
                components: [
                    new TextInputBuilder({
                        label: "Character's gender",
                        customId: 'gender',
                        placeholder: 'Female, Male, or Unknown',
                        style: TextInputStyle.Short,
                        maxLength: 7, // Length of "Unknown"
                        required: true,
                    }),
                ],
            }),
            new ActionRowBuilder<TextInputBuilder>({
                components: [
                    new TextInputBuilder({
                        label: 'Anime name',
                        customId: 'origin',
                        placeholder: "Enter the anime's name",
                        style: TextInputStyle.Short,
                        maxLength: 100,
                        required: true,
                    }),
                ],
            }),
            new ActionRowBuilder<TextInputBuilder>({
                components: [
                    new TextInputBuilder({
                        label: 'Normal image',
                        customId: 'img',
                        placeholder: 'Separate images by lines.',
                        style: TextInputStyle.Paragraph,
                        maxLength: 2000,
                        required: false,
                    }),
                ],
            }),
            new ActionRowBuilder<TextInputBuilder>({
                components: [
                    new TextInputBuilder({
                        label: 'Lewd image',
                        customId: 'nimg',
                        placeholder: 'Separate images by lines.',
                        style: TextInputStyle.Paragraph,
                        maxLength: 2000,
                        required: false,
                    }),
                ],
            }),
        ],
    }),

    async getWaifuInfoEmbed(client: Client, submission: SubmissionCache) {
        const user = await client.users.fetch(submission.uid);
        const waifu = await DB.fetchWaifuByDetails(submission.data);
        const is_new_origin = await DB.fetchCompleteOrigin(submission.data.origin);
        const embed = new EmbedBuilder({
            title: 'Character Submission',
            color: Colors.Aqua,
        }).setAuthor({
            name: `@${user.tag}`,
            iconURL: user.displayAvatarURL(),
        });
        return embed.setDescription(
            `**Name:** __${submission.data.name}__\n` +
            `**Gender:** __${submission.data.gender}__\n` +
            `**Origin:** __${submission.data.origin}__${is_new_origin ? ' (existing anime)' : ''}\n` +
            `**\\# of img:** ${waifu ? `${waifu.img.length + submission.data.img.length} ` +
                `(+${submission.data.img.length})` : submission.data.img.length}\n\n` +
            `${submission.data.img.join('\n\n')}\n\n` +
            `**\\# of nimg:** ${waifu ? `${waifu.nimg.length + submission.data.nimg.length} ` +
                `(+${submission.data.nimg.length})` : submission.data.nimg.length}\n\n` +
            `${submission.data.nimg.join('\n\n')}`,
        );
    },

    async searchWaifu(interaction: ModalSubmitInteraction, embed: EmbedBuilder): Promise<ImpartialWaifu | undefined> {
        await interaction.deferUpdate();

        const waifu_name = interaction.fields.getTextInputValue('name').trim();
        // Search waifu by name
        const waifus = await DB.searchWaifuByName(waifu_name);
        const waifu = await Utils.get_results(
            interaction, waifus,
            {
                title_fmt: idx => `Found ${idx} waifus matching your query!`,
                desc_fmt: choice => `⭐ **${choice.name}** from *${choice.origin}*`,
                sel_fmt: choice => `⭐ ${choice.name}`,
            },
        );
        if (waifu === null) {
            return;
        } else if (!waifu) {
            return interaction.followUp({
                content: `No waifu found with name \`${waifu_name}\``,
                flags: MessageFlags.Ephemeral,
            }).then(() => undefined);
        }
        embed.setDescription(
            `⭐ **${waifu.name}**${waifu.getGender()}\n` +
            `__From:__ ${waifu.origin}\n` +
            `__Number of Normal Images:__ **${waifu.img.length}**\n` +
            `__Number of Lewd images:__ **${waifu.nimg.length}**`,
        ).setImage(waifu.img[0]).setTitle('Waifu Selection');
        return {
            name: waifu.name,
            origin: waifu.origin,
            gender: DB.fromGenderTypes(waifu.gender),
            img: [],
            nimg: [],
        };
    },

    async searchAnime(interaction: ModalSubmitInteraction, embed: EmbedBuilder): Promise<ImpartialWaifu | undefined> {
        await interaction.deferUpdate();

        const name = interaction.fields.getTextInputValue('name').trim();
        const animes_found = await DB.searchOriginByName(name);
        const series = await Utils.get_results(
            interaction, animes_found,
            {
                title_fmt: len => `Found ${len} anime(s):`,
                desc_fmt: choice => `**${choice}**`,
            },
        );
        if (series === null) {
            return;
        } else if (!series) {
            return interaction.followUp({
                content: `No anime found with name \`${name}\`.`,
                flags: MessageFlags.Ephemeral,
            }).then(() => undefined);
        }
        const anime_chars = await DB.getAnime(series);
        let desc = `__Anime found:__\n*${series}*\n\n**Found ${anime_chars.length} character(s):**\n`;
        for (const [idx, waifu] of anime_chars.entries()) {
            desc += `${idx + 1}. ⭐ [${waifu.name}](${waifu.img[0]})${waifu.getGender()}\n`;
        }
        embed.setTitle('Anime Selection').setDescription(desc).setImage(null);
        return {
            origin: series,
            img: [],
            nimg: [],
        };
    },

    async startSubmit(interaction: ButtonInteraction, data: ImpartialWaifu, uid: string) {
        // Real submission starts here.
        // Converting into a new object is the only way to deep copy.
        const modalInput = new ModalBuilder(this.input.toJSON());
        modalInput.setCustomId(`submit/${uid}`);
        if (data.name && data.gender && data.origin) {
            modalInput.setTitle('Edit character');
        } else if (data.origin) {
            modalInput.setTitle('Add new character to anime');
        }
        modalInput.components[0].components[0].setValue(data.name ?? '');
        modalInput.components[1].components[0].setValue(data.gender ?? '');
        modalInput.components[2].components[0].setValue(data.origin ?? '');
        modalInput.components[3].components[0].setValue(data.img.join('\n'));
        modalInput.components[4].components[0].setValue(data.nimg.join('\n'));
        return interaction.showModal(modalInput);
    },

    deserialize(data: NodePgJsonSerialized<SubmissionCache>): SubmissionCache {
        return {
            ...data,
        };
    },
};
export const submit = new SlashCommandNoSubcommand<SubmissionCache>({
    data: new SlashCommandBuilder()
        .setName('submit')
        .setDescription('Create a submission request to add a character.'),

    long_description:
        'Want to add a character that is not currently in the starred database?\n' +
        'You came to the right command!\n' +
        'Simply just follow these rules:\n\n' +
        '__**Character Submission Rules:**__\n' +
        '1. The character must have an **anime name**. If it has no anime, it goes under "Originals"\n' +
        '2. If the character is from an **anime** that already exists, use the anime searcher.\n' +
        "3. The character's **gender** must be one of: `Male`, `Female`, `Unknown`.\n" +
        '4. If its a new character, the character must have at least **one normal image**.\n' +
        'When using submit character or anime, values will be prepopulated in the modal. ' +
        '**DO NOT CHANGE THESE.**\n\n' +
        'Usage: `/submit`',

    async buttonReact(interaction) {
        // This handles the button presses from me, the owner that will approve/reject submissions
        const msg = interaction.message;
        if (!msg) return interaction.update({ content: 'Removed.' }).then(m => m.delete());
        const submission = await this.cache.get(msg.id);
        if (!submission) return interaction.update({ content: 'Cache lost.' }).then(m => m.delete());
        const user = await interaction.client.users.fetch(submission.uid).catch(Utils.VOID);
        if (!user) return msg.delete().then(Utils.VOID);
        const action = interaction.customId.split('/')[2];
        const { name, gender, origin, img, nimg } = submission.data;
        const characterInfo = '```' + `Name: ${name}\nGender: ${gender}\nAnime: ${origin}\n` +
            `Normal Images: ${img.length}\nLewd Images: ${nimg.length}` + '```';

        if (action === 'reject') {
            const input = new ModalBuilder({
                title: 'Add new character',
                customId: 'submitRejectReason',
                components: [
                    new ActionRowBuilder<TextInputBuilder>({
                        components: [
                            new TextInputBuilder({
                                label: 'Reason',
                                customId: 'reason',
                                placeholder: 'Enter the reason for rejection:',
                                style: TextInputStyle.Paragraph,
                                value: 'Invalid character provided.',
                                maxLength: 2000,
                                required: true,
                            }),
                        ],
                    }),
                ],
            });
            await interaction.showModal(input);
            return interaction.awaitModalSubmit({
                filter: s => s.customId === input.data.custom_id,
                time: 5 * 60 * 1000, // 5 minutes to allow for a reason
            }).then(async i => {
                await i.deferUpdate();
                const reason = i.fields.getTextInputValue('reason');
                await user.send({
                    content: `__Your submission for:__ ${characterInfo}` +
                        `Has been **rejected**!\n**Reason**: ${reason}`,
                }).catch(Utils.VOID);
                return i.deleteReply();
            }).catch(Utils.VOID);
        } else if (action === 'approve') {
            await interaction.update({ components: [] });
            if (img.some(i => !i.startsWith(config.cdn)) ||
                nimg.some(i => !i.startsWith(config.cdn))) {
                await interaction.followUp({
                    content: 'Submission has invalid images! Please fix!',
                    flags: MessageFlags.Ephemeral,
                });
                await interaction.editReply({ components: [submit_privates.secretButtons] });
                return;
            }
            // Use IDs for images instead of full link
            submission.data.img.forEach((i, idx, arr) => {
                arr[idx] = i.replace(`${config.cdn}/images/`, '');
            });
            submission.data.nimg.forEach((i, idx, arr) => {
                arr[idx] = i.replace(`${config.cdn}/images/`, '');
            });
            const waifu = await DB.fetchWaifuByDetails(submission.data);
            const new_waifu = await DB.insertWaifu(submission.data).catch(err => {
                interaction.editReply({ components: [submit_privates.secretButtons] });
                throw err;
            });
            const newCharacterInfo =
                '```' +
                `Name: ${name}\nGender: ${gender}\nAnime: ${origin}\n` +
                `Normal Images: ${new_waifu.img.length}${waifu ? ` (+${img.length})` : ''}\n` +
                `Lewd Images: ${new_waifu.nimg.length}${waifu ? ` (+${nimg.length})` : ''}` +
                '```';
            await user.send({
                content: `__Your submission for:__ ${newCharacterInfo}Has been **accepted**!`,
            }).catch(Utils.VOID);
            const new_characters_log = await interaction.client.channels.fetch(
                new_characters_log_id,
            ) as GuildTextBasedChannel;
            if (waifu) {
                await new_characters_log.send({
                    content: `Images added to character by ${user} ` +
                        `(accepted by ${interaction.user}):\n${newCharacterInfo}`,
                });
            } else {
                await new_characters_log.send({
                    content: `New character added by ${user} ` +
                        `(accepted by ${interaction.user}):\n${newCharacterInfo}`,
                });
            }
            await msg.delete();
        } else if (action === 'upload') {
            await interaction.update({ components: [] });
            // Upload images asynchronously
            const imgs: string[] = await Promise.all([...img, ...nimg].map(async url => {
                // Do not re-upload CDN images.
                if (url.startsWith(config.cdn)) {
                    return url;
                }
                // Use our helper to get the image data.
                const { images, source } = await getRawImageLink(url).catch(() => ({ images: [url], source: url }));
                const { ext, blob } = await getImage(images[0]);

                const formdata = new FormData();
                formdata.append('images', blob, `tmp.${ext}`);
                // Won't automatically add url as source
                // if the url is to a raw image; must be manually updated.
                if (images[0] !== source) {
                    formdata.append('sources', url);
                }
                // Upload to our CDN and get url back.
                const [uploaded_url] = await uploadToCDN(formdata);
                if (uploaded_url) {
                    return uploaded_url;
                } else {
                    return url;
                }
            }));
            submission.data.img = imgs.splice(0, img.length);
            submission.data.nimg = imgs.splice(0, nimg.length);
            await this.cache.set(msg.id, submission);
            const embed = await submit_privates.getWaifuInfoEmbed(interaction.client, submission);
            await interaction.editReply({ embeds: [embed], components: [submit_privates.secretButtons] });
        } else if (action === 'edit') {
            return submit_privates.startSubmit(interaction, { name, gender, origin, img, nimg }, submission.uid);
        } else {
            throw new Error(`No action found for button with custom id: ${interaction.customId}`);
        }
    },

    async textInput(interaction) {
        // This handles the actual submission from the user
        await interaction.deferUpdate();
        const submission = await this.cache.get(interaction.message?.id ?? '');
        const uid = interaction.customId.split('/')[1];
        const name = interaction.fields.getTextInputValue('name').trim();
        let gender = interaction.fields.getTextInputValue('gender').trim();
        let origin = interaction.fields.getTextInputValue('origin').trim();
        // This cleans up all trailing and leading whitespace
        const img = interaction.fields.getTextInputValue('img').trim()
            .split('\n').map(x => x.trim()).filter(x => x !== '');
        const nimg = interaction.fields.getTextInputValue('nimg').trim()
            .split('\n').map(x => x.trim()).filter(x => x !== '');
        gender = gender.charAt(0).toUpperCase() + gender.toLowerCase().slice(1);
        if (gender !== 'Female' && gender !== 'Male' && gender !== 'Unknown') {
            return interaction.followUp({
                content: 'Gender must be one of `Female`, `Male` or `Unknown`!',
                flags: MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        // Ensure that they meant to add to the anime, rather than creating a new one.
        const complete_origin = await DB.fetchCompleteOrigin(origin);
        if (complete_origin && complete_origin !== origin) origin = complete_origin;

        const data: DB.PartialWaifu = { name, gender, origin, img, nimg };
        const waifu = await DB.fetchWaifuByDetails(data);
        if (img.length === 0 && nimg.length === 0) {
            return interaction.followUp({
                content: 'You must submit at least 1 image!',
                flags: MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        } else if (!waifu && img.length === 0) {
            return interaction.followUp({
                content: 'New waifus must have at least 1 normal image!',
                flags: MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        const submission_log = await interaction.client.channels.fetch(submission_log_id) as GuildTextBasedChannel;
        const new_submission = { mid: '', uid, data };
        const embed = await submit_privates.getWaifuInfoEmbed(interaction.client, new_submission);

        if (submission) interaction.deleteReply();
        else interaction.followUp({ content: 'Received!', flags: MessageFlags.Ephemeral });
        const content = waifu ?
            'A wild **character update** has appeared!' :
            'A wild **new submission** has appeared!';
        const msg = await submission_log.send({
            content: content,
            embeds: [embed],
            components: [submit_privates.secretButtons],
        });
        new_submission.mid = msg.id;
        return this.cache.set(msg.id, new_submission);
    },

    async execute(interaction) {
        let uid = interaction.user.id;
        // Admins can submit on behalf of other users.
        if (uid === interaction.client.admin.id) {
            const modal = new ModalBuilder({
                title: 'Admin Submission',
                customId: 'submitAdmin',
                components: [
                    new ActionRowBuilder<TextInputBuilder>({
                        components: [
                            new TextInputBuilder({
                                label: 'User ID',
                                customId: 'uid',
                                value: uid,
                                style: TextInputStyle.Short,
                                maxLength: 100,
                                required: true,
                            }),
                        ],
                    }),
                ],
            });
            await interaction.showModal(modal);
            const res = await interaction.awaitModalSubmit({
                filter: s => s.customId === modal.data.custom_id,
                time: 15 * 60 * 1_000, // Wait for 15 mins max
            }).catch(Utils.VOID);
            if (!res) return;
            uid = res.fields.getTextInputValue('uid');
            interaction = res as unknown as ChatInputCommandInteraction;
        }
        await interaction.deferReply({ flags: MessageFlags.Ephemeral });
        const embed = new EmbedBuilder({
            title: 'No Selection',
            description: 'Click select now to start an empty submission.',
            footer: {
                text: 'Click the button to search for a waifu or use the current waifu to submit!',
            },
            color: Colors.Gold,
        });
        const buttons = new ActionRowBuilder<ButtonBuilder>({
            components: [
                new ButtonBuilder({
                    label: 'Search for waifu',
                    customId: 'searchWaifu',
                    style: ButtonStyle.Primary,
                    emoji: '🔎',
                }),
                new ButtonBuilder({
                    label: 'Search for anime',
                    customId: 'searchOrigin',
                    style: ButtonStyle.Primary,
                    emoji: '📺',
                }),
            ],
        });
        const buttons2 = new ActionRowBuilder<ButtonBuilder>({
            components: [
                new ButtonBuilder({
                    label: 'Submit new waifu',
                    customId: 'selectWaifu',
                    style: ButtonStyle.Success,
                    emoji: '✅',
                }),
                new ButtonBuilder({
                    label: 'Clear selection',
                    customId: 'clearWaifu',
                    style: ButtonStyle.Danger,
                    emoji: '🚮',
                    disabled: true,
                }),
            ],
        });
        const message = await interaction.editReply({ embeds: [embed], components: [buttons, buttons2] });
        // Can be changed for img/nimg input with command.
        let waifu: ImpartialWaifu = { img: [], nimg: [] };
        let id = 0;
        message.createMessageComponentCollector({
            componentType: ComponentType.Button,
            time: 15 * 60 * 1_000, // Cleanup after 15 mins bc expired
        }).on('collect', async i => {
            // Selected, we can submit.
            if (i.customId === 'selectWaifu') {
                return submit_privates.startSubmit(i, waifu, uid);
            } else if (i.customId === 'searchWaifu') {
                // Search for waifu
                const modal = new ModalBuilder({
                    title: 'Waifu Search',
                    customId: `submitSearchWaifu${id++}`, // Fixes a very specific bug
                    components: [
                        new ActionRowBuilder<TextInputBuilder>({
                            components: [
                                new TextInputBuilder({
                                    label: "Character's name",
                                    customId: 'name',
                                    placeholder: 'Enter the name of the character',
                                    style: TextInputStyle.Short,
                                    maxLength: 100,
                                    required: true,
                                }),
                            ],
                        }),
                    ],
                });
                // Create modal to let user input.
                await i.showModal(modal);
                const res = await i.awaitModalSubmit({
                    filter: s => s.customId === modal.data.custom_id,
                    time: 10 * 60 * 1_000, // Wait for 10 mins max to ensure interaction doesn't expire
                }).catch(Utils.VOID);
                if (!res) return i.deleteReply(); // Timed out, took too long
                // Waifu submit search
                waifu = await submit_privates.searchWaifu(res, embed).then(w => {
                    if (!w) return waifu;
                    buttons2.components[0].setLabel('Select this waifu');
                    buttons2.components[1].setDisabled(false);
                    interaction.editReply({ embeds: [embed], components: [buttons, buttons2] });
                    return {
                        name: w.name,
                        gender: w.gender,
                        origin: w.origin,
                        img: waifu.img,
                        nimg: waifu.nimg,
                    };
                });
            } else if (i.customId === 'searchOrigin') {
                // Search for anime
                const modal = new ModalBuilder({
                    title: 'Anime Search',
                    customId: `submitSearchOrigin${id++}`, // Fixes a very specific bug
                    components: [
                        new ActionRowBuilder<TextInputBuilder>({
                            components: [
                                new TextInputBuilder({
                                    label: 'Anime name',
                                    customId: 'name',
                                    placeholder: 'Enter the name of the anime',
                                    style: TextInputStyle.Short,
                                    maxLength: 200,
                                    required: true,
                                }),
                            ],
                        }),
                    ],
                });
                // Create modal to let user input.
                await i.showModal(modal);
                const res = await i.awaitModalSubmit({
                    filter: s => s.customId === modal.data.custom_id,
                    time: 10 * 60 * 1_000, // Wait for 10 mins max
                }).catch(Utils.VOID);
                if (!res) return i.deleteReply(); // Timed out, took too long
                // Anime submit search
                waifu = await submit_privates.searchAnime(res, embed).then(w => {
                    if (!w) return waifu;
                    buttons2.components[0].setLabel('Select this anime');
                    buttons2.components[1].setDisabled(false);
                    interaction.editReply({ embeds: [embed], components: [buttons, buttons2] });
                    return {
                        origin: w.origin,
                        img: waifu.img,
                        nimg: waifu.nimg,
                    };
                });
            } else if (i.customId === 'clearWaifu') {
                await i.deferUpdate();
                // Clear all the waifu data
                waifu = { img: waifu.img, nimg: waifu.nimg };
                buttons2.components[0].setLabel('Submit new waifu');
                buttons2.components[1].setDisabled(true);
                embed.setTitle('No Selection')
                    .setDescription('Click select now to start an empty submission.')
                    .setImage(null);
                await interaction.editReply({ embeds: [embed], components: [buttons, buttons2] });
            } else {
                throw new Error('Unknown button pressed.');
            }
        });
    },
});
