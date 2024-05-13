import * as DB from '@modules/database';
import * as Utils from '@modules/utils';
import * as Purge from '@modules/purge_utils';
import { CachedSlashCommand, SlashCommand } from '@classes/client';
import { PermissionError } from '@classes/exceptions';
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder,
    PermissionsBitField, ComponentType, SlashCommandBuilder, Colors,
    escapeCodeBlock, codeBlock, escapeEscape, escapeInlineCode
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
            ephemeral: true
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
                    'You need the `Manage Messages` permission.'
            }).then(() => { });
        } else if (!interaction.channel!.permissionsFor(interaction.guild.members.me!)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: "I don't have permission to purge.\n" +
                    'I need the `Manage Messages` permission.'
            }).then(() => { });
        }

        // Purge all, or anything over 100 messages, really
        if (isNaN(amount) || amount! >= 100) {
            const buttonMessage = await interaction.editReply({
                content: "## Woah! That's a lot of messages!\n# Are you sure " +
                    `you want to delete ${isNaN(amount) ? 'all' : amount} messages?`,
                components: [this.buttons]
            });

            const confirmed = await buttonMessage.awaitMessageComponent({
                componentType: ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 60_000
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
                        'You need the `Manage Channels` permission.'
                }).then(() => { });
            } else if (!interaction.channel!.permissionsFor(interaction.guild.members.me!)
                .has(PermissionsBitField.Flags.ManageChannels)) {
                return interaction.editReply({
                    content: "I don't have permission to purge all.\n" +
                        'I need the `Manage Channels` permission.'
                }).then(() => { });
            }

            // Check to satisfy typescript
            if (interaction.channel!.isThread()) {
                return interaction.editReply({
                    content: 'To purge all in threads, just simply delete the thread.'
                }).then(() => { });
            }
            const new_channel = await Purge.purge_clean_channel(interaction.channel!).catch(() => {
                interaction.editReply({
                    content: "I can't purge here. Make sure I have permissions to modify the channel."
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
                    'I need the `Read Message History` permission.'
            }).then(() => { });
        }

        const user_filter = (m: DTypes.Message) => !user || m.author.id === user.id;
        // Use our handy helper to purge for us.
        const deleted = await Purge.purge_from_channel(interaction.channel!, amount, user_filter);
        await Utils.delete_ephemeral_message(interaction, message);
        await interaction.channel!.send({ content: `${interaction.user} deleted ${deleted} message(s).` })
            .then(m => setTimeout(() => m.delete(), 3000)).catch(() => { });
    }
};

type GuildPrivates = {
    buildEmbed: (guild: Awaited<ReturnType<typeof DB.getGuild>>) => DTypes.EmbedBuilder;
};
type GuildCache = Awaited<ReturnType<typeof DB.getGuild>> & { mid: string };
export const guild: CachedSlashCommand<GuildCache> & GuildPrivates = {
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

    buildEmbed(guild) {
        const embed = new EmbedBuilder({
            title: 'Guild Settings',
            color: Colors.Blue
        });
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

        embed.setDescription(description);
        return embed;
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
                    'You need the `Manage Guild` permission.'
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
            guild = { ...await DB.getGuild(interaction.guildId), mid: message.id };
        }

        await this.cache.set(interaction.guildId, guild);
        const embed = this.buildEmbed(guild);
        await interaction.editReply({ content: '', embeds: [embed] });
    }
};
