import * as DB from '@modules/database';
import * as Utils from '@modules/utils';
import * as Purge from '@modules/purge_utils';
import { CachedSlashCommand, SlashCommand } from '@classes/client';
import { PermissionError } from '@classes/exceptions';
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    PermissionsBitField, ComponentType, SlashCommandBuilder, Colors,
    escapeCodeBlock, codeBlock, escapeEscape, escapeInlineCode,
    StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelSelectMenuBuilder,
    RoleSelectMenuBuilder, TextInputBuilder, ModalBuilder, TextInputStyle,
} from 'discord.js';
import type DTypes from 'discord.js';

export const name = 'Moderation';
export const desc = 'Helpful bunch of commands for moderators who want an easier time.';

type PurgePrivates = {
    buttons: ActionRowBuilder<DTypes.MessageActionRowComponentBuilder>;
};
export const purge: SlashCommand & PurgePrivates = {
    data: new SlashCommandBuilder()
        .setName('purge')
        .addStringOption(options =>
            options
                .setName('amount')
                .setDescription('Amount of messages to delete.')
                .setRequired(true))
        .addUserOption(options =>
            options
                .setName('user')
                .setDescription('User to filter messages (only delete from this user).'))
        .setDescription('Purge messages from a channel.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageMessages),

    desc: 'Want an easy way to purge any amount of message? You came to the right command!\n\n' +
          'Usage: `/purge amount: <amount> user: [user]`\n\n' +
          '__**Options**__\n' +
          '*amount:* The amount of messages to delete. Enter a number, or `all`\n' +
          '*user:* Delete only messages sent by this user. (Default: everyone)\n\n' +
          'Examples: `/purge amount: all`, `/purge amount: 5 user: @krammygod`',

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

    async execute(interaction) {
        const message = await interaction.reply({
            content: 'Performing intensive calculations...',
            ephemeral: true,
        }).then(i => i.fetch());
        // Parse input
        // amount being NaN means all is true.
        const amt = interaction.options.getString('amount', true);
        const amount = parseInt(amt);
        if (amt.toLowerCase() !== 'all' && (isNaN(amount) || amount <= 0)) {
            return interaction.editReply({ content: 'Enter a positive number.' }).then(() => { });
        }
        const user = interaction.options.getUser('user');

        if (interaction.channel!.isDMBased() && !interaction.inGuild()) {
            // DMs
            if (isNaN(amount)) {
                return interaction.editReply({ content: "Can't delete all messages in DMs." }).then(() => { });
            }
            const deleted = await Purge.purge_from_dm(interaction.channel, amount);
            return interaction.editReply({ content: `Successfully deleted ${deleted} message(s).` })
                .then(m => { setTimeout(() => Utils.delete_ephemeral_message(interaction, m), 3000); });
        } else if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        } else if (!interaction.channel!.permissionsFor(interaction.member)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: 'You do not have permission to purge.\n' +
                    'You need the `Manage Messages` permission.',
            }).then(() => { });
        } else if (!interaction.channel!.permissionsFor(interaction.guild.members.me!)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: "I don't have permission to purge.\n" +
                    'I need the `Manage Messages` permission.',
            }).then(() => { });
        }

        // Purge all, or anything over 100 messages, really
        if (isNaN(amount) || amount! >= 100) {
            const buttonMessage = await interaction.editReply({
                content: "## Woah! That's a lot of messages!\n# Are you sure " +
                    `you want to delete ${isNaN(amount) ? 'all' : amount} messages?`,
                components: [this.buttons],
            });

            const confirmed = await buttonMessage.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 60_000,
            }).then(i => i.customId === 'purge/confirm').catch(() => false);
            if (!confirmed) return interaction.deleteReply();
            await interaction.editReply({ components: [] });
        }

        // Purge all
        if (isNaN(amount)) {
            // Extra permissions for purge all
            if (!interaction.channel!.permissionsFor(interaction.member)
                .has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.editReply({
                    content: 'You do not have permission to purge all.\n' +
                        'You need the `Manage Channels` permission.',
                }).then(() => { });
            } else if (!interaction.channel!.permissionsFor(interaction.guild.members.me!)
                .has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.editReply({
                    content: "I don't have permission to purge all.\n" +
                        'I need the `Manage Channels` permission.',
                }).then(() => { });
            }

            // Check to satisfy typescript
            if (interaction.channel!.isThread()) {
                return interaction.editReply({
                    content: 'To purge all in threads, just simply delete the thread.',
                }).then(() => { });
            }
            const new_channel = await Purge.purge_clean_channel(interaction.channel!).catch(() => {
                interaction.editReply({
                    content: "I can't purge here. Make sure I have permissions to modify the channel.",
                });
                throw new PermissionError();
            });
            return new_channel.send({ content: `${interaction.user} Purged all messages.` })
                .then(msg => { setTimeout(() => msg.delete(), 3000); }).catch(() => { });
        } else if (!interaction.channel!.permissionsFor(interaction.guild.members.me!)
            .has(PermissionsBitField.Flags.ReadMessageHistory)) {
            // Read message history required to purge specific messages
            return interaction.editReply({
                content: "I don't have permission to purge here.\n" +
                    'I need the `Read Message History` permission.',
            }).then(() => { });
        }

        const user_filter = (m: DTypes.Message) => !user || m.author.id === user.id;
        // Use our handy helper to purge for us.
        const deleted = await Purge.purge_from_channel(interaction.channel!, amount, user_filter);
        await Utils.delete_ephemeral_message(interaction, message);
        await interaction.channel!.send({ content: `${interaction.user} deleted ${deleted} message(s).` })
            .then(m => setTimeout(() => m.delete(), 3000)).catch(() => { });
    },
};

type GuildComponentTypes = {
    main_menu: null;
    welcome_menu: null;
    emoji_menu: null;
};
type GuildType = Awaited<ReturnType<typeof DB.getGuild>>;
type GuildCacheType = GuildType & { mid: string };
type GuildMenus = {
    buildEmbeds: (guild: GuildType) => DTypes.EmbedBuilder[];
    buildComponents: (
        userID: string,
        guild: GuildType
    ) => ActionRowBuilder<DTypes.MessageActionRowComponentBuilder>[];
    // All reactions have interaction as last parameter
    // because only some reactions require the interaction
    // for information or editing.
    buttonReact: (
        guild: GuildCacheType,
        menu: keyof GuildComponentTypes,
        actions: string,
        interaction: DTypes.ButtonInteraction<'cached'>
    ) => Promise<keyof GuildComponentTypes> | keyof GuildComponentTypes;
    menuReact: (
        guild: GuildCacheType,
        menu: keyof GuildComponentTypes,
        actions: string[],
        interaction: DTypes.AnySelectMenuInteraction<'cached'>
    ) => Promise<keyof GuildComponentTypes> | keyof GuildComponentTypes;
    textInput: (
        guild: GuildCacheType,
        menu: keyof GuildComponentTypes,
        fields: DTypes.ModalSubmitFields,
        interaction: DTypes.ModalSubmitInteraction<'cached'>
    ) => Promise<keyof GuildComponentTypes> | keyof GuildComponentTypes;
};
const main_menu: GuildMenus = {
    buildEmbeds(guild) {
        let description = 'Use the menu below to select a setting to edit.\n\n**Current Settings:**\n\n';
        description += '__New Member Settings:__\nSending ';
        if (guild.welcome_msg) {
            description += codeBlock(escapeCodeBlock(escapeInlineCode(escapeEscape(guild.welcome_msg))));
        } else {
            description += 'nothing';
        }
        description += ' in ';
        if (guild.welcome_channelid) {
            description += `<#${guild.welcome_channelid}>`;
        } else {
            description += 'nowhere';
        }
        description += ' with ';
        if (guild.welcome_roleid) {
            description += `the role <@&${guild.welcome_roleid}>\n`;
        } else {
            description += 'no role.\n';
        }
        description += `\n__Emoji Replacement:__ **${guild.emoji_replacement ? 'Enabled' : 'Disabled'}**`;
        return [new EmbedBuilder({
            title: 'Guild Settings',
            color: Colors.Blue,
            description,
        })];
    },
    buildComponents(userID) {
        return [new ActionRowBuilder<StringSelectMenuBuilder>()
            .addComponents(
                new StringSelectMenuBuilder()
                    .addOptions(
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Edit welcome message for new members')
                            .setValue('welcome_menu'),
                        new StringSelectMenuOptionBuilder()
                            .setLabel('Emoji Replacement')
                            .setValue('emoji_menu')
                    )
                    .setPlaceholder('Select a setting to edit...')
                    .setCustomId(`guild/${userID}/main_menu`)
                    .setMinValues(1)
                    .setMaxValues(1)
            )];
    },
    buttonReact() {
        throw new Error('/guild: main_menu does not have button reactions!');
    },
    menuReact(guild, menu, actions) {
        return actions[0] as keyof GuildComponentTypes;
    },
    textInput() {
        throw new Error('/guild: main_menu does not have text inputs!');
    },
};
const welcome_menu: GuildMenus = {
    buildEmbeds(guild) {
        let description = 'Use the buttons below to edit the welcome settings.\n\n**Current Settings:**\n\n';
        description += '__Welcome Channel:__\n';
        if (guild.welcome_channelid) {
            description += `<#${guild.welcome_channelid}>\n`;
        } else {
            description += '*No channel found.*\n';
        }
        description += '\n__Welcome Message:__\n';
        if (guild.welcome_msg) {
            description += codeBlock(escapeCodeBlock(escapeInlineCode(escapeEscape(guild.welcome_msg))));
        } else {
            description += '*No message found.*\n';
        }
        description += '\n__Role Given:__\n';
        if (guild.welcome_roleid) {
            description += `<@&${guild.welcome_roleid}>\n`;
        } else {
            description += '*No role found.*\n';
        }
        return [new EmbedBuilder({
            title: 'Welcome Settings',
            color: Colors.Blue,
            description,
            footer: { text: 'Note: Click ❓ to see dynamic welcome message options.' },
        })];
    },
    buildComponents(userID, guild) {
        return [
            new ActionRowBuilder<ButtonBuilder>()
                .addComponents(
                    new ButtonBuilder()
                        .setEmoji('📝')
                        .setCustomId(`guild/${userID}/welcome_menu/editmsg`)
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setEmoji('🔙')
                        .setCustomId(`guild/${userID}/welcome_menu/back`)
                        .setStyle(ButtonStyle.Primary),
                    new ButtonBuilder()
                        .setEmoji('❓')
                        .setCustomId(`guild/${userID}/welcome_menu/help`)
                        .setStyle(ButtonStyle.Secondary)
                ),
            new ActionRowBuilder<ChannelSelectMenuBuilder>()
                .addComponents(
                    new ChannelSelectMenuBuilder()
                        .setCustomId(`guild/${userID}/welcome_menu/channel`)
                        .setPlaceholder('Select a channel...')
                        .setDefaultChannels(guild.welcome_channelid ? [guild.welcome_channelid] : [])
                        .setMinValues(0)
                        .setMaxValues(1)
                ),
            new ActionRowBuilder<RoleSelectMenuBuilder>()
                .addComponents(
                    new RoleSelectMenuBuilder()
                        .setCustomId(`guild/${userID}/welcome_menu/role`)
                        .setPlaceholder('Select a role...')
                        .setDefaultRoles(guild.welcome_roleid ? [guild.welcome_roleid] : [])
                        .setMinValues(0)
                        .setMaxValues(1)
                ),
        ];
    },
    async buttonReact(guild, menu, action, interaction) {
        switch (action) {
            case 'editmsg':
            { 
                const input = new ModalBuilder({
                    title: 'Change Welcome Message',
                    custom_id: 'guild/0/welcome_menu/msg',
                    components: [new ActionRowBuilder<TextInputBuilder>({
                        components: [new TextInputBuilder({
                            label: 'Enter your welcome message:',
                            custom_id: 'guild/welcome_menu/msg',
                            placeholder: 'Leave me blank to remove!',
                            style: TextInputStyle.Paragraph,
                            value: guild?.welcome_msg ?? '',
                            max_length: 2000,
                            required: false,
                        })],
                    })],
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
                        '> ${MEMBERCOUNT} - Replaces with the number of current members in the server.',
                    ephemeral: true,
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
            case 'channel':
            {
                const chn = interaction.guild.channels.resolve(actions.at(0) ?? '');
                if (chn) {
                    if (!chn.isTextBased()) {
                        await interaction.editReply({ content: null });
                        await interaction.followUp({
                            content: 'Channel must be a text channel.',
                            ephemeral: true,
                        });
                        return menu;
                    } if (!chn.permissionsFor(interaction.member).has(PermissionsBitField.Flags.SendMessages)) {
                        await interaction.editReply({ content: null });
                        await interaction.followUp({
                            content: `You do not have permission to send messages in ${chn}.`,
                            ephemeral: true,
                        });
                        return menu;
                    } else if (!chn.permissionsFor(interaction.guild.members.me!).has(
                        PermissionsBitField.Flags.SendMessages
                    )) {
                        await interaction.editReply({ content: null });
                        await interaction.followUp({
                            content: `I do not have permission to send messages in ${chn}.`,
                            ephemeral: true,
                        });
                        return menu;
                    }
                }
                guild.welcome_channelid = chn ? chn.id : chn;
                break;
            }
            case 'role':
            {
                const role = interaction.guild.roles.resolve(actions.at(0) ?? '');
                if (role) {
                    if (role.managed) {
                        await interaction.editReply({ content: null });
                        await interaction.followUp({
                            content: 'Cannot assign a bot role.',
                            ephemeral: true,
                        });
                        return menu;
                    }
                    const roleManager = interaction.guild.roles;
                    const me = interaction.guild.members.me!.roles.highest;
                    const them = interaction.member.roles.highest;
                    if (roleManager.comparePositions(me, role) <= 0) {
                        await interaction.followUp({
                            content: `I am unable to add ${role} due to my role ` +
                                    'being lower than it.',
                            ephemeral: true,
                        });
                        return menu;
                    } else if (interaction.guild.ownerId !== interaction.user.id &&
                                roleManager.comparePositions(them, role) <= 0) {
                        // Owner's role is always higher than the role they are adding.
                        await interaction.followUp({
                            content: `You are unable to add ${role} due to your highest role ` +
                                    'being lower than it.',
                            ephemeral: true,
                        });
                        return menu;
                    }
                }
                guild.welcome_roleid = role ? role.id : role;
                break;
            }
            default:
                throw new Error(`/guild: welcome_menu menuReact invalid action: ${menuType}`);
        };
        return menu;
    },
    textInput(guild, menu, fields) {
        const msg = fields.getTextInputValue('guild/welcome_menu/msg');
        guild.welcome_msg = msg;
        return menu;
    },
};
const emoji_menu: GuildMenus = {
    buildEmbeds(guild) {
        let description = '**Current Setting:**\n\n__Emoji Replacement:__';
        description += ` **${guild.emoji_replacement ? 'Enabled' : 'Disabled'}**`;
        return [new EmbedBuilder({
            title: 'Emoji Replacement Settings',
            color: Colors.Blue,
            description,
            footer: {
                text: 'Toggling this option will enable/disable server-wide emoji replacement.\n' +
                    'To toggle for individual channels, disable webhook permissions for the bot.',
            },
        })];
    },
    buildComponents(userID) {
        return [new ActionRowBuilder<ButtonBuilder>()
            .addComponents(
                new ButtonBuilder()
                    .setEmoji('🟢')
                    .setCustomId(`guild/${userID}/emoji_menu/enable`)
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setEmoji('🔴')
                    .setCustomId(`guild/${userID}/emoji_menu/disable`)
                    .setStyle(ButtonStyle.Danger),
                new ButtonBuilder()
                    .setEmoji('🔙')
                    .setCustomId(`guild/${userID}/emoji_menu/back`)
                    .setStyle(ButtonStyle.Primary)
            )];
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

type GuildPrivates = {
    buildComponents: (
        userID: string,
        guild: GuildType,
        menu: keyof GuildComponentTypes
    ) => ActionRowBuilder<DTypes.MessageActionRowComponentBuilder>[];
    buildEmbeds: (guild: GuildType, menu: keyof GuildComponentTypes) => DTypes.EmbedBuilder[];
};
export const guild: CachedSlashCommand<GuildCacheType> & GuildPrivates = {
    data: new SlashCommandBuilder()
        .setName('guild')
        .setDescription('Edits bot specific guild settings.')
        .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
        .setDMPermission(false),

    desc: 'Starts a dialogue to edit some guild settings.\n\n' +
          '__**<<RESTRICTED FOR USERS WITH MANAGE GUILD PERMISSIONS ONLY>>**__\n\n' +
          '__Replacement Options For Welcome Message:__\n' +
          '${USER} - Mentions the newly joined member.\n' +
          '${SERVER} - Replaces with the name of the server.\n' +
          '${MEMBERCOUNT} - Replaces with the number of current members in the server.\n\n' +
          'Usage: `/guild`',

    cache: new DB.Cache('guild'),

    buildComponents(userID, guild, menu) {
        switch(menu) {
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

    async buttonReact(interaction) {
        const [m, action] = interaction.customId.split('/').splice(2, 2);
        // A custom list of IDs that show modals, so we can't defer
        if (!(m === 'welcome_menu' && action === 'editmsg')) {
            await interaction.deferUpdate();
        }
        let menu = m as keyof GuildComponentTypes;
        if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        const guild = await this.cache.get(interaction.guildId);
        if (!guild) return; // This can happen if a button react comes late, just ignore.
        else if (guild.mid !== interaction.message.id) {
            // Expired guild dialog, try to delete message.
            return interaction.deleteReply();
        }
        switch (menu) {
            case 'main_menu':
                menu = await main_menu.buttonReact(guild, menu, action, interaction);
                break;
            case 'welcome_menu':
                menu = await welcome_menu.buttonReact(guild, menu, action, interaction);
                break;
            case 'emoji_menu':
                menu = await emoji_menu.buttonReact(guild, menu, action, interaction);
                break;
            default:
                throw new Error(`/guild: buttonReact invalid menu: ${menu}`);
        }
        await this.cache.set(interaction.guildId, guild);
        await DB.setGuild(guild);
        const embeds = this.buildEmbeds(guild, menu);
        const components = this.buildComponents(interaction.user.id, guild, menu);
        await interaction.editReply({ embeds, components });
    },

    async menuReact(interaction) {
        await interaction.deferUpdate();
        const [m, type] = interaction.customId.split('/').splice(2, 2);
        let menu = m as keyof GuildComponentTypes;
        if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        const guild = await this.cache.get(interaction.guildId);
        if (!guild) return; // This can happen if a menu react comes late, just ignore.
        else if (guild.mid !== interaction.message.id) {
            // Expired guild dialog, try to delete message.
            return interaction.deleteReply();
        }
        switch (menu) {
            case 'main_menu':
                menu = await main_menu.menuReact(guild, menu, interaction.values, interaction);
                break;
            case 'welcome_menu':
                menu = await welcome_menu.menuReact(guild, menu, [...interaction.values, type], interaction);
                break;
            case 'emoji_menu':
                menu = await emoji_menu.menuReact(guild, menu, interaction.values, interaction);
                break;
            default:
                throw new Error(`/guild: menuReact invalid menu: ${menu}`);
        }
        await this.cache.set(interaction.guildId, guild);
        await DB.setGuild(guild);
        const embeds = this.buildEmbeds(guild, menu);
        const components = this.buildComponents(interaction.user.id, guild, menu);
        await interaction.editReply({ embeds, components });
    },

    async textInput(interaction) {
        await interaction.deferUpdate();
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const [m, type] = interaction.customId.split('/').splice(2, 2);
        let menu = m as keyof GuildComponentTypes;
        if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        const guild = await this.cache.get(interaction.guildId);
        if (!guild) return; // This can happen if a button react comes late, just ignore.
        switch (menu) {
            case 'main_menu':
                menu = await main_menu.textInput(guild, menu, interaction.fields, interaction);
                break;
            case 'welcome_menu':
                menu = await welcome_menu.textInput(guild, menu, interaction.fields, interaction);
                break;
            case 'emoji_menu':
                menu = await emoji_menu.textInput(guild, menu, interaction.fields, interaction);
                break;
            default:
                throw new Error(`/guild: textInput invalid menu: ${menu}`);
        }
        await this.cache.set(interaction.guildId, guild);
        await DB.setGuild(guild);
        const embeds = this.buildEmbeds(guild, menu);
        const components = this.buildComponents(interaction.user.id, guild, menu);
        await interaction.editReply({ embeds, components });
    },

    async execute(interaction) {
        const message = await interaction.reply({ content: 'Loading...' }).then(i => i.fetch());
        if (!interaction.inCachedGuild()) {
            return console.log(`/guild: Guild ${interaction.guildId} not found in cache! Pls fix!`);
        }
        
        if (!interaction.channel!.permissionsFor(interaction.member)
            .has(PermissionsBitField.Flags.ManageGuild)) {
            return interaction.editReply({
                content: 'You do not have permission to edit guild settings.\n' +
                    'You need the `Manage Guild` permission.',
            }).then(() => { });
        }
        
        // Check to make sure that dialog does not currently exist for the guild
        // Only allow one user to access the dialog at a time
        let guild = await this.cache.get(interaction.guildId);
        // If it does exist, then we need to exit other dialog:
        if (guild) {
            const deleted = await this.cache.delete(interaction.guildId);
            if (deleted.length !== 1) {
                console.log(`/guild: Warning! Deleted ${deleted.length} entries for guild ${interaction.guildId}.`);
            }
        } else {
            // If none in cache, fetch current settings as cache
            guild = { ...await DB.getGuild(interaction.guildId), mid: '' };
            guild.gid = interaction.guildId;
        }

        guild.mid = message.id;
        await this.cache.set(interaction.guildId, guild);
        const embeds = this.buildEmbeds(guild, 'main_menu');
        const components = this.buildComponents(interaction.user.id, guild, 'main_menu');
        await interaction.editReply({ content: null, embeds, components });
    },
};
