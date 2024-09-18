/* This file deals with all the slash command setup */
import * as commands from '../commands';
import config from '@config';
import { REST } from '@discordjs/rest';
import { Routes } from 'discord-api-types/v10';
import type {
    APIApplicationCommand,
    APIApplicationCommandOption,
    ClientUser,
    RESTPostAPIChatInputApplicationCommandsJSONBody,
    RESTPostAPIContextMenuApplicationCommandsJSONBody,
    SharedNameAndDescription,
} from 'discord.js';
import { ApplicationCommandOptionType } from 'discord.js';
import type { CommandFile } from '@classes/commands';

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

function isString(isThisString: unknown): isThisString is string {
    return typeof isThisString === 'string';
}

type JSONConvertible = SharedNameAndDescription & { toJSON(): RESTPostAPIChatInputApplicationCommandsJSONBody };

(async function () {
    // Read all commands from the commands directory
    const commandsToDeploy: (
        RESTPostAPIContextMenuApplicationCommandsJSONBody | RESTPostAPIChatInputApplicationCommandsJSONBody
    )[] = [];
    const rest = new REST({ version: '10' }).setToken(token);

    for (const commandFile of Object.values(commands)) {
        Object.values(commandFile as unknown as CommandFile).forEach(command => {
            // Ignore name and desc exported properties.
            if (isString(command)) return;
            // Do not deploy message commands.
            if (command.isInteractionCommand()) {
                const commandData = (command.data as JSONConvertible).toJSON();
                if (config.events) {
                    // April Fools reverse command
                    commandData.name = commandData.name.split('').reverse().join('');
                    if (command.isSlashCommand()) {
                        commandData.description = commandData.description.split('').reverse().join('');
                        reverse_command(commandData);
                    }
                }
                commandsToDeploy.push(commandData);
            }
        });
    }
    const res = await rest.put(Routes.applicationCommands(clientId), { body: commandsToDeploy })
        .catch(err => console.error(err)) as APIApplicationCommand[];
    const user = await rest.get(Routes.user()).catch(err => console.error(err)) as ClientUser | void;
    if (user) {
        console.log(`${user.username}: Successfully registered ${res.length} application commands (/).`);
    } else {
        console.log('Unknown user, might be error?');
    }
})();
