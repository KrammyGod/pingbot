import * as Utils from '@modules/utils';
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, Colors,
    ComponentType, EmbedBuilder, ModalBuilder, SlashCommandBuilder,
    StringSelectMenuBuilder, TextInputBuilder, TextInputStyle
} from 'discord.js';
import { isMessageCommand, isSlashCommand, isSlashSubcommandGroup } from '@classes/client';
import DTypes from 'discord.js';
import type { CommandFile, CustomClient, SlashCommand } from '@classes/client';

export const name = 'Help';
export const desc = 'This is a special category dedicated for you!';

// Helper to replace all `/command` with new shiny command mention.
const asyncReplace = (str: string, regex: RegExp, replace_fn: (match: string) => Promise<string>) => {
    const promises: Promise<string>[] = [];
    str.replace(regex, match => {
        promises.push(replace_fn(match));
        return '';
    });
    return Promise.all(promises).then(replacements => {
        let i = 0;
        return str.replace(regex, () => replacements[i++]);
    });
};

// Since help is just a single command, all helpers are globally scoped
async function get_results_category(
    client: CustomClient,
    interaction: DTypes.RepliableInteraction,
    choices: CommandFile[]
) {
    if (choices.length === 0) return undefined;
    else if (choices.length === 1) return choices[0];

    // Take first 10 results
    choices = choices.splice(0, 10);
    const res_title = `Found ${choices.length} categories:`;
    const menu = new StringSelectMenuBuilder()
        .setPlaceholder('Select one to proceed.')
        .setCustomId('filter');
    // Create embed
    const embed = new EmbedBuilder({
        title: 'Search Results',
        color: Colors.Yellow
    }).setAuthor({
        name: `@${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL()
    }).setFooter({ text: 'Select a choice or click cancel.' });
    let desc = '';
    for (const [idx, choice] of choices.entries()) {
        desc += `${idx + 1}. **${choice.name}**\n`;
        menu.addOptions({
            label: `${idx + 1}. ${choice.name}`,
            value: `${idx}`
        });
    }
    embed.setDescription(`__${res_title}__\n${desc}`);
    menu.addOptions({ label: 'Cancel.', value: '-1' });

    const message = await interaction.followUp({
        embeds: [embed],
        components: [new ActionRowBuilder<DTypes.StringSelectMenuBuilder>().addComponents(menu)],
        ephemeral: true
    });

    // Return promise to let caller await it.
    const res = await message.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 60_000 })
        .then(i => {
            if (i.values[0] === '-1') return null;
            return choices[parseInt(i.values[0])];
        }).catch(() => null);
    Utils.delete_ephemeral_message(interaction, message);
    return res;
}

type FullCommand = {
    name: string;
    desc: string;
    is_slash: boolean;
};
async function get_results_cmd(client: CustomClient, interaction: DTypes.RepliableInteraction, search: string) {
    let choices: FullCommand[] = [];
    for (const cmd of [...client.commands.values(), ...client.message_commands.values()]) {
        if (isMessageCommand(cmd)) {
            choices.push({
                name: cmd.name,
                desc: cmd.desc,
                is_slash: false
            });
        } else if (isSlashCommand(cmd)) {
            if (cmd.subcommands) {
                for (const subcmd of cmd.subcommands.values()) {
                    if (isSlashSubcommandGroup(subcmd)) {
                        for (const subsubcmd of subcmd.subcommands.values()) {
                            choices.push({
                                name: `${cmd.data.name} ${subcmd.data.name} ${subsubcmd.data.name}`,
                                desc: subsubcmd.desc,
                                is_slash: true
                            });
                        }
                    } else {
                        choices.push({
                            name: `${cmd.data.name} ${subcmd.data.name}`,
                            desc: subcmd.desc,
                            is_slash: true
                        });
                    }
                }
            } else {
                choices.push({
                    name: cmd.data.name,
                    desc: cmd.desc,
                    is_slash: true
                });
            }
        }
    }
    choices = choices.filter(cmd => cmd.name.toLowerCase().includes(search.toLowerCase())).sort();

    if (choices.length === 0) return undefined;
    else if (choices.length === 1) return choices[0];

    // Take first 10 results
    choices = choices.splice(0, 10);
    const res_title = `Found ${choices.length} commands:`;
    const menu = new StringSelectMenuBuilder()
        .setPlaceholder('Select one to proceed.')
        .setCustomId('filter');
    // Create embed
    const embed = new EmbedBuilder({
        title: 'Search Results',
        color: Colors.Yellow
    }).setAuthor({
        name: `@${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL()
    }).setFooter({ text: 'Select a choice or click cancel.' });
    let desc = '';
    for (const [idx, choice] of choices.entries()) {
        if (isSlashCommand(choice)) {
            desc += `${idx + 1}. **${choice.data.name}**\n`;
        } else {
            desc += `${idx + 1}. **${choice.name}**\n`;
        }
        menu.addOptions({
            label: `${idx + 1}. ${isSlashCommand(choice) ? choice.data.name : choice.name}`,
            value: `${idx}`
        });
    }
    embed.setDescription(`__${res_title}__\n${desc}`);
    menu.addOptions({ label: 'Cancel.', value: '-1' });

    const message = await interaction.followUp({
        embeds: [embed],
        components: [new ActionRowBuilder<DTypes.StringSelectMenuBuilder>().addComponents(menu)],
        ephemeral: true
    });

    // Return promise to let caller await it.
    const res = await message.awaitMessageComponent({ componentType: ComponentType.StringSelect, time: 60_000 })
        .then(i => {
            if (i.values[0] === '-1') return null;
            return choices[parseInt(i.values[0])];
        }).catch(() => null);
    Utils.delete_ephemeral_message(interaction, message);
    return res;
}

type HelperRetVal = {
    embeds: DTypes.EmbedBuilder[],
    components?: DTypes.ActionRowBuilder<DTypes.MessageActionRowComponentBuilder>[],
    followUp?: {
        embeds: DTypes.EmbedBuilder[],
        ephemeral: true
    }
};
async function get_cog_page(client: CustomClient, authorID: string, page: number): Promise<HelperRetVal> {
    const max_pages = client.cogs.length;
    const embed = new EmbedBuilder({
        title: '__All Commands:__',
        color: Colors.Aqua
    }).setFooter({
        text: 'Send me a direct message to create a ticket anytime!'
    });
    // This represents any followup messages that should be sent
    const followUp: {
        embeds: DTypes.EmbedBuilder[],
        ephemeral: true
    } = {
        embeds: [],
        ephemeral: true
    };

    if (max_pages === 0) {
        embed.setDescription(`Page 0/${max_pages}`).setFields({
            name: '**No Commands found. :(**',
            value: "Why don't you contact the support server?"
        });
        return { embeds: [embed] };
    } else if (page < 1) {
        const error_embed = new EmbedBuilder({
            color: Colors.Red,
            title: 'Please enter a positive number.'
        });
        followUp.embeds.push(error_embed);
        page = 1;
    } else if (page > max_pages) {
        const error_embed = new EmbedBuilder({
            color: Colors.Red,
            title: `Too high. Max page: ${max_pages}`
        });
        followUp.embeds.push(error_embed);
        page = max_pages;
    }

    embed.setDescription(`Page ${page}/${max_pages}`);
    let field = '';
    const cog = client.cogs[page - 1];
    for (const command of cog.commands) {
        if (isSlashCommand(command)) {
            const commands: { name: string; description: string; }[] = [];
            // Try to add all subcommands to list
            for (const subcommand of command.subcommands?.values() ?? []) {
                if (isSlashSubcommandGroup(subcommand)) {
                    for (const subsubcommand of subcommand.subcommands.values()) {
                        commands.push({
                            name: `${command.data.name} ${subcommand.data.name} ${subsubcommand.data.name}`,
                            description: subsubcommand.data.description
                        });
                    }
                } else {
                    commands.push({
                        name: `${command.data.name} ${subcommand.data.name}`,
                        description: subcommand.data.description
                    });
                }
            }
            // No subcommands, then only main command left.
            if (!commands.length) commands.push(command.data);
            for (const cmd of commands) {
                const app_cmd = await Utils.get_rich_cmd(cmd.name);
                field += `> ${app_cmd} - ${cmd.description}\n`;
            }
        } else if (isMessageCommand(command)) {
            // Replace all `/command` with new shiny command mention.
            const replace_fn = (match: string) => {
                const full_name = match.slice(2, -1);
                return Utils.get_rich_cmd(full_name);
            };
            // Don't ask me about the regex, it was way too long ago...
            // Shouldn't be that hard to figure out though...
            const desc = await asyncReplace(command.desc, /{\/[\S]+(?: [\S]+)?}/g, replace_fn);
            field += `> \`${client.prefix}${command.name}\` - ${desc}\n`;
        }
    }
    if (field.length <= 1024) {
        embed.addFields({
            name: `__**${cog.name}:**__\n**${cog.desc}**`,
            value: field,
            inline: true
        });
    } else {
        embed.setDescription(
            `${embed.data.description}\n\n__**${cog.name}:**__\n**${cog.desc}**\n${field}`
        );
    }
    const row = new ActionRowBuilder<DTypes.ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setEmoji('⏪')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`help/${authorID}/1`),
        new ButtonBuilder()
            .setEmoji('⬅️')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`help/${authorID}/${page - 1}/`),
        new ButtonBuilder()
            .setEmoji('➡️')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`help/${authorID}/${page + 1}/`),
        new ButtonBuilder()
            .setEmoji('⏩')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`help/${authorID}/${max_pages}//`),
        new ButtonBuilder()
            .setEmoji('❓')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`help/${authorID}/help/cog`)
    );
    const row2 = new ActionRowBuilder<DTypes.ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setEmoji('📄')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`help/${authorID}/input/cog`),
        new ButtonBuilder()
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`help/${authorID}/input/cmd`),
    );
    if (page === 1) {
        row.components[0].setDisabled(true);
        row.components[1].setDisabled(true);
    }
    if (page === max_pages) {
        row.components[2].setDisabled(true);
        row.components[3].setDisabled(true);
    }
    const retval: HelperRetVal = {
        embeds: [embed],
        components: [row, row2]
    };
    if (followUp.embeds.length > 0) {
        retval.followUp = followUp;
    }
    return retval;
}

async function get_cmd_page(client: CustomClient, authorID: string, command: FullCommand):
    Promise<HelperRetVal> {
    const cmd_tag = command.is_slash ?
        await Utils.get_rich_cmd(command.name) :
        `\`${client.prefix}${command.name}\``;
    const embed = new EmbedBuilder({
        title: `__Command ${cmd_tag}__`,
        color: Colors.Aqua
    }).setFooter({
        text:
            'Options surrounded with <> are required, and [] are optional.\n' +
            'Send me a direct message to create a ticket anytime!'
    });

    // Replace all `/command` with new shiny command mention.
    const replace_fn = (match: string) => Utils.get_rich_cmd(match.slice(2, -1));
    // Don't ask me about the regex, it was way too long ago...
    // Shouldn't be that hard to figure out though...
    const desc = await asyncReplace(command.desc, /{\/[\S]+(?: [\S]+)?}/g, replace_fn);
    embed.setDescription(desc);

    const row = new ActionRowBuilder<DTypes.ButtonBuilder>().addComponents(
        new ButtonBuilder()
            .setEmoji('📄')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`help/${authorID}/input/cog`),
        new ButtonBuilder()
            .setEmoji('🔍')
            .setStyle(ButtonStyle.Primary)
            .setCustomId(`help/${authorID}/input/cmd`),
        new ButtonBuilder()
            .setEmoji('❓')
            .setStyle(ButtonStyle.Secondary)
            .setCustomId(`help/${authorID}/help/cmd`)
    );

    return { embeds: [embed], components: [row] };
}

export const help: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('help')
        .addStringOption(option =>
            option
                .setName('command')
                .setDescription('The command to jump to.'))
        .addStringOption(option =>
            option
                .setName('category')
                .setDescription('The category to jump to.'))
        .setDescription('Use me for help!'),

    desc: 'What does {/help} do? Well, it shows you description messages.\n' +
          '...\n...\n...\n...\n...\n...\n...\n...\n... ' +
          '...   ...  ...like this one...',

    async buttonReact(interaction, client) {
        const [page, cmdName] = interaction.customId.split('/').splice(2);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const input = cmdName === 'cog' ?
                    new ModalBuilder({
                        title: 'Jump/Search Category',
                        customId: `help/${cmdName}`,
                        components: [
                            new ActionRowBuilder<DTypes.TextInputBuilder>({
                                components: [
                                    new TextInputBuilder({
                                        label: 'Name/Page #',
                                        customId: 'value',
                                        placeholder: 'Enter the name/page number to jump to...',
                                        style: TextInputStyle.Short,
                                        maxLength: 100,
                                        required: true
                                    })
                                ]
                            })
                        ]
                    }) :
                    new ModalBuilder({
                        title: 'Search Command',
                        customId: `help/${cmdName}`,
                        components: [
                            new ActionRowBuilder<DTypes.TextInputBuilder>({
                                components: [
                                    new TextInputBuilder({
                                        label: 'Name',
                                        customId: 'value',
                                        placeholder: 'Enter name of command...',
                                        style: TextInputStyle.Short,
                                        maxLength: 100,
                                        required: true
                                    })
                                ]
                            })
                        ]
                    });
                return interaction.showModal(input);
            } else if (page === 'help') {
                if (cmdName === 'cmd') {
                    return interaction.reply({
                        content:
                            '📄: Search and jump to a specific page/category\n' +
                            '🔍: Search and jump to a specific command\n' +
                            '❓: This help message',
                        ephemeral: true
                    }).then(() => { });
                } else if (cmdName === 'cog') {
                    return interaction.reply({
                        content:
                            '⏪: First page\n' +
                            '⬅️: Previous page\n' +
                            '➡️: Next page\n' +
                            '⏩: Last page\n' +
                            '❓: This help message\n' +
                            '📄: Search and jump to a specific page/category\n' +
                            '🔍: Search and jump to a specific command',
                        ephemeral: true
                    }).then(() => { });
                } else {
                    throw new Error(`Command type: ${cmdName} not found.`);
                }
            } else {
                throw new Error(`Button type: ${page} not found.`);
            }
        }
        await interaction.deferUpdate();
        const { embeds, components } = await get_cog_page(client, interaction.user.id, val);
        await interaction.editReply({ embeds, components });
    },

    async textInput(interaction, client) {
        const [cmdName] = interaction.customId.split('/').splice(1);
        const value = interaction.fields.getTextInputValue('value');

        await interaction.deferUpdate();
        if (cmdName === 'cog') {
            const page = parseInt(value);
            if (isNaN(page)) {
                const category = await get_results_category(
                    client,
                    interaction,
                    client.cogs.filter(cog =>
                        cog.name.toLowerCase().includes(value.toLowerCase())
                    ).sort()
                );
                // Either null or undefined, doesn't matter
                if (!category) {
                    const error_embed = new EmbedBuilder({
                        title: `No category with name \`${value.replaceAll('`', '\\`')}\` found.`,
                        color: Colors.Red
                    });
                    return interaction.followUp({ embeds: [error_embed], ephemeral: true }).then(() => { });
                }
                const { embeds, components, followUp } = await get_cog_page(
                    client, interaction.user.id, client.cogs.indexOf(category) + 1
                );
                await interaction.editReply({ embeds, components });
                if (followUp) await interaction.followUp(followUp);
            } else {
                const { embeds, components, followUp } = await get_cog_page(
                    client, interaction.user.id, page
                );
                await interaction.editReply({ embeds, components });
                if (followUp) await interaction.followUp(followUp);
            }
        } else if (cmdName === 'cmd') {
            const command = await get_results_cmd(client, interaction, value);
            // Either null or undefined, doesn't matter
            if (!command) {
                const error_embed = new EmbedBuilder({
                    title: `No command with name \`${value.replaceAll('`', '\\`')}\` found.`,
                    color: Colors.Red
                });
                return interaction.followUp({ embeds: [error_embed], ephemeral: true }).then(() => { });
            }
            const res = await get_cmd_page(client, interaction.user.id, command);
            await interaction.editReply(res);
        } else {
            throw new Error(`Command type: ${cmdName} not found.`);
        }
    },

    async execute(interaction, client) {
        const commandName = interaction.options.getString('command');
        const categoryName = interaction.options.getString('category');
        const embed = new EmbedBuilder({
            title: 'Performing intensive calculations...',
            color: Colors.Yellow
        });
        // Admin invokes are not ephemeral.
        await interaction.reply({
            embeds: [embed],
            ephemeral: interaction.user.id !== client.admin.id
        });
        let res: HelperRetVal;
        if (commandName) {
            const command = await get_results_cmd(client, interaction, commandName);
            if (command === null) {
                return interaction.deleteReply();
            } else if (!command) {
                const error_embed = new EmbedBuilder({
                    title: `No command with name \`${commandName.replaceAll('`', '\\`')}\` found.`,
                    color: Colors.Red
                });
                return interaction.editReply({ embeds: [error_embed] }).then(() => { });
            }
            res = await get_cmd_page(client, interaction.user.id, command);
        } else if (categoryName) {
            const category = await get_results_category(
                client,
                interaction,
                client.cogs.filter(cog =>
                    cog.name.toLowerCase().includes(categoryName.toLowerCase())
                ).sort()
            );
            if (category === null) {
                res = await get_cog_page(client, interaction.user.id, 1);
            } else if (!category) {
                const error_embed = new EmbedBuilder({
                    title: `No category with name \`${categoryName.replaceAll('`', '\\`')}\` found.`,
                    color: Colors.Red
                });
                res = await get_cog_page(client, interaction.user.id, 1);
                interaction.followUp({ embeds: [error_embed], ephemeral: true });
            } else {
                res = await get_cog_page(client, interaction.user.id, client.cogs.indexOf(category) + 1);
            }
        } else {
            res = await get_cog_page(client, interaction.user.id, 1);
        }
        const { embeds, components } = res;
        await interaction.editReply({ embeds, components });
    }
};
