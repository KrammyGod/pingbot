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
const client_1 = require("../classes/client");
async function load(client) {
    client.cogs = [];
    client.commands = new Map();
    client.admin_commands = new Map();
    client.message_commands = new Map();
    const commandFiles = glob_1.default.sync(path_1.default.resolve(__dirname, '../commands/*.js'));
    for (const file of commandFiles) {
        const fcommands = await Promise.resolve(`${file}`).then(s => __importStar(require(s)));
        fcommands.commands = [];
        Object.values(fcommands).forEach(command => {
            if ((0, client_1.isSlashCommand)(command) || ((0, client_1.isMessageCommand)(command) && !command.admin)) {
                fcommands.commands.push(command);
            }
            if ((0, client_1.isInteractionCommand)(command)) {
                client.commands.set(command.data.name, command);
            }
            else if ((0, client_1.isMessageCommand)(command)) {
                if (command.admin) {
                    client.admin_commands.set(`${client.prefix}${command.name}`, command);
                }
                else {
                    client.message_commands.set(`${client.prefix}${command.name}`, command);
                }
            }
        });
        if (fcommands.commands.length)
            client.cogs.push(fcommands);
    }
    client.cogs.sort((a, b) => {
        if (a.commands.length === b.commands.length) {
            return a.name.localeCompare(b.name);
        }
        return b.commands.length - a.commands.length;
    });
}
exports.default = load;
//# sourceMappingURL=load_commands.js.map