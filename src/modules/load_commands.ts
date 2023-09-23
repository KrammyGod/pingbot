import glob from 'glob';
import path from 'path';
import {
    CommandFile, CustomClient, isInteractionCommand, isMessageCommand, isSlashCommand
} from '@classes/client';

export default async function load(client: CustomClient) {
    client.cogs = [];
    client.commands = new Map();
    client.admin_commands = new Map();
    client.message_commands = new Map();
    const commandFiles = glob.sync(path.resolve(__dirname, '../commands/*.js'));

    for (const file of commandFiles) {
        const fcommands = await import(file) as CommandFile;
        fcommands.commands = [];
        Object.values(fcommands).forEach(command => {
            if (isSlashCommand(command) || (isMessageCommand(command) && !command.admin)) {
                fcommands.commands.push(command);
            }
            if (isInteractionCommand(command)) {
                client.commands.set(command.data.name, command);
            } else if (isMessageCommand(command)) {
                if (command.admin) {
                    client.admin_commands.set(`${client.prefix}${command.name}`, command);
                } else {
                    client.message_commands.set(`${client.prefix}${command.name}`, command);
                }
            }
        });
        if (fcommands.commands.length) client.cogs.push(fcommands);
    }
    client.cogs.sort((a, b) => {
        if (a.commands.length === b.commands.length) {
            return a.name.localeCompare(b.name);
        }
        return b.commands.length - a.commands.length;
    });
}
