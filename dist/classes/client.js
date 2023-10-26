"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.CustomClient = exports.GuildVoices = exports.isMessageCommand = exports.isInteractionCommand = exports.isContextCommand = exports.isSlashCommand = exports.isSlashSubcommandGroup = exports.isSlashSubcommand = void 0;
const _config_1 = __importDefault(require("./config.js"));
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
exports.GuildVoices = new Map();
class CustomClient extends discord_js_1.Client {
    constructor(options) {
        if (CustomClient._instance) {
            return CustomClient._instance;
        }
        super(options);
        this.is_ready = false;
        this.is_listening = true;
        this.prefix = _config_1.default.prefix;
        this.bot_emojis = {};
        this.lines = [];
        this.commands = new Map();
        this.user_cache_ready = false;
        this.deleteFollowUp = async (i, msg) => {
            return this.rest.delete(discord_js_1.Routes.webhookMessage(i.webhook.id, i.token, msg.id));
        };
        // Everything is ready, set instance here
        CustomClient._instance = this;
    }
}
exports.CustomClient = CustomClient;
//# sourceMappingURL=client.js.map