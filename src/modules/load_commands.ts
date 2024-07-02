import glob from 'glob';
import path from 'path';
import {
    CommandFile, CustomClient, isInteractionCommand, isMessageCommand, isSlashCommand,
} from '@classes/client';
import { ApplicationCommandOptionType, } from 'discord.js';

export default async function load(client: CustomClient) {
    client.cogs = [];
    client.commands = new Map();
    client.admin_commands = new Map();
    client.message_commands = new Map();
    const commandFiles = glob.sync(path.resolve(__dirname, '../commands/*.js'));

    for (const file of commandFiles) {
        const commandFile = await import(file) as CommandFile;
        commandFile.commands = [];
        commandFile.amt = 0;
        Object.values(commandFile).forEach(command => {
            if (isSlashCommand(command) || (isMessageCommand(command) && !command.admin)) {
                commandFile.commands.push(command);
            }
            if (isInteractionCommand(command)) {
                client.commands.set(command.data.name, command);
                let has_subcommands = false;
                command.data.toJSON().options?.forEach(option => {
                    if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
                        // Subcommand groups must only have subcommands as options
                        commandFile.amt += option.options!.length;
                        has_subcommands = true;
                    } else if (option.type === ApplicationCommandOptionType.Subcommand) {
                        ++commandFile.amt;
                        has_subcommands = true;
                    }
                });
                if (!has_subcommands) ++commandFile.amt;
            } else if (isMessageCommand(command)) {
                if (command.admin) {
                    client.admin_commands.set(`${client.prefix}${command.name}`, command);
                } else {
                    client.message_commands.set(`${client.prefix}${command.name}`, command);
                }
                ++commandFile.amt;
            }
        });
        if (commandFile.commands.length) client.cogs.push(commandFile);
    }
    client.cogs.sort((a, b) => {
        if (a.amt === b.amt) {
            return a.name.localeCompare(b.name);
        }
        return b.amt - a.amt;
    });
}
