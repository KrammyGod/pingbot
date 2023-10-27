import * as Utils from '@modules/utils';
import { SlashCommand } from '@classes/client';
import { PermissionError } from '@classes/exceptions';
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    PermissionsBitField, ComponentType, SlashCommandBuilder, GuildMember
} from 'discord.js';
import type DTypes from 'discord.js';

export const name = 'Moderation';
export const desc = 'Helpful bunch of commands for moderators who want an easier time.';

type PurgePrivates = {
    buttons: ActionRowBuilder<DTypes.MessageActionRowComponentBuilder>;
    delete_single: (msgs: DTypes.Message[]) => Promise<number>;
    delete_dms: (channel: DTypes.TextBasedChannel, amount: number) => Promise<void>;
    delete_channel: (interaction: DTypes.ChatInputCommandInteraction) => Promise<void>;
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
        .setDescription('Purge messages from a channel.'),
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

    async delete_dms(channel, amount) {
        let deleted = 0;
        while (amount > 0) {
            const messages = await Utils.fetch_history(
                channel, amount, (m) => m.author.id === channel.client.user.id
            );
            if (messages.length === 0) break;
            const burst: number = await this.delete_single(messages);
            amount -= burst;
            deleted += burst;
        }
        return channel.send({ content: `Successfully deleted ${deleted} message(s).` })
            .then(m => { setTimeout(() => m.delete(), 3000); });
    },

    async delete_channel(interaction) {
        // Can't purge channel in DMs
        if (interaction.channel!.isDMBased()) return;
        else if (!(interaction.member instanceof GuildMember)) return;
        // Extra permissions for purge all
        if (!interaction.channel!.permissionsFor(interaction.member!)
            .has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.editReply({
                content: 'You do not have permission to purge all.\n' +
                    'You need the `Manage Channels` permission.'
            }).then(() => { });
        } else if (!interaction.channel!.permissionsFor(interaction.guild!.members.me!)
            .has(PermissionsBitField.Flags.ManageChannels)) {
            return interaction.editReply({
                content: "I don't have permission to purge all.\n" +
                    'I need the `Manage Channels` permission.'
            }).then(() => { });
        }

        if (interaction.channel!.isThread()) {
            return interaction.reply({
                content: 'To purge all in threads, just simply delete the thread.'
            }).then(() => { });
        }
        const new_channel = await interaction.channel!.clone({
            position: interaction.channel!.rawPosition
        }).catch(() => {
            interaction.editReply({ content: "I can't purge here. Give me permissions to see the channel." });
            throw new PermissionError();
        });
        await interaction.channel!.delete();
        return new_channel.send({ content: `${interaction.user} Purged all messages.` })
            .then(msg => { setTimeout(() => msg.delete(), 3000); }).catch(() => { });
    },

    async execute(interaction, client) {
        const message = await interaction.reply({
            content: 'Performing intensive calculations...',
            ephemeral: true
        }).then(i => i.fetch());
        // Parse input
        // amount being NaN means all is true.
        const amt = interaction.options.getString('amount', true);
        const amount = parseInt(amt);
        if (amt.toLowerCase() !== 'all' && (isNaN(amount) || amount <= 0)) {
            return interaction.editReply({ content: 'Enter a positive number.' });
        }
        const user = interaction.options.getUser('user');

        // Silent error if member is an API guild member; almost never
        if (!(interaction.member instanceof GuildMember)) return;
        if (interaction.channel!.isDMBased() || !interaction.inGuild()) {
            // DMs
            if (isNaN(amount)) {
                return interaction.editReply({ content: "Can't delete all messages in DMs." });
            }
            return this.delete_dms(interaction.channel!, amount);
        } else if (!interaction.channel!.permissionsFor(interaction.member!)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: 'You do not have permission to purge.\n' +
                    'You need the `Manage Messages` permission.'
            });
        } else if (!interaction.channel!.permissionsFor(interaction.guild!.members.me!)
            .has(PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: "I don't have permission to purge.\n" +
                    'I need the `Manage Messages` permission.'
            });
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
            return this.delete_channel(interaction);
        }

        // Copy discord.py's method of deleting
        // First test to see if we can fetch messages
        const test = await interaction.channel!.messages.fetch({ limit: 1 })
            .catch(() => {
                interaction.editReply({
                    content: "I can't purge here. Give me permissions to read the messages."
                });
                throw new PermissionError();
            });
        if (test.size === 0) {
            return interaction.editReply({ content: 'No messages to delete.' });
        }

        const history = await Utils.fetch_history(interaction.channel!, amount!, m => {
            return !user || m.author.id === user.id;
        });
        // This is the minimum date when messages can be bulk deleted
        // It is exactly 14 days ago.
        const min_date = new Date().getTime() - 14 * 24 * 60 * 60 * 1000;
        let to_delete: DTypes.Message[] = [];
        let deleted = 0;
        while (history.length) {
            // Grab next message
            const msg = history.shift()!;
            // Older than 14 days
            if (msg.createdTimestamp < min_date) {
                // If we hit a message that is older than 14 days
                // We need to first clear out all messages we have so far
                if (to_delete.length) {
                    if (to_delete.length === 1) {
                        await to_delete[0].delete();
                        ++deleted;
                    } else {
                        const arr = await interaction.channel!.bulkDelete(to_delete);
                        deleted += arr.size;
                    }
                }
                // Then we have to delete them one by one,
                // due to Discord's method of deleting old messages.
                const arr = [msg];
                arr.push(...history);
                deleted += await this.delete_single(arr);
                to_delete = [];
                break;
            } else if (to_delete.length === 100) {
                // Discord's bulk delete is limited to 100 at a time.
                const arr = await interaction.channel!.bulkDelete(to_delete);
                deleted += arr.size;
                to_delete = [];
            }
            to_delete.push(msg);
        }
        // Leftover remaining undeleted messages
        if (to_delete.length) {
            // Single messages, delete single to be safe
            if (to_delete.length === 1) {
                await to_delete[0].delete();
                ++deleted;
            } else {
                const arr = await interaction.channel!.bulkDelete(to_delete);
                deleted += arr.size;
            }
        }

        await client.deleteFollowUp(interaction, message);
        return interaction.channel!.send({ content: `${interaction.user} deleted ${deleted} message(s).` })
            .then(m => setTimeout(() => m.delete(), 3000)).catch(() => { });
    }
};