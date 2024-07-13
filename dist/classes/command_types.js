"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.isMessageCommand = exports.isInteractionCommand = exports.isContextCommand = exports.isSlashCommand = exports.isSlashSubcommandGroup = exports.isSlashSubcommand = void 0;
const discord_js_1 = require("discord.js");
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSlashSubcommand(obj) {
    return obj && obj.data instanceof discord_js_1.SlashCommandSubcommandBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.execute.length <= 2;
}
exports.isSlashSubcommand = isSlashSubcommand;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSlashSubcommandGroup(obj) {
    return obj && obj.data instanceof discord_js_1.SlashCommandSubcommandGroupBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.subcommands && obj.execute.length <= 2;
}
exports.isSlashSubcommandGroup = isSlashSubcommandGroup;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isSlashCommand(obj) {
    return obj && obj.data instanceof discord_js_1.SlashCommandBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.execute.length <= 2;
}
exports.isSlashCommand = isSlashCommand;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isContextCommand(obj) {
    return obj && obj.data instanceof discord_js_1.ContextMenuCommandBuilder &&
        typeof obj.execute === 'function' && obj.execute.length <= 2;
}
exports.isContextCommand = isContextCommand;
function isInteractionCommand(obj) {
    return isSlashCommand(obj) || isContextCommand(obj);
}
exports.isInteractionCommand = isInteractionCommand;
// eslint-disable-next-line @typescript-eslint/no-explicit-any
function isMessageCommand(obj) {
    return obj && typeof obj.name === 'string' && typeof obj.admin === 'boolean' &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' && obj.execute.length <= 3;
}
exports.isMessageCommand = isMessageCommand;
//# sourceMappingURL=command_types.js.map