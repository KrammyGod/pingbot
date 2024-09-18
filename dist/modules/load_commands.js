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
exports.default = load;
const discord_js_1 = require("discord.js");
const commands = __importStar(require("../commands"));
function isString(isThisString) {
    return typeof isThisString === 'string';
}
// This function helps us assert that the values of importing all the commands
// is of type CommandFile. This is useful for type checking.
function valuesOfCommandFiles(commands) {
    return Object.values(commands);
}
function load(client) {
    // Reset to prevent duplicate loads
    client.cogs = [];
    client.interaction_commands = new Map();
    client.message_commands = new Map();
    for (const commandFile of valuesOfCommandFiles(commands)) {
        // Initialize a cog object
        const cog = {
            name: commandFile.name,
            desc: commandFile.desc,
            displayed_commands: [],
            real_command_count: 0,
        };
        // We assert that commandFile is a CommandFile object. If we error here, it's the developer's fault.
        Object.values(commandFile).forEach(command => {
            // Ignore name and desc exported properties.
            if (isString(command))
                return;
            if (command.isSlashCommand() || (command.isMessageCommand() && !command.admin)) {
                cog.displayed_commands.push(command);
            }
            // This should encapsulate all non-message commands exported due to the rules set in @classes/command
            if (command.isContextCommand() ||
                command.isSlashCommandWithSubcommand() ||
                command.isSlashCommandNoSubcommand()) {
                client.interaction_commands.set(command.data.name, command);
                let has_subcommands = false;
                command.data.toJSON().options?.forEach(option => {
                    if (option.type === discord_js_1.ApplicationCommandOptionType.SubcommandGroup) {
                        // Subcommand groups must only have subcommands as options
                        cog.real_command_count += option.options.length;
                        has_subcommands = true;
                    }
                    else if (option.type === discord_js_1.ApplicationCommandOptionType.Subcommand) {
                        ++cog.real_command_count;
                        has_subcommands = true;
                    }
                });
                if (!has_subcommands)
                    ++cog.real_command_count;
            }
            else if (command.isMessageCommand()) {
                client.message_commands.set(`${client.prefix}${command.name}`, command);
                if (!command.admin)
                    ++cog.real_command_count;
            }
        });
        // Only push the cog if it has commands to display
        if (cog.displayed_commands.length)
            client.cogs.push(cog);
    }
    client.cogs.sort((a, b) => {
        if (a.real_command_count === b.real_command_count) {
            return a.name.localeCompare(b.name);
        }
        return b.real_command_count - a.real_command_count;
    });
}
//# sourceMappingURL=load_commands.js.map