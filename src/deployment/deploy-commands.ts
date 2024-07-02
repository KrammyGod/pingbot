/* This file deals with all the slash command setup */
import glob from 'glob';
import path from 'path';
import config from '@config';
import { REST, } from '@discordjs/rest';
import { Routes, } from 'discord-api-types/v10';
import { ApplicationCommandOptionType, } from 'discord.js';
import { CommandFile, isInteractionCommand, isSlashCommand, } from '@classes/client';
import type {
    APIApplicationCommand,
    APIApplicationCommandOption,
    ClientUser,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
    RESTPostAPIContextMenuApplicationCommandsJSONBody,
} from 'discord.js';

const token = config.token ?? '';
const clientId = config.client ?? '';

function reverse_command(cmd: { options?: APIApplicationCommandOption[] }) {
    cmd.options?.forEach(option => {
        option.name = option.name.split('').reverse().join('');
        option.description = option.description.split('').reverse().join('');
        if (option.type === ApplicationCommandOptionType.SubcommandGroup) {
            reverse_command(option);
        } else if (option.type === ApplicationCommandOptionType.Subcommand) {
            reverse_command(option);
        }
    });
}

(async function () {
    // Read all commands from the commands directory
    const commands: (
        RESTPostAPIContextMenuApplicationCommandsJSONBody | RESTPostAPIChatInputApplicationCommandsJSONBody
    )[] = [];
    const commandFiles = glob.sync(path.resolve(__dirname, '../commands/*.js'));
    const rest = new REST({ version: '10' }).setToken(token);

    for (const file of commandFiles) {
        const commandFile = await import(file) as CommandFile;
        // Do not deploy message commands.
        Object.values(commandFile).forEach(command => {
            if (isInteractionCommand(command)) {
                const commandData = command.data.toJSON();
                if (config.events) {
                    // April Fools reverse command
                    commandData.name = commandData.name.split('').reverse().join('');
                    if (isSlashCommand(command)) {
                        // @ts-expect-error We know it's not a context command, but typescript doesn't know that.
                        (commandData).description = commandData.description.split('').reverse().join('');
                        reverse_command(commandData);
                    }
                }
                commands.push(commandData);
            }
        });
    }
    const res = await rest.put(Routes.applicationCommands(clientId), { body: commands })
        .catch(err => console.error(err)) as APIApplicationCommand[];
    const user = await rest.get(Routes.user()).catch(err => console.error(err)) as ClientUser | void;
    if (user) {
        console.log(`${user.username}: Successfully registered ${res.length} application commands (/).`);
    } else {
        console.log('Unknown user, might be error?');
    }
})();
