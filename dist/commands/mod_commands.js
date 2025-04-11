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
exports.role = exports.guild = exports.purge = exports.desc = exports.name = void 0;
const DB = __importStar(require("../modules/database"));
const Utils = __importStar(require("../modules/utils"));
const Purge = __importStar(require("../modules/purge_utils"));
const exceptions_1 = require("../classes/exceptions");
const discord_js_1 = require("discord.js");
const commands_1 = require("../classes/commands");
exports.name = 'Moderation';
exports.desc = 'Helpful bunch of commands for moderators who want an easier time.';
const purge_privates = {
    buttons: new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setCustomId('purge/confirm').setLabel('Yes!').setEmoji('🚮').setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setCustomId('purge/cancel').setLabel('No').setStyle(discord_js_1.ButtonStyle.Secondary)),
};
exports.purge = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('purge')
        .addStringOption(options => options
        .setName('amount')
        .setDescription('Amount of messages to delete.')
        .setRequired(true))
        .addUserOption(options => options
        .setName('user')
        .setDescription('User to filter messages (only delete from this user).'))
        .setDescription('Purge messages from a channel.')
        .setDefaultMemberPermissions(discord_js_1.PermissionsBitField.Flags.ManageMessages),
    long_description: 'Want an easy way to purge any amount of message? You came to the right command!\n\n' +
        'Usage: `/purge amount: <amount> user: [user]`\n\n' +
        '__**Options**__\n' +
        '*amount:* The amount of messages to delete. Enter a number, or `all`\n' +
        '*user:* Delete only messages sent by this user. (Default: everyone)\n\n' +
        'Examples: `/purge amount: all`, `/purge amount: 5 user: @krammygod`',
    async execute(interaction) {
        const message = await interaction.reply({
            content: 'Performing intensive calculations...',
            flags: discord_js_1.MessageFlags.Ephemeral,
        }).then(i => i.fetch());
        // Parse input
        // amount being NaN means all is true.
        const amt = interaction.options.getString('amount', true);
        const amount = parseInt(amt);
        if (amt.toLowerCase() !== 'all' && (isNaN(amount) || amount <= 0)) {
            return interaction.editReply({ content: 'Enter a positive number.' }).then(Utils.VOID);
        }
        const user = interaction.options.getUser('user');
        if (interaction.channel.isDMBased() && !interaction.inGuild()) {
            // DMs
            if (isNaN(amount)) {
                return interaction.editReply({ content: "Can't delete all messages in DMs." }).then(Utils.VOID);
            }
            const deleted = await Purge.purge_from_dm(interaction.channel, amount);
            return interaction.editReply({ content: `Successfully deleted ${deleted} message(s).` }).then(m => {
                setTimeout(() => Utils.delete_ephemeral_message(interaction, m), 3000);
            });
        }
        else if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        else if (!interaction.channel.permissionsFor(interaction.member)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: 'You do not have permission to purge.\n' +
                    'You need the `Manage Messages` permission.',
            }).then(Utils.VOID);
        }
        else if (!interaction.channel.permissionsFor(interaction.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: "I don't have permission to purge.\n" +
                    'I need the `Manage Messages` permission.',
            }).then(Utils.VOID);
        }
        // Purge all, or anything over 100 messages, really
        if (isNaN(amount) || amount >= 100) {
            const buttonMessage = await interaction.editReply({
                content: "## Woah! That's a lot of messages!\n# Are you sure " +
                    `you want to delete ${isNaN(amount) ? 'all' : amount} messages?`,
                components: [purge_privates.buttons],
            });
            const confirmed = await buttonMessage.awaitMessageComponent({
                componentType: discord_js_1.ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 60_000,
            }).then(i => i.customId === 'purge/confirm').catch(() => false);
            if (!confirmed)
                return interaction.deleteReply();
            await interaction.editReply({ components: [] });
        }
        // Purge all
        if (isNaN(amount)) {
            // Extra permissions for purge all
            if (!interaction.channel.permissionsFor(interaction.member)
                .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
                return interaction.editReply({
                    content: 'You do not have permission to purge all.\n' +
                        'You need the `Manage Channels` permission.',
                }).then(Utils.VOID);
            }
            else if (!interaction.channel.permissionsFor(interaction.guild.members.me).has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
                return interaction.editReply({
                    content: "I don't have permission to purge all.\n" +
                        'I need the `Manage Channels` permission.',
                }).then(Utils.VOID);
            }
            // Check to satisfy typescript
            if (interaction.channel.isThread()) {
                return interaction.editReply({
                    content: 'To purge all in threads, just simply delete the thread.',
                }).then(Utils.VOID);
            }
            const new_channel = await Purge.purge_clean_channel(interaction.channel).catch(() => {
                interaction.editReply({
                    content: "I can't purge here. Make sure I have permissions to modify the channel.",
                });
                throw new exceptions_1.PermissionError();
            });
            return new_channel.send({ content: `${interaction.user} Purged all messages.` }).then(msg => {
                setTimeout(() => msg.delete(), 3000);
            }).catch(Utils.VOID);
        }
        else if (!interaction.channel.permissionsFor(interaction.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ReadMessageHistory)) {
            // Read message history required to purge specific messages
            return interaction.editReply({
                content: "I don't have permission to purge here.\n" +
                    'I need the `Read Message History` permission.',
            }).then(Utils.VOID);
        }
        const user_filter = (m) => !user || m.author.id === user.id;
        // Use our handy helper to purge for us.
        const deleted = await Purge.purge_from_channel(interaction.channel, amount, user_filter);
        await Utils.delete_ephemeral_message(interaction, message);
        await interaction.channel.send({ content: `${interaction.user} deleted ${deleted} message(s).` })
            .then(m => setTimeout(() => m.delete(), 3000))
            .catch(Utils.VOID);
    },
});
const main_menu = {
    buildEmbeds(guild) {
        let description = 'Use the menu below to select a setting to edit.\n\n**Current Settings:**\n\n';
        description += '__New Member Settings:__\nSending ';
        if (guild.welcome_msg) {
            description += (0, discord_js_1.codeBlock)((0, discord_js_1.escapeCodeBlock)((0, discord_js_1.escapeInlineCode)((0, discord_js_1.escapeEscape)(guild.welcome_msg))));
        }
        else {
            description += 'nothing';
        }
        description += ' in ';
        if (guild.welcome_channelid) {
            description += `<#${guild.welcome_channelid}>`;
        }
        else {
            description += 'nowhere';
        }
        description += ' with ';
        if (guild.welcome_roleid) {
            description += `the role <@&${guild.welcome_roleid}>\n`;
        }
        else {
            description += 'no role.\n';
        }
        description += `\n__Emoji Replacement:__ **${guild.emoji_replacement ? 'Enabled' : 'Disabled'}**`;
        return [
            new discord_js_1.EmbedBuilder({
                title: 'Guild Settings',
                color: discord_js_1.Colors.Blue,
                description,
            }),
        ];
    },
    buildComponents(userID) {
        return [
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.StringSelectMenuBuilder().addOptions(new discord_js_1.StringSelectMenuOptionBuilder().setLabel('Edit welcome message for new members').setValue('welcome_menu'), new discord_js_1.StringSelectMenuOptionBuilder().setLabel('Emoji Replacement').setValue('emoji_menu'))
                .setPlaceholder('Select a setting to edit...')
                .setCustomId(`guild/${userID}/main_menu`)
                .setMinValues(1)
                .setMaxValues(1)),
        ];
    },
    buttonReact() {
        throw new Error('/guild: main_menu does not have button reactions!');
    },
    menuReact(guild, menu, actions) {
        return actions[0];
    },
    textInput() {
        throw new Error('/guild: main_menu does not have text inputs!');
    },
};
const welcome_menu = {
    buildEmbeds(guild) {
        let description = 'Use the buttons below to edit the welcome settings.\n\n**Current Settings:**\n\n';
        description += '__Welcome Channel:__\n';
        if (guild.welcome_channelid) {
            description += `<#${guild.welcome_channelid}>\n`;
        }
        else {
            description += '*No channel found.*\n';
        }
        description += '\n__Welcome Message:__\n';
        if (guild.welcome_msg) {
            description += (0, discord_js_1.codeBlock)((0, discord_js_1.escapeCodeBlock)((0, discord_js_1.escapeInlineCode)((0, discord_js_1.escapeEscape)(guild.welcome_msg))));
        }
        else {
            description += '*No message found.*\n';
        }
        description += '\n__Role Given:__\n';
        if (guild.welcome_roleid) {
            description += `<@&${guild.welcome_roleid}>\n`;
        }
        else {
            description += '*No role found.*\n';
        }
        return [
            new discord_js_1.EmbedBuilder({
                title: 'Welcome Settings',
                color: discord_js_1.Colors.Blue,
                description,
                footer: { text: 'Note: Click ❓ to see dynamic welcome message options.' },
            }),
        ];
    },
    buildComponents(userID, guild) {
        return [
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setEmoji('📝')
                .setCustomId(`guild/${userID}/welcome_menu/editmsg`)
                .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder().setEmoji('🔙')
                .setCustomId(`guild/${userID}/welcome_menu/back`)
                .setStyle(discord_js_1.ButtonStyle.Primary), new discord_js_1.ButtonBuilder().setEmoji('❓')
                .setCustomId(`guild/${userID}/welcome_menu/help`)
                .setStyle(discord_js_1.ButtonStyle.Secondary)),
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ChannelSelectMenuBuilder().setCustomId(`guild/${userID}/welcome_menu/channel`)
                .setPlaceholder('Select a channel...')
                .setDefaultChannels(guild.welcome_channelid ? [guild.welcome_channelid] : [])
                .setMinValues(0)
                .setMaxValues(1)),
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.RoleSelectMenuBuilder().setCustomId(`guild/${userID}/welcome_menu/role`)
                .setPlaceholder('Select a role...')
                .setDefaultRoles(guild.welcome_roleid ? [guild.welcome_roleid] : [])
                .setMinValues(0)
                .setMaxValues(1)),
        ];
    },
    async buttonReact(guild, menu, action, interaction) {
        switch (action) {
            case 'editmsg': {
                const input = new discord_js_1.ModalBuilder({
                    title: 'Change Welcome Message',
                    custom_id: 'guild/0/welcome_menu/msg',
                    components: [
                        new discord_js_1.ActionRowBuilder({
                            components: [
                                new discord_js_1.TextInputBuilder({
                                    label: 'Enter your welcome message:',
                                    custom_id: 'guild/welcome_menu/msg',
                                    placeholder: 'Leave me blank to remove!',
                                    style: discord_js_1.TextInputStyle.Paragraph,
                                    value: guild?.welcome_msg ?? '',
                                    max_length: 2000,
                                    required: false,
                                }),
                            ],
                        }),
                    ],
                });
                await interaction.showModal(input);
                break;
            }
            case 'back':
                menu = 'main_menu';
                break;
            case 'help':
                await interaction.editReply({ content: null });
                await interaction.followUp({
                    content: '📝 Edit the welcome message\n🔙 Return to main menu\n' +
                        '__Replacement Options For Welcome Message:__\n' +
                        '> ${USER} - Mentions the newly joined member.\n' +
                        '> ${SERVER} - Replaces with the name of the server.\n' +
                        '> ${MEMBER_COUNT} - Replaces with the number of current members in the server.',
                    flags: discord_js_1.MessageFlags.Ephemeral,
                });
                break;
            default:
                throw new Error(`/guild: welcome_menu buttonReact invalid action: ${action}`);
        }
        return menu;
    },
    async menuReact(guild, menu, actions, interaction) {
        const menuType = actions.pop();
        switch (menuType) {
            case 'channel': {
                const chn = interaction.guild.channels.resolve(actions.at(0) ?? '');
                if (chn) {
                    if (!chn.isTextBased()) {
                        await interaction.editReply({ content: null });
                        await interaction.followUp({
                            content: 'Channel must be a text channel.',
                            flags: discord_js_1.MessageFlags.Ephemeral,
                        });
                        return menu;
                    }
                    if (!chn.permissionsFor(interaction.member).has(discord_js_1.PermissionsBitField.Flags.SendMessages)) {
                        await interaction.editReply({ content: null });
                        await interaction.followUp({
                            content: `You do not have permission to send messages in ${chn}.`,
                            flags: discord_js_1.MessageFlags.Ephemeral,
                        });
                        return menu;
                    }
                    else if (!chn.permissionsFor(interaction.guild.members.me).has(discord_js_1.PermissionsBitField.Flags.SendMessages)) {
                        await interaction.editReply({ content: null });
                        await interaction.followUp({
                            content: `I do not have permission to send messages in ${chn}.`,
                            flags: discord_js_1.MessageFlags.Ephemeral,
                        });
                        return menu;
                    }
                }
                guild.welcome_channelid = chn ? chn.id : chn;
                break;
            }
            case 'role': {
                const role = interaction.guild.roles.resolve(actions.at(0) ?? '');
                if (role) {
                    if (role.managed) {
                        await interaction.editReply({ content: null });
                        await interaction.followUp({
                            content: 'Cannot assign a bot role.',
                            flags: discord_js_1.MessageFlags.Ephemeral,
                        });
                        return menu;
                    }
                    const roleManager = interaction.guild.roles;
                    const me = interaction.guild.members.me.roles.highest;
                    const them = interaction.member.roles.highest;
                    if (roleManager.comparePositions(me, role) <= 0) {
                        await interaction.followUp({
                            content: `I am unable to add ${role} due to my role ` +
                                'being lower than it.',
                            flags: discord_js_1.MessageFlags.Ephemeral,
                        });
                        return menu;
                    }
                    else if (interaction.guild.ownerId !== interaction.user.id &&
                        roleManager.comparePositions(them, role) <= 0) {
                        // Owner's role is always higher than the role they are adding.
                        await interaction.followUp({
                            content: `You are unable to add ${role} due to your highest role ` +
                                'being lower than it.',
                            flags: discord_js_1.MessageFlags.Ephemeral,
                        });
                        return menu;
                    }
                }
                guild.welcome_roleid = role ? role.id : role;
                break;
            }
            default:
                throw new Error(`/guild: welcome_menu menuReact invalid action: ${menuType}`);
        }
        return menu;
    },
    textInput(guild, menu, fields) {
        guild.welcome_msg = fields.getTextInputValue('guild/welcome_menu/msg');
        return menu;
    },
};
const emoji_menu = {
    buildEmbeds(guild) {
        let description = '**Current Setting:**\n\n__Emoji Replacement:__';
        description += ` **${guild.emoji_replacement ? 'Enabled' : 'Disabled'}**`;
        return [
            new discord_js_1.EmbedBuilder({
                title: 'Emoji Replacement Settings',
                color: discord_js_1.Colors.Blue,
                description,
                footer: {
                    text: 'Toggling this option will enable/disable server-wide emoji replacement.\n' +
                        'To toggle for individual channels, disable webhook permissions for the bot.',
                },
            }),
        ];
    },
    buildComponents(userID) {
        return [
            new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setEmoji('🟢')
                .setCustomId(`guild/${userID}/emoji_menu/enable`)
                .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder().setEmoji('🔴')
                .setCustomId(`guild/${userID}/emoji_menu/disable`)
                .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder().setEmoji('🔙')
                .setCustomId(`guild/${userID}/emoji_menu/back`)
                .setStyle(discord_js_1.ButtonStyle.Primary)),
        ];
    },
    buttonReact(guild, menu, action) {
        switch (action) {
            case 'enable':
                guild.emoji_replacement = true;
                break;
            case 'disable':
                guild.emoji_replacement = false;
                break;
            case 'back':
                menu = 'main_menu';
                break;
            default:
                throw new Error(`/guild: emoji_menu buttonReact invalid action: ${action}`);
        }
        return menu;
    },
    menuReact() {
        throw new Error('/guild: emoji_menu does not have menu reactions!');
    },
    textInput() {
        throw new Error('/guild: emoji_menu does not have text inputs!');
    },
};
const guild_privates = {
    buildComponents(userID, guild, menu) {
        switch (menu) {
            case 'main_menu':
                return main_menu.buildComponents(userID, guild);
            case 'welcome_menu':
                return welcome_menu.buildComponents(userID, guild);
            case 'emoji_menu':
                return emoji_menu.buildComponents(userID, guild);
        }
    },
    buildEmbeds(guild, menu) {
        switch (menu) {
            case 'main_menu':
                return main_menu.buildEmbeds(guild);
            case 'welcome_menu':
                return welcome_menu.buildEmbeds(guild);
            case 'emoji_menu':
                return emoji_menu.buildEmbeds(guild);
        }
    },
};
exports.guild = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('guild')
        .setDescription('Edits bot specific guild settings.')
        .setDefaultMemberPermissions(discord_js_1.PermissionsBitField.Flags.ManageGuild)
        .setContexts(discord_js_1.InteractionContextType.Guild),
    long_description: 'Starts a dialogue to edit some guild settings.\n\n' +
        '__**<<RESTRICTED FOR USERS WITH MANAGE GUILD PERMISSIONS ONLY>>**__\n\n' +
        '__Replacement Options For Welcome Message:__\n' +
        '${USER} - Mentions the newly joined member.\n' +
        '${SERVER} - Replaces with the name of the server.\n' +
        '${MEMBER_COUNT} - Replaces with the number of current members in the server.\n\n' +
        'Usage: `/guild`',
    async buttonReact(interaction) {
        const [m, action] = interaction.customId.split('/').splice(2, 2);
        // A custom list of IDs that show modals, so we can't defer
        if (m !== 'welcome_menu' || action !== 'editmsg') {
            await interaction.deferUpdate();
        }
        let menu = m;
        if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        const guildCache = await this.cache.get(interaction.guildId);
        if (!guildCache)
            return; // This can happen if a button react comes late, just ignore.
        else if (guildCache.mid !== interaction.message.id) {
            // Expired guild dialog, try to delete message.
            return interaction.deleteReply();
        }
        switch (menu) {
            case 'main_menu':
                menu = await main_menu.buttonReact(guildCache, menu, action, interaction);
                break;
            case 'welcome_menu':
                menu = await welcome_menu.buttonReact(guildCache, menu, action, interaction);
                break;
            case 'emoji_menu':
                menu = await emoji_menu.buttonReact(guildCache, menu, action, interaction);
                break;
            default:
                throw new Error(`/guild: buttonReact invalid menu: ${menu}`);
        }
        await this.cache.set(interaction.guildId, guildCache);
        await DB.setGuild(guildCache);
        const embeds = guild_privates.buildEmbeds(guildCache, menu);
        const components = guild_privates.buildComponents(interaction.user.id, guildCache, menu);
        await interaction.editReply({ embeds, components });
    },
    async menuReact(interaction) {
        await interaction.deferUpdate();
        const [m, type] = interaction.customId.split('/').splice(2, 2);
        let menu = m;
        if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        const guildCache = await this.cache.get(interaction.guildId);
        if (!guildCache)
            return; // This can happen if a menu react comes late, just ignore.
        else if (guildCache.mid !== interaction.message.id) {
            // Expired guild dialog, try to delete message.
            return interaction.deleteReply();
        }
        switch (menu) {
            case 'main_menu':
                menu = await main_menu.menuReact(guildCache, menu, interaction.values, interaction);
                break;
            case 'welcome_menu':
                menu = await welcome_menu.menuReact(guildCache, menu, [...interaction.values, type], interaction);
                break;
            case 'emoji_menu':
                menu = await emoji_menu.menuReact(guildCache, menu, interaction.values, interaction);
                break;
            default:
                throw new Error(`/guild: menuReact invalid menu: ${menu}`);
        }
        await this.cache.set(interaction.guildId, guildCache);
        await DB.setGuild(guildCache);
        const embeds = guild_privates.buildEmbeds(guildCache, menu);
        const components = guild_privates.buildComponents(interaction.user.id, guildCache, menu);
        await interaction.editReply({ embeds, components });
    },
    async textInput(interaction) {
        await interaction.deferUpdate();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [m, type] = interaction.customId.split('/').splice(2, 2);
        let menu = m;
        if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        const guildCache = await this.cache.get(interaction.guildId);
        if (!guildCache)
            return; // This can happen if a button react comes late, just ignore.
        switch (menu) {
            case 'main_menu':
                menu = await main_menu.textInput(guildCache, menu, interaction.fields, interaction);
                break;
            case 'welcome_menu':
                menu = await welcome_menu.textInput(guildCache, menu, interaction.fields, interaction);
                break;
            case 'emoji_menu':
                menu = await emoji_menu.textInput(guildCache, menu, interaction.fields, interaction);
                break;
            default:
                throw new Error(`/guild: textInput invalid menu: ${menu}`);
        }
        await this.cache.set(interaction.guildId, guildCache);
        await DB.setGuild(guildCache);
        const embeds = guild_privates.buildEmbeds(guildCache, menu);
        const components = guild_privates.buildComponents(interaction.user.id, guildCache, menu);
        await interaction.editReply({ embeds, components });
    },
    async execute(interaction) {
        const message = await interaction.reply({ content: 'Loading...' }).then(i => i.fetch());
        if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        if (!interaction.channel.permissionsFor(interaction.member).has(discord_js_1.PermissionsBitField.Flags.ManageGuild)) {
            return interaction.editReply({
                content: 'You do not have permission to edit guild settings.\n' +
                    'You need the `Manage Guild` permission.',
            }).then(Utils.VOID);
        }
        // Check to make sure that dialog does not currently exist for the guild
        // Only allow one user to access the dialog at a time
        let guildCache = await this.cache.get(interaction.guildId);
        // If it does exist, then we need to exit other dialog:
        if (guildCache) {
            const deleted = await this.cache.delete(interaction.guildId);
            if (deleted.length !== 1) {
                console.log(`/guild: Warning! Deleted ${deleted.length} entries for guild ${interaction.guildId}.`);
            }
        }
        else {
            // If none in cache, fetch current settings as cache
            guildCache = { ...await DB.getGuild(interaction.guildId), mid: '' };
            guildCache.gid = interaction.guildId;
        }
        guildCache.mid = message.id;
        await this.cache.set(interaction.guildId, guildCache);
        const embeds = guild_privates.buildEmbeds(guildCache, 'main_menu');
        const components = guild_privates.buildComponents(interaction.user.id, guildCache, 'main_menu');
        await interaction.editReply({ content: null, embeds, components });
    },
});
exports.role = new commands_1.SlashCommandNoSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('role')
        .setDescription('Setup a pretty dialogue for adding roles.')
        .setDefaultMemberPermissions(discord_js_1.PermissionsBitField.Flags.ManageGuild)
        .setContexts(discord_js_1.InteractionContextType.Guild),
    long_description: 'Setup a pretty dialogue to allow users to assign roles to themselves.\n\n' +
        '__**<<RESTRICTED FOR USERS WITH MANAGE ROLES PERMISSIONS ONLY>>**__\n\n' +
        'Usage: `/role`',
    async execute(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        if (!interaction.guild.members.me.permissions.has(discord_js_1.PermissionsBitField.Flags.ManageRoles)) {
            return interaction.editReply({
                content: 'I do not have permission to assign roles.\n' +
                    'I need the Manage Roles permission.',
            }).then(Utils.VOID);
        }
        const roleSelector = new discord_js_1.ActionRowBuilder({
            components: [new discord_js_1.RoleSelectMenuBuilder({
                    custom_id: 'role_role',
                    min_values: 0,
                    max_values: 25, // Discord limit
                    placeholder: 'Select roles to display',
                })],
        });
        const apply = new discord_js_1.ActionRowBuilder({
            components: [new discord_js_1.ButtonBuilder({
                    custom_id: 'apply_self_role',
                    label: 'Apply',
                    style: discord_js_1.ButtonStyle.Success,
                    emoji: '✅',
                    disabled: true,
                })],
        });
        const channel = interaction.channel;
        const base_desc = 'Select the roles you want to be added to the ' +
            'self role menu and then click apply.\n\n__**Selected channel:**__\n' +
            `${interaction.channel}\n\n__**Selected roles:**__\n`;
        let selectedRoles = [];
        const embed = new discord_js_1.EmbedBuilder({
            title: 'Self Role Setup',
            description: base_desc + '*No roles selected.*',
        }).setColor('Gold');
        const base_components = [roleSelector, apply];
        const msg = await interaction.editReply({ embeds: [embed], components: base_components });
        const collector = msg.createMessageComponentCollector();
        collector.on('collect', async (i) => {
            if (i.isButton()) {
                await i.deferUpdate();
                // Add message
                let desc = 'Click on the buttons to add the role to yourself:\n\n';
                const roles = await i.guild.roles.fetch();
                const btns = [];
                for (const role of selectedRoles) {
                    if (!roles.has(role))
                        continue;
                    btns.push(new discord_js_1.ButtonBuilder({
                        custom_id: `role/0/${role}/${i.user.id}`,
                        label: roles.get(role).name.slice(0, 80),
                        style: discord_js_1.ButtonStyle.Primary,
                    }));
                    desc += `${roles.get(role)}\n`;
                }
                if (!btns)
                    return;
                const components = [];
                // Split into 5 buttons per row
                while (btns.length > 0) {
                    components.push(new discord_js_1.ActionRowBuilder({
                        components: btns.splice(0, 5),
                    }));
                }
                const roleEmbed = new discord_js_1.EmbedBuilder({
                    title: 'Select Roles to add',
                    description: desc,
                }).setColor('Gold');
                return channel.send({ embeds: [roleEmbed], components: components })
                    .then(() => i.deleteReply())
                    .catch(() => i.followUp({
                    content: `I do not have permission to send messages in ${channel}`,
                    flags: discord_js_1.MessageFlags.Ephemeral,
                }));
            }
            else if (i.isRoleSelectMenu()) {
                selectedRoles = [];
                const invalidRoles = [];
                const me = i.guild.members.me.roles.highest;
                const their = i.member.roles;
                const them = their instanceof discord_js_1.GuildMemberRoleManager ? their.highest : their[their.length - 1];
                await i.deferUpdate();
                for (const role of i.roles.values()) {
                    if (i.guild.roles.comparePositions(me, role.id) <= 0 || role.managed) {
                        // Invalid role for us to give
                        invalidRoles.push(role.id);
                    }
                    else if (i.guild.roles.comparePositions(them, role.id) <= 0 &&
                        i.guild.ownerId !== i.user.id) {
                        // Invalid role for us to give
                        invalidRoles.push(role.id);
                    }
                    else {
                        // Valid role for us to give
                        selectedRoles.push(role.id);
                    }
                }
                selectedRoles.sort((a, b) => i.guild.roles.comparePositions(b, a));
                // If length is 0, disable apply button
                apply.components[0].setDisabled(!selectedRoles.length);
                let desc = base_desc;
                if (!selectedRoles.length) {
                    desc += '*No roles selected.*';
                }
                for (const role of selectedRoles) {
                    desc += `<@&${role}>\n`;
                }
                embed.setDescription(desc);
                await i.editReply({ embeds: [embed], components: base_components });
                if (invalidRoles.length) {
                    let ctnt = 'There were some roles that I was unable to add ' +
                        'due to either my role being lower than them, your role ' +
                        'lower than them, or they are not assignable roles:\n';
                    for (const role of invalidRoles) {
                        ctnt += `<@&${role}>\n`;
                    }
                    return i.followUp({
                        content: ctnt,
                        flags: discord_js_1.MessageFlags.Ephemeral,
                    });
                }
            }
        });
        collector.on('end', async () => {
            await msg.edit({
                content: 'Self role setup has timed out.',
                embeds: [],
                components: [],
            }).catch(() => { });
        });
    },
    async buttonReact(interaction) {
        await interaction.deferReply({ flags: discord_js_1.MessageFlags.Ephemeral });
        const roleId = interaction.customId.split('/')[2];
        let reply = '';
        const roles = interaction.member.roles;
        if (roles.cache.has(roleId)) {
            reply = `You lost <@&${roleId}>.`;
            await roles.remove(roleId, 'Self role');
        }
        else {
            reply = `You now have <@&${roleId}>.`;
            await roles.add(roleId, 'Self role');
        }
        await interaction.editReply({ content: reply });
    },
});
//# sourceMappingURL=mod_commands.js.map