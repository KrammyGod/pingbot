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
const glob_1 = __importDefault(require("glob"));
const path_1 = __importDefault(require("path"));
const _config_1 = __importDefault(require("../classes/config.js"));
const rest_1 = require("@discordjs/rest");
const v10_1 = require("discord-api-types/v10");
const discord_js_1 = require("discord.js");
const command_types_1 = require("../classes/command_types");
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
(async function () {
    // Read all commands from the commands directory
    const commands = [];
    const commandFiles = glob_1.default.sync(path_1.default.resolve(__dirname, '../commands/*.js'));
    const rest = new rest_1.REST({ version: '10' }).setToken(token);
    for (const file of commandFiles) {
        const commandFile = await Promise.resolve(`${file}`).then(s => __importStar(require(s)));
        // Do not deploy message commands.
        Object.values(commandFile).forEach(command => {
            if ((0, command_types_1.isInteractionCommand)(command)) {
                const commandData = command.data.toJSON();
                if (_config_1.default.events) {
                    // April Fools reverse command
                    commandData.name = commandData.name.split('').reverse().join('');
                    if ((0, command_types_1.isSlashCommand)(command)) {
                        // @ts-expect-error We know it's not a context command, but typescript doesn't know that.
                        (commandData).description = commandData.description.split('').reverse().join('');
                        reverse_command(commandData);
                    }
                }
                commands.push(commandData);
            }
        });
    }
    const res = await rest.put(v10_1.Routes.applicationCommands(clientId), { body: commands })
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