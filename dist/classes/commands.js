"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.ContextCommand = exports.SlashSubcommand = exports.SlashSubcommandGroup = exports.SlashCommandWithSubcommand = exports.SlashCommandNoSubcommand = exports.MessageCommand = void 0;
const database_1 = require("../modules/database");
const DEFAULT_COMMAND_FUNCTION = async (...args) => {
    // We guarantee that the last argument is the command object based on usage
    throw new Error(`No function defined for ${args}`);
};
var CommandType;
(function (CommandType) {
    CommandType[CommandType["NONE"] = 0] = "NONE";
    CommandType[CommandType["MESSAGE_COMMAND"] = 1] = "MESSAGE_COMMAND";
    CommandType[CommandType["SLASH_COMMAND_NO_SUBCOMMAND"] = 2] = "SLASH_COMMAND_NO_SUBCOMMAND";
    CommandType[CommandType["SLASH_COMMAND_WITH_SUBCOMMAND"] = 3] = "SLASH_COMMAND_WITH_SUBCOMMAND";
    CommandType[CommandType["SLASH_SUBCOMMAND_GROUP"] = 4] = "SLASH_SUBCOMMAND_GROUP";
    CommandType[CommandType["SLASH_SUBCOMMAND"] = 5] = "SLASH_SUBCOMMAND";
    CommandType[CommandType["CONTEXT_COMMAND"] = 6] = "CONTEXT_COMMAND";
})(CommandType || (CommandType = {}));
/**
 * Base class for all commands.
 */
class BaseCommand {
    constructor(options) {
        this.long_description = options.long_description;
        this.admin = options.admin ?? false;
        this.type = CommandType.NONE;
    }
    isMessageCommand() {
        return this.type === CommandType.MESSAGE_COMMAND;
    }
    isSlashCommandNoSubcommand() {
        return this.type === CommandType.SLASH_COMMAND_NO_SUBCOMMAND;
    }
    isSlashCommandWithSubcommand() {
        return this.type === CommandType.SLASH_COMMAND_WITH_SUBCOMMAND;
    }
    isSlashSubcommandGroup() {
        return this.type === CommandType.SLASH_SUBCOMMAND_GROUP;
    }
    isSlashSubcommand() {
        return this.type === CommandType.SLASH_SUBCOMMAND;
    }
    isContextCommand() {
        return this.type === CommandType.CONTEXT_COMMAND;
    }
    isSlashCommand() {
        return this.isSlashCommandNoSubcommand() || this.isSlashCommandWithSubcommand() ||
            this.isSlashSubcommandGroup() || this.isSlashSubcommand();
    }
    isInteractionCommand() {
        return this.isSlashCommand() || this.isContextCommand();
    }
}
/**
 * Class for message commands.
 * Objects of this class can be exported by command files.
 */
class MessageCommand extends BaseCommand {
    constructor(options) {
        super(options);
        this.name = options.name;
        this.cache = new database_1.Cache(this.name);
        this.execute = (options.execute ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.type = CommandType.MESSAGE_COMMAND;
    }
    register(fns) {
        if (fns.execute)
            this.execute = fns.execute.bind(this);
        return this;
    }
}
exports.MessageCommand = MessageCommand;
/**
 * Base Class for any slash commands.
 * Do not export anything of this type.
 */
class SlashCommand extends BaseCommand {
    constructor(options) {
        super(options);
        this.data = options.data;
        this.cache = new database_1.Cache(this.data.name);
        this.execute = (options.execute ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.buttonReact = (options.buttonReact ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.menuReact = (options.menuReact ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.textInput = (options.textInput ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.type = CommandType.NONE;
    }
    // Very powerful command to allow the registering to overwrite any default set functions.
    // For example, perhaps the buttonReact on subcommands need extra functionality that the default
    // cannot provide. This allows for overriding the default after setting it to whatever you want.
    register(fns) {
        if (fns.execute)
            this.execute = fns.execute.bind(this);
        if (fns.buttonReact)
            this.buttonReact = fns.buttonReact.bind(this);
        if (fns.menuReact)
            this.menuReact = fns.menuReact.bind(this);
        if (fns.textInput)
            this.textInput = fns.textInput.bind(this);
        return this;
    }
}
/**
 * Class for slash commands with no subcommands.
 * Objects of this class can be exported by command files.
 */
class SlashCommandNoSubcommand extends SlashCommand {
    constructor(options) {
        super(options);
        this.type = CommandType.SLASH_COMMAND_NO_SUBCOMMAND;
    }
}
exports.SlashCommandNoSubcommand = SlashCommandNoSubcommand;
/**
 * Class for slash commands with subcommands.
 * Objects of this class can be exported by command files.
 */
class SlashCommandWithSubcommand extends SlashCommand {
    constructor(options) {
        super(options);
        this.subcommands = new Map();
        this.type = CommandType.SLASH_COMMAND_WITH_SUBCOMMAND;
        // Different from SlashCommand without subcommands in the sense that we handle the execute
        // and all other functions automatically so only one definition is required in the lowest subcommand level.
        this.execute = async function (i) {
            if (this.subcommands.size === 0)
                throw new Error(`execute: NO SUBCOMMANDS FOR ${this.data.name}`);
            const subcommand = this.subcommands.get(i.options.getSubcommandGroup(false) ??
                i.options.getSubcommand());
            if (!subcommand)
                throw new Error(`execute: SUBCOMMAND FOR ${this.data.name} NOT FOUND`);
            return subcommand.execute.bind(this)(i);
        };
        this.buttonReact = async function (i) {
            if (this.subcommands.size === 0)
                throw new Error(`buttonReact: NO SUBCOMMANDS FOR ${this.data.name}`);
            const subcommandName = await options.buttonReactGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand)
                throw new Error(`buttonReact: SUBCOMMAND FOR ${this.data.name} NOT FOUND`);
            return subcommand.buttonReact(i);
        };
        this.menuReact = async function (i) {
            if (this.subcommands.size === 0)
                throw new Error(`menuReact: NO SUBCOMMANDS FOR ${this.data.name}`);
            const subcommandName = await options.menuReactGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand)
                throw new Error(`menuReact: SUBCOMMAND FOR ${this.data.name} NOT FOUND`);
            return subcommand.menuReact.bind(this)(i);
        };
        this.textInput = async function (i) {
            if (this.subcommands.size === 0)
                throw new Error(`textInput: NO SUBCOMMANDS FOR ${this.data.name}`);
            const subcommandName = await options.textInputGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand)
                throw new Error(`textInput: SUBCOMMAND FOR ${this.data.name} NOT FOUND`);
            return subcommand.textInput.bind(this)(i);
        };
        for (const subcommand of options.subcommands ?? []) {
            if (subcommand.isSlashSubcommand())
                this.addSubcommand(subcommand);
            else
                this.addSubcommandGroup(subcommand);
        }
    }
    addSubcommand(subcommand) {
        this.data.addSubcommand(subcommand.data);
        this.subcommands.set(subcommand.data.name, subcommand);
        return this;
    }
    addSubcommandGroup(subcommandGroup) {
        this.data.addSubcommandGroup(subcommandGroup.data);
        this.subcommands.set(subcommandGroup.data.name, subcommandGroup);
        return this;
    }
}
exports.SlashCommandWithSubcommand = SlashCommandWithSubcommand;
/**
 * Class for subcommand groups. This can have subcommands added to it.
 * Objects of this class should not be exported by command files.
 */
class SlashSubcommandGroup extends SlashCommand {
    constructor(options) {
        super(options);
        this.subcommands = new Map();
        this.type = CommandType.SLASH_SUBCOMMAND_GROUP;
        // Different from SlashCommand without subcommands in the sense that we handle the execute
        // and all other functions automatically so only one definition is required in the lowest subcommand level.
        this.execute = async function (i) {
            if (this.subcommands.size === 0)
                throw new Error(`execute: NO SUBCOMMANDS IN GROUP ${this.data.name}`);
            const subcommand = this.subcommands.get(i.options.getSubcommand());
            if (!subcommand)
                throw new Error(`execute: SUBCOMMAND IN GROUP ${this.data.name} NOT FOUND`);
            return subcommand.execute.bind(this)(i);
        };
        this.buttonReact = async function (i) {
            if (this.subcommands.size === 0)
                throw new Error(`buttonReact: NO SUBCOMMANDS IN GROUP ${this.data.name}`);
            const subcommandName = await options.buttonReactGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand)
                throw new Error(`buttonReact: SUBCOMMAND IN GROUP ${this.data.name} NOT FOUND`);
            return subcommand.buttonReact.bind(this)(i);
        };
        this.menuReact = async function (i) {
            if (this.subcommands.size === 0)
                throw new Error(`menuReact: NO SUBCOMMANDS IN GROUP ${this.data.name}`);
            const subcommandName = await options.menuReactGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand)
                throw new Error(`menuReact: SUBCOMMAND IN GROUP ${this.data.name} NOT FOUND`);
            return subcommand.menuReact.bind(this)(i);
        };
        this.textInput = async function (i) {
            if (this.subcommands.size === 0)
                throw new Error(`textInput: NO SUBCOMMANDS IN GROUP ${this.data.name}`);
            const subcommandName = await options.textInputGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand)
                throw new Error(`textInput: SUBCOMMAND IN GROUP ${this.data.name} NOT FOUND`);
            return subcommand.textInput.bind(this)(i);
        };
        for (const subcommand of options.subcommands ?? []) {
            this.addSubcommand(subcommand);
        }
    }
    addSubcommand(subcommand) {
        this.data.addSubcommand(subcommand.data);
        this.subcommands.set(subcommand.data.name, subcommand);
        return this;
    }
}
exports.SlashSubcommandGroup = SlashSubcommandGroup;
/**
 * Class for subcommands. This is the lowest level; no more subcommands can be added.
 * Objects of this class should not be exported by command files.
 */
class SlashSubcommand extends SlashCommand {
    constructor(options) {
        super(options);
        this.type = CommandType.SLASH_SUBCOMMAND;
    }
}
exports.SlashSubcommand = SlashSubcommand;
/**
 * Class for context menu commands.
 * Objects of this class can be exported by command files.
 */
class ContextCommand extends BaseCommand {
    constructor(options) {
        super(options);
        this.data = options.data;
        this.cache = new database_1.Cache(this.data.name);
        this.execute = (options.execute ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.type = CommandType.CONTEXT_COMMAND;
    }
    register(fns) {
        if (fns.execute)
            this.execute = fns.execute.bind(this);
        return this;
    }
}
exports.ContextCommand = ContextCommand;
//# sourceMappingURL=commands.js.map