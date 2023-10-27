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
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.purge = exports.desc = exports.name = void 0;
const Utils = __importStar(require("../modules/utils"));
const exceptions_1 = require("../classes/exceptions");
const discord_js_1 = require("discord.js");
exports.name = 'Moderation';
exports.desc = 'Helpful bunch of commands for moderators who want an easier time.';
exports.purge = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('purge')
        .addStringOption(options => options
        .setName('amount')
        .setDescription('Amount of messages to delete.')
        .setRequired(true))
        .addUserOption(options => options
        .setName('user')
        .setDescription('User to filter messages (only delete from this user).'))
        .setDescription('Purge messages from a channel.'),
    desc: 'Want an easy way to purge any amount of message? You came to the right command!\n\n' +
        'Usage: `/purge amount: <amount> user: [user]`\n\n' +
        '__**Options**__\n' +
        '*amount:* The amount of messages to delete. Enter a number, or `all`\n' +
        '*user:* Delete only messages sent by this user. (Default: everyone)\n\n' +
        'Examples: `/purge amount: all`, `/purge amount: 5 user: @krammygod`',
    buttons: new discord_js_1.ActionRowBuilder()
        .addComponents(new discord_js_1.ButtonBuilder()
        .setCustomId('purge/confirm')
        .setLabel('Yes!')
        .setEmoji('🚮')
        .setStyle(discord_js_1.ButtonStyle.Danger), new discord_js_1.ButtonBuilder()
        .setCustomId('purge/cancel')
        .setLabel('No')
        .setStyle(discord_js_1.ButtonStyle.Secondary)),
    async delete_dms(channel, amount) {
        const self_filter = (m) => m.author.id === channel.client.user.id;
        let deleted = 0;
        let rounds = 0;
        for await (const msg of Utils.fetch_history(channel, amount, self_filter)) {
            await msg.delete().catch(() => --deleted);
            ++deleted;
            // Wait 1 second every 10 delete requests
            if (++rounds % 10 === 0)
                await new Promise(resolve => setTimeout(resolve, 1000));
        }
        return channel.send({ content: `Successfully deleted ${deleted} message(s).` })
            .then(m => { setTimeout(() => m.delete(), 3000); });
    },
    async delete_channel(interaction) {
        // Can't purge channel in DMs
        if (interaction.channel.isDMBased())
            return;
        else if (!(interaction.member instanceof discord_js_1.GuildMember))
            return;
        // Extra permissions for purge all
        if (!interaction.channel.permissionsFor(interaction.member)
            .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
            return interaction.editReply({
                content: 'You do not have permission to purge all.\n' +
                    'You need the `Manage Channels` permission.'
            }).then(() => { });
        }
        else if (!interaction.channel.permissionsFor(interaction.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ManageChannels)) {
            return interaction.editReply({
                content: "I don't have permission to purge all.\n" +
                    'I need the `Manage Channels` permission.'
            }).then(() => { });
        }
        if (interaction.channel.isThread()) {
            return interaction.reply({
                content: 'To purge all in threads, just simply delete the thread.'
            }).then(() => { });
        }
        const new_channel = await interaction.channel.clone({
            position: interaction.channel.rawPosition
        }).catch(() => {
            interaction.editReply({ content: "I can't purge here. Give me permissions to see the channel." });
            throw new exceptions_1.PermissionError();
        });
        await interaction.channel.delete();
        return new_channel.send({ content: `${interaction.user} Purged all messages.` })
            .then(msg => { setTimeout(() => msg.delete(), 3000); }).catch(() => { });
    },
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
            return interaction.editReply({ content: 'Enter a positive number.' });
        }
        const user = interaction.options.getUser('user');
        // Silent error if member is an API guild member; almost never
        if (!(interaction.member instanceof discord_js_1.GuildMember))
            return;
        if (interaction.channel.isDMBased() || !interaction.inGuild()) {
            // DMs
            if (isNaN(amount)) {
                return interaction.editReply({ content: "Can't delete all messages in DMs." });
            }
            return this.delete_dms(interaction.channel, amount);
        }
        else if (!interaction.channel.permissionsFor(interaction.member)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: 'You do not have permission to purge.\n' +
                    'You need the `Manage Messages` permission.'
            });
        }
        else if (!interaction.channel.permissionsFor(interaction.guild.members.me)
            .has(discord_js_1.PermissionsBitField.Flags.ManageMessages)) {
            return interaction.editReply({
                content: "I don't have permission to purge.\n" +
                    'I need the `Manage Messages` permission.'
            });
        }
        // Purge all, or anything over 100 messages, really
        if (isNaN(amount) || amount >= 100) {
            const buttonMessage = await interaction.editReply({
                content: "## Woah! That's a lot of messages!\n# Are you sure " +
                    `you want to delete ${isNaN(amount) ? 'all' : amount} messages?`,
                components: [this.buttons]
            });
            const confirmed = await buttonMessage.awaitMessageComponent({
                componentType: discord_js_1.ComponentType.Button,
                filter: i => i.user.id === interaction.user.id,
                time: 60000
            }).then(i => i.customId === 'purge/confirm').catch(() => false);
            if (!confirmed)
                return interaction.deleteReply();
            await interaction.editReply({ components: [] });
        }
        // Purge all
        if (isNaN(amount)) {
            return this.delete_channel(interaction);
        }
        // Copy discord.py's method of deleting
        // First test to see if we can fetch messages
        const test = await interaction.channel.messages.fetch({ limit: 1 })
            .catch(() => {
            interaction.editReply({
                content: "I can't purge here. Give me permissions to read the messages."
            });
            throw new exceptions_1.PermissionError();
        });
        if (test.size === 0) {
            return interaction.editReply({ content: 'No messages to delete.' });
        }
        await interaction.editReply({ content: 'Deleting messages...' });
        // Keep async to keep Promise<number> signature
        const bulk_delete = async (messages) => {
            // Discord bulk delete doesn't like single messages.
            if (messages.length <= 1) {
                return messages.at(0)?.delete().then(() => 1).catch(() => 0) ?? 0;
            }
            return interaction.channel.bulkDelete(messages).then(arr => arr.size);
        };
        // Inspired by discord.py's internal structure, delete messages one at a time
        // Useful for DMs/messages older than 14 days.
        const single_delete = async (messages) => {
            let deleted = 0;
            for (const msg of messages) {
                // Ignore deleting errors
                await msg.delete().catch(() => --deleted);
                ++deleted;
            }
            return deleted;
        };
        let strategy = bulk_delete;
        // This is the minimum date when messages can be bulk deleted
        // It is exactly 14 days ago.
        const min_date = new Date().getTime() - 14 * 24 * 60 * 60 * 1000;
        let to_delete = [];
        let deleted = 0;
        const user_filter = (m) => !user || m.author.id === user.id;
        for await (const msg of Utils.fetch_history(interaction.channel, amount, user_filter)) {
            // Delete every 100 since Discord's bulk delete is limited to 100 at a time.
            if (to_delete.length === 100) {
                deleted += await strategy(to_delete);
                to_delete = [];
                // Wait 1 second every 100 deletes
                await new Promise(resolve => setTimeout(resolve, 1000));
            }
            // Older than 14 days
            if (msg.createdTimestamp < min_date) {
                // If we hit a message that is older than 14 days
                // We need to first clear out all messages we have so far
                if (to_delete.length) {
                    deleted += await strategy(to_delete);
                    to_delete = [];
                }
                strategy = single_delete;
            }
            to_delete.push(msg);
        }
        // Leftover remaining undeleted messages
        if (to_delete.length) {
            deleted += await strategy(to_delete);
        }
        await Utils.deleteEphemeralMessage(interaction, message);
        return interaction.channel.send({ content: `${interaction.user} deleted ${deleted} message(s).` })
            .then(m => setTimeout(() => m.delete(), 3000)).catch(() => { });
    }
};
//# sourceMappingURL=mod_commands.js.map