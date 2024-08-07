import { ApplicationCommandOptionType, Client } from 'discord.js';
import * as commands from '../commands';
import type { Cog, CommandFile } from '@classes/commands';

function isString(isThisString: unknown): isThisString is string {
    return typeof isThisString === 'string';
}

export default function load(client: Client) {
    // Reset to prevent duplicate loads
    client.cogs = [];
    client.interaction_commands = new Map();
    client.message_commands = new Map();

    for (const commandFile of Object.values(commands)) {
        // Initialize a cog object
        const cog: Cog = {
            name: commandFile.name,
            desc: commandFile.desc,
            displayed_commands: [],
            real_command_count: 0,
        };
        // We assert that commandFile is a CommandFile object. If we don't follow it, it's the developer's fault.
        Object.values(commandFile as unknown as CommandFile).forEach(command => {
            // Ignore name and desc exported properties.
            if (isString(command)) return;
            if (command.isSlashCommand() || (command.isMessageCommand() && !command.admin)) {
                cog.displayed_commands.push(command);
            }
            // This should encapsulate all non-message commands exported due to the rules set in @classes/command
            if (command.isContextCommand() ||
                command.isSlashCommandWithSubcommand() ||
                command.isSlashCommandNoSubcommand()
            ) {
                client.interaction_commands.set(command.data.name, command);
                let has_subcommands = false;
                command.data.toJSON().options?.forEach(option => {
                    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
                        // Subcommand groups must only have subcommands as options
                        cog.real_command_count += option.options!.length;
                        has_subcommands = true;
                    } else if (option.type === ApplicationCommandOptionType.Subcommand) {
                        ++cog.real_command_count;
                        has_subcommands = true;
                    }
                });
                if (!has_subcommands) ++cog.real_command_count;
            } else if (command.isMessageCommand()) {
                client.message_commands.set(`${client.prefix}${command.name}`, command);
                if (!command.admin) ++cog.real_command_count;
            }
        });
        // Only push the cog if it has commands to display
        if (cog.displayed_commands.length) client.cogs.push(cog);
    }
    client.cogs.sort((a, b) => {
        if (a.real_command_count === b.real_command_count) {
            return a.name.localeCompare(b.name);
        }
        return b.real_command_count - a.real_command_count;
    });
}
