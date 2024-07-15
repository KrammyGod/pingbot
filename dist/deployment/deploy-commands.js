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
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
/* This file deals with all the slash command setup */
const commands = __importStar(require("../commands"));
const _config_1 = __importDefault(require("../classes/config.js"));
const rest_1 = require("@discordjs/rest");
const v10_1 = require("discord-api-types/v10");
const discord_js_1 = require("discord.js");
const token = _config_1.default.token ?? '';
const clientId = _config_1.default.client ?? '';
function reverse_command(cmd) {
    cmd.options?.forEach(option => {
        option.name = option.name.split('').reverse().join('');
        option.description = option.description.split('').reverse().join('');
        if (option.type === discord_js_1.ApplicationCommandOptionType.SubcommandGroup) {
            reverse_command(option);
        }
        else if (option.type === discord_js_1.ApplicationCommandOptionType.Subcommand) {
            reverse_command(option);
        }
    });
}
function isString(isThisString) {
    return typeof isThisString === 'string';
}
(async function () {
    // Read all commands from the commands directory
    const commandsToDeploy = [];
    const rest = new rest_1.REST({ version: '10' }).setToken(token);
    for (const commandFile of Object.values(commands)) {
        Object.values(commandFile).forEach(command => {
            // Ignore name and desc exported properties.
            if (isString(command))
                return;
            // Do not deploy message commands.
            if (command.isInteractionCommand()) {
                const commandData = command.data.toJSON();
                if (_config_1.default.events) {
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
    const res = await rest.put(v10_1.Routes.applicationCommands(clientId), { body: commandsToDeploy })
        .catch(err => console.error(err));
    const user = await rest.get(v10_1.Routes.user()).catch(err => console.error(err));
    if (user) {
        console.log(`${user.username}: Successfully registered ${res.length} application commands (/).`);
    }
    else {
        console.log('Unknown user, might be error?');
    }
})();
//# sourceMappingURL=deploy-commands.js.map