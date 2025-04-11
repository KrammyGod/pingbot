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
Object.defineProperty(exports, "__esModule", { value: true });
exports.help = exports.desc = exports.name = void 0;
const Utils = __importStar(require("../modules/utils"));
const discord_js_1 = require("discord.js");
const commands_1 = require("../classes/commands");
exports.name = 'Help';
exports.desc = 'This is a special category dedicated for you!';
// Helper to replace all `/command` with new shiny command mention.
const asyncReplace = (str, regex, replace_fn) => {
    const promises = [];
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
async function get_results_category(interaction, choices) {
    if (choices.length === 0)
        return undefined;
    else if (choices.length === 1)
        return choices[0];
    // Take first 10 results
    choices = choices.splice(0, 10);
    const res_title = `Found ${choices.length} categories:`;
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setPlaceholder('Select one to proceed.')
        .setCustomId('filter');
    // Create embed
    const embed = new discord_js_1.EmbedBuilder({
        title: 'Search Results',
        color: discord_js_1.Colors.Yellow,
    }).setAuthor({
        name: `@${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
    }).setFooter({ text: 'Select a choice or click cancel.' });
    let desc = '';
    for (const [idx, choice] of choices.entries()) {
        desc += `${idx + 1}. **${choice.name}**\n`;
        menu.addOptions({
            label: `${idx + 1}. ${choice.name}`,
            value: `${idx}`,
        });
    }
    embed.setDescription(`__${res_title}__\n${desc}`);
    menu.addOptions({ label: 'Cancel.', value: '-1' });
    const message = await interaction.followUp({
        embeds: [embed],
        components: [
            new discord_js_1.ActionRowBuilder().addComponents(menu),
        ],
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
    // Return promise to let caller await it.
    const res = await message.awaitMessageComponent({ componentType: discord_js_1.ComponentType.StringSelect, time: 60_000 })
        .then(i => {
        if (i.values[0] === '-1')
            return null;
        return choices[parseInt(i.values[0])];
    }).catch(() => null);
    Utils.delete_ephemeral_message(interaction, message);
    return res;
}
async function get_results_cmd(interaction, search) {
    let choices = [];
    const allCommands = [
        ...interaction.client.interaction_commands.values(),
        ...interaction.client.message_commands.values(),
    ];
    for (const cmd of allCommands) {
        if (cmd.isMessageCommand()) {
            choices.push({
                name: cmd.name,
                desc: cmd.long_description,
                is_slash: false,
            });
        }
        else if (cmd.isSlashCommand()) {
            if (cmd.isSlashCommandWithSubcommand()) {
                for (const subcmd of cmd.subcommands.values()) {
                    if (subcmd.isSlashSubcommandGroup()) {
                        for (const subsubcmd of subcmd.subcommands.values()) {
                            choices.push({
                                name: `${cmd.data.name} ${subcmd.data.name} ${subsubcmd.data.name}`,
                                desc: subsubcmd.long_description,
                                is_slash: true,
                            });
                        }
                    }
                    else {
                        choices.push({
                            name: `${cmd.data.name} ${subcmd.data.name}`,
                            desc: subcmd.long_description,
                            is_slash: true,
                        });
                    }
                }
            }
            else {
                choices.push({
                    name: cmd.data.name,
                    desc: cmd.long_description,
                    is_slash: true,
                });
            }
        }
    }
    choices = choices.filter(cmd => cmd.name.toLowerCase().includes(search.toLowerCase())).sort();
    if (choices.length === 0)
        return undefined;
    else if (choices.length === 1)
        return choices[0];
    // Take first 10 results
    choices = choices.splice(0, 10);
    const res_title = `Found ${choices.length} commands:`;
    const menu = new discord_js_1.StringSelectMenuBuilder()
        .setPlaceholder('Select one to proceed.')
        .setCustomId('filter');
    // Create embed
    const embed = new discord_js_1.EmbedBuilder({
        title: 'Search Results',
        color: discord_js_1.Colors.Yellow,
    }).setAuthor({
        name: `@${interaction.user.tag}`,
        iconURL: interaction.user.displayAvatarURL(),
    }).setFooter({ text: 'Select a choice or click cancel.' });
    let desc = '';
    for (const [idx, choice] of choices.entries()) {
        desc += `${idx + 1}. **${choice.name}**\n`;
        menu.addOptions({
            label: `${idx + 1}. ${choice.name}`,
            value: `${idx}`,
        });
    }
    embed.setDescription(`__${res_title}__\n${desc}`);
    menu.addOptions({ label: 'Cancel.', value: '-1' });
    const message = await interaction.followUp({
        embeds: [embed],
        components: [
            new discord_js_1.ActionRowBuilder().addComponents(menu),
        ],
        flags: discord_js_1.MessageFlags.Ephemeral,
    });
    // Return promise to let caller await it.
    const res = await message.awaitMessageComponent({ componentType: discord_js_1.ComponentType.StringSelect, time: 60_000 })
        .then(i => {
        if (i.values[0] === '-1')
            return null;
        return choices[parseInt(i.values[0])];
    }).catch(() => null);
    Utils.delete_ephemeral_message(interaction, message);
    return res;
}
async function get_cog_page(client, authorID, page) {
    const max_pages = client.cogs.length;
    const embed = new discord_js_1.EmbedBuilder({
        title: '__All Commands:__',
        color: discord_js_1.Colors.Aqua,
    }).setFooter({
        text: 'Send me a direct message to create a ticket anytime!',
    });
    // This represents any followup messages that should be sent
    const followUp = {
        embeds: [],
        flags: discord_js_1.MessageFlags.Ephemeral,
    };
    if (max_pages === 0) {
        embed.setDescription(`Page 0/${max_pages}`).setFields({
            name: '**No Commands found. :(**',
            value: "Why don't you contact the support server?",
        });
        return { embeds: [embed] };
    }
    else if (page < 1) {
        const error_embed = new discord_js_1.EmbedBuilder({
            color: discord_js_1.Colors.Red,
            title: 'Please enter a positive number.',
        });
        followUp.embeds.push(error_embed);
        page = 1;
    }
    else if (page > max_pages) {
        const error_embed = new discord_js_1.EmbedBuilder({
            color: discord_js_1.Colors.Red,
            title: `Too high. Max page: ${max_pages}`,
        });
        followUp.embeds.push(error_embed);
        page = max_pages;
    }
    embed.setDescription(`Page ${page}/${max_pages}`);
    let field = '';
    const cog = client.cogs[page - 1];
    for (const command of cog.displayed_commands) {
        if (command.isSlashCommand()) {
            const commands = [];
            if (command.isSlashCommandWithSubcommand()) {
                // Try to add all subcommands to list
                for (const subcommand of command.subcommands.values() ?? []) {
                    if (subcommand.isSlashSubcommandGroup()) {
                        for (const subsubcommand of subcommand.subcommands.values()) {
                            commands.push({
                                name: `${command.data.name} ${subcommand.data.name} ${subsubcommand.data.name}`,
                                description: subsubcommand.data.description,
                            });
                        }
                    }
                    else {
                        commands.push({
                            name: `${command.data.name} ${subcommand.data.name}`,
                            description: subcommand.data.description,
                        });
                    }
                }
            }
            else {
                // No subcommands, then only main command left.
                commands.push(command.data);
            }
            for (const cmd of commands) {
                const app_cmd = await Utils.get_rich_cmd(cmd.name, client);
                field += `> ${app_cmd} - ${cmd.description}\n`;
            }
        }
        else if (command.isMessageCommand()) {
            // Replace all `/command` with new shiny command mention.
            const replace_fn = (match) => {
                const full_name = match.slice(2, -1);
                return Utils.get_rich_cmd(full_name, client);
            };
            // Don't ask me about the regex, it was way too long ago...
            // Shouldn't be that hard to figure out though...
            const desc = await asyncReplace(command.long_description, /{\/\S+(?: \S+)?}/g, replace_fn);
            field += `> \`${client.prefix}${command.name}\` - ${desc}\n`;
        }
    }
    if (field.length <= 1024) {
        embed.addFields({
            name: `__**${cog.name}:**__\n**${cog.desc}**`,
            value: field,
            inline: true,
        });
    }
    else {
        embed.setDescription(`${embed.data.description}\n\n__**${cog.name}:**__\n**${cog.desc}**\n${field}`);
    }
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setEmoji('⏪')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setCustomId(`help/${authorID}/1`), new discord_js_1.ButtonBuilder()
        .setEmoji('⬅️')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setCustomId(`help/${authorID}/${page - 1}/`), new discord_js_1.ButtonBuilder()
        .setEmoji('➡️')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setCustomId(`help/${authorID}/${page + 1}/`), new discord_js_1.ButtonBuilder()
        .setEmoji('⏩')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setCustomId(`help/${authorID}/${max_pages}//`), new discord_js_1.ButtonBuilder()
        .setEmoji('❓')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setCustomId(`help/${authorID}/help/cog`));
    const row2 = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setEmoji('📄')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setCustomId(`help/${authorID}/input/cog`), new discord_js_1.ButtonBuilder()
        .setEmoji('🔍')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setCustomId(`help/${authorID}/input/cmd`));
    if (page === 1) {
        row.components[0].setDisabled(true);
        row.components[1].setDisabled(true);
    }
    if (page === max_pages) {
        row.components[2].setDisabled(true);
        row.components[3].setDisabled(true);
    }
    const retval = {
        embeds: [embed],
        components: [row, row2],
    };
    if (followUp.embeds.length > 0) {
        retval.followUp = followUp;
    }
    return retval;
}
async function get_cmd_page(client, authorID, command) {
    const cmd_tag = command.is_slash ?
        await Utils.get_rich_cmd(command.name, client) :
        `\`${client.prefix}${command.name}\``;
    const embed = new discord_js_1.EmbedBuilder({
        title: `__Command ${cmd_tag}__`,
        color: discord_js_1.Colors.Aqua,
    }).setFooter({
        text: 'Options surrounded with <> are required, and [] are optional.\n' +
            'Send me a direct message to create a ticket anytime!',
    });
    // Replace all `/command` with new shiny command mention.
    const replace_fn = (match) => Utils.get_rich_cmd(match.slice(2, -1), client);
    // Don't ask me about the regex, it was way too long ago...
    // Shouldn't be that hard to figure out though...
    const desc = await asyncReplace(command.desc, /{\/\S+(?: \S+)?}/g, replace_fn);
    embed.setDescription(desc);
    const row = new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
        .setEmoji('📄')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setCustomId(`help/${authorID}/input/cog`), new discord_js_1.ButtonBuilder()
        .setEmoji('🔍')
        .setStyle(discord_js_1.ButtonStyle.Primary)
        .setCustomId(`help/${authorID}/input/cmd`), new discord_js_1.ButtonBuilder()
        .setEmoji('❓')
        .setStyle(discord_js_1.ButtonStyle.Secondary)
        .setCustomId(`help/${authorID}/help/cmd`));
    return { embeds: [embed], components: [row] };
}
exports.help = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('help')
        .addStringOption(option => option
        .setName('command')
        .setDescription('The command to jump to.'))
        .addStringOption(option => option
        .setName('category')
        .setDescription('The category to jump to.'))
        .setDescription('Use me for help!'),
    long_description: 'What does {/help} do? Well, it shows you description messages.\n' +
        '...\n...\n...\n...\n...\n...\n...\n...\n... ' +
        '...   ...  ...like this one...',
    async buttonReact(interaction) {
        const [page, cmdName] = interaction.customId.split('/').splice(2);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const input = cmdName === 'cog' ?
                    new discord_js_1.ModalBuilder({
                        title: 'Jump/Search Category',
                        customId: `help/${cmdName}`,
                        components: [
                            new discord_js_1.ActionRowBuilder({
                                components: [
                                    new discord_js_1.TextInputBuilder({
                                        label: 'Name/Page #',
                                        customId: 'value',
                                        placeholder: 'Enter the name/page number to jump to...',
                                        style: discord_js_1.TextInputStyle.Short,
                                        maxLength: 100,
                                        required: true,
                                    }),
                                ],
                            }),
                        ],
                    }) :
                    new discord_js_1.ModalBuilder({
                        title: 'Search Command',
                        customId: `help/${cmdName}`,
                        components: [
                            new discord_js_1.ActionRowBuilder({
                                components: [
                                    new discord_js_1.TextInputBuilder({
                                        label: 'Name',
                                        customId: 'value',
                                        placeholder: 'Enter name of command...',
                                        style: discord_js_1.TextInputStyle.Short,
                                        maxLength: 100,
                                        required: true,
                                    }),
                                ],
                            }),
                        ],
                    });
                return interaction.showModal(input);
            }
            else if (page === 'help') {
                if (cmdName === 'cmd') {
                    return interaction.reply({
                        content: '📄: Search and jump to a specific page/category\n' +
                            '🔍: Search and jump to a specific command\n' +
                            '❓: This help message',
                        flags: discord_js_1.MessageFlags.Ephemeral,
                    }).then(Utils.VOID);
                }
                else if (cmdName === 'cog') {
                    return interaction.reply({
                        content: '⏪: First page\n' +
                            '⬅️: Previous page\n' +
                            '➡️: Next page\n' +
                            '⏩: Last page\n' +
                            '❓: This help message\n' +
                            '📄: Search and jump to a specific page/category\n' +
                            '🔍: Search and jump to a specific command',
                        flags: discord_js_1.MessageFlags.Ephemeral,
                    }).then(Utils.VOID);
                }
                else {
                    throw new Error(`Command type: ${cmdName} not found.`);
                }
            }
            else {
                throw new Error(`Button type: ${page} not found.`);
            }
        }
        await interaction.deferUpdate();
        const { embeds, components } = await get_cog_page(interaction.client, interaction.user.id, val);
        await interaction.editReply({ embeds, components });
    },
    async textInput(interaction) {
        const [cmdName] = interaction.customId.split('/').splice(1);
        const value = interaction.fields.getTextInputValue('value');
        await interaction.deferUpdate();
        if (cmdName === 'cog') {
            const page = parseInt(value);
            if (isNaN(page)) {
                const category = await get_results_category(interaction, interaction.client.cogs.filter(cog => cog.name.toLowerCase().includes(value.toLowerCase())).sort());
                // Either null or undefined, doesn't matter
                if (!category) {
                    const error_embed = new discord_js_1.EmbedBuilder({
                        title: `No category with name \`${value.replaceAll('`', '\\`')}\` found.`,
                        color: discord_js_1.Colors.Red,
                    });
                    return interaction.followUp({
                        embeds: [error_embed],
                        flags: discord_js_1.MessageFlags.Ephemeral,
                    }).then(Utils.VOID);
                }
                const { embeds, components, followUp } = await get_cog_page(interaction.client, interaction.user.id, interaction.client.cogs.indexOf(category) + 1);
                await interaction.editReply({ embeds, components });
                if (followUp)
                    await interaction.followUp(followUp);
            }
            else {
                const { embeds, components, followUp } = await get_cog_page(interaction.client, interaction.user.id, page);
                await interaction.editReply({ embeds, components });
                if (followUp)
                    await interaction.followUp(followUp);
            }
        }
        else if (cmdName === 'cmd') {
            const command = await get_results_cmd(interaction, value);
            // Either null or undefined, doesn't matter
            if (!command) {
                const error_embed = new discord_js_1.EmbedBuilder({
                    title: `No command with name \`${value.replaceAll('`', '\\`')}\` found.`,
                    color: discord_js_1.Colors.Red,
                });
                return interaction.followUp({ embeds: [error_embed], flags: discord_js_1.MessageFlags.Ephemeral }).then(Utils.VOID);
            }
            const res = await get_cmd_page(interaction.client, interaction.user.id, command);
            await interaction.editReply(res);
        }
        else {
            throw new Error(`Command type: ${cmdName} not found.`);
        }
    },
    async execute(interaction) {
        const commandName = interaction.options.getString('command');
        const categoryName = interaction.options.getString('category');
        const embed = new discord_js_1.EmbedBuilder({
            title: 'Performing intensive calculations...',
            color: discord_js_1.Colors.Yellow,
        });
        // Admin invokes are not ephemeral.
        await interaction.reply({
            embeds: [embed],
            ephemeral: interaction.user.id !== interaction.client.admin.id,
        });
        let res;
        if (commandName) {
            const command = await get_results_cmd(interaction, commandName);
            if (command === null) {
                return interaction.deleteReply();
            }
            else if (!command) {
                const error_embed = new discord_js_1.EmbedBuilder({
                    title: `No command with name \`${commandName.replaceAll('`', '\\`')}\` found.`,
                    color: discord_js_1.Colors.Red,
                });
                return interaction.editReply({ embeds: [error_embed] }).then(Utils.VOID);
            }
            res = await get_cmd_page(interaction.client, interaction.user.id, command);
        }
        else if (categoryName) {
            const category = await get_results_category(interaction, interaction.client.cogs.filter(cog => cog.name.toLowerCase().includes(categoryName.toLowerCase())).sort());
            if (category === null) {
                res = await get_cog_page(interaction.client, interaction.user.id, 1);
            }
            else if (!category) {
                const error_embed = new discord_js_1.EmbedBuilder({
                    title: `No category with name \`${categoryName.replaceAll('`', '\\`')}\` found.`,
                    color: discord_js_1.Colors.Red,
                });
                res = await get_cog_page(interaction.client, interaction.user.id, 1);
                interaction.followUp({ embeds: [error_embed], flags: discord_js_1.MessageFlags.Ephemeral });
            }
            else {
                res = await get_cog_page(interaction.client, interaction.user.id, interaction.client.cogs.indexOf(category) + 1);
            }
        }
        else {
            res = await get_cog_page(interaction.client, interaction.user.id, 1);
        }
        const { embeds, components } = res;
        await interaction.editReply({ embeds, components });
    },
});
//# sourceMappingURL=help_command.js.map