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
const glob_1 = __importDefault(require("glob"));
const path_1 = __importDefault(require("path"));
const discord_js_1 = require("discord.js");
const utils_1 = require("./utils");
async function load(client) {
    client.cogs = [];
    client.commands = new Map();
    client.admin_commands = new Map();
    client.message_commands = new Map();
    const commandFiles = glob_1.default.sync(path_1.default.resolve(__dirname, '../commands/*.js'));
    for (const file of commandFiles) {
        const commandFile = await Promise.resolve(`${file}`).then(s => __importStar(require(s)));
        commandFile.commands = [];
        commandFile.amt = 0;
        Object.values(commandFile).forEach(command => {
            if ((0, utils_1.isSlashCommand)(command) || ((0, utils_1.isMessageCommand)(command) && !command.admin)) {
                commandFile.commands.push(command);
            }
            if ((0, utils_1.isInteractionCommand)(command)) {
                client.commands.set(command.data.name, command);
                let has_subcommands = false;
                command.data.toJSON().options?.forEach(option => {
                    if (option.type === discord_js_1.ApplicationCommandOptionType.SubcommandGroup) {
                        // Subcommand groups must only have subcommands as options
                        commandFile.amt += option.options.length;
                        has_subcommands = true;
                    }
                    else if (option.type === discord_js_1.ApplicationCommandOptionType.Subcommand) {
                        ++commandFile.amt;
                        has_subcommands = true;
                    }
                });
                if (!has_subcommands)
                    ++commandFile.amt;
            }
            else if ((0, utils_1.isMessageCommand)(command)) {
                if (command.admin) {
                    client.admin_commands.set(`${client.prefix}${command.name}`, command);
                }
                else {
                    client.message_commands.set(`${client.prefix}${command.name}`, command);
                }
                ++commandFile.amt;
            }
        });
        if (commandFile.commands.length)
            client.cogs.push(commandFile);
    }
    client.cogs.sort((a, b) => {
        if (a.amt === b.amt) {
            return a.name.localeCompare(b.name);
        }
        return b.amt - a.amt;
    });
}
exports.default = load;
//# sourceMappingURL=load_commands.js.map