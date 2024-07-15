import { inspect } from 'util';
import {
    AnySelectMenuInteraction,
    Awaitable,
    ButtonInteraction,
    ChatInputCommandInteraction,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    Message,
    ModalSubmitInteraction,
    SharedNameAndDescription,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import { Cache } from '@modules/database';
import type { NodePgJsonValue } from '@typings/node_pg_json';

const DEFAULT_COMMAND_FUNCTION = () => {
    // We guarantee that the last argument is the command object based on usage
    throw new Error(`No function defined for ${inspect(this)}`);
};

interface BaseCommandOptions {
    long_description: string;
    admin?: boolean; // Defaults to false
}

interface MessageCommandOptions<CacheType extends NodePgJsonValue = never> extends BaseCommandOptions {
    name: string;
    execute?: (this: MessageCommandOptions<CacheType>, msg: Message, args: string[]) => Promise<void>;
}

interface SlashCommandOptions<CacheType extends NodePgJsonValue = never> extends BaseCommandOptions {
    data: SharedNameAndDescription;
    execute?: (this: SlashCommand<CacheType>, i: ChatInputCommandInteraction) => Promise<void>;
    buttonReact?: (this: SlashCommand<CacheType>, i: ButtonInteraction) => Promise<void>;
    menuReact?: (this: SlashCommand<CacheType>, i: AnySelectMenuInteraction) => Promise<void>;
    textInput?: (this: SlashCommand<CacheType>, i: ModalSubmitInteraction) => Promise<void>;
}

interface SlashCommandNoSubcommandOptions<CacheType extends NodePgJsonValue = never>
    extends SlashCommandOptions<CacheType> {
    data: SlashCommandOptionsOnlyBuilder;
}

interface SlashCommandWithSubcommandOptions<CacheType extends NodePgJsonValue = never>
    extends SlashCommandOptions<CacheType> {
    data: SlashCommandSubcommandsOnlyBuilder;
    // Method of handling subcommands is created inside the class, overriding can be done via register
    execute?: never;
    buttonReact?: never;
    menuReact?: never;
    textInput?: never;
    // These are required if you want to use the buttonReact, menuReact, textInput functions
    buttonReactGetter?: (this: SlashCommandWithSubcommand<CacheType>, i: ButtonInteraction) => Awaitable<string>;
    menuReactGetter?: (this: SlashCommandWithSubcommand<CacheType>, i: AnySelectMenuInteraction) => Awaitable<string>;
    textInputGetter?: (this: SlashCommandWithSubcommand<CacheType>, i: ModalSubmitInteraction) => Awaitable<string>;
    // Register the same way as addSubcommand or addSubcommandGroup
    subcommands?: (SlashSubcommandGroup | SlashSubcommand)[];
}

interface SlashSubcommandGroupOptions<CacheType extends NodePgJsonValue = never>
    extends SlashCommandOptions<CacheType> {
    data: SlashCommandSubcommandGroupBuilder;
    // Method of handling subcommands is created inside the class, overriding can be done via register
    execute?: never;
    buttonReact?: never;
    menuReact?: never;
    textInput?: never;
    // These are required if you want to use the buttonReact, menuReact, textInput functions
    buttonReactGetter?: (this: SlashSubcommandGroup<CacheType>, i: ButtonInteraction) => Awaitable<string>;
    menuReactGetter?: (this: SlashSubcommandGroup<CacheType>, i: AnySelectMenuInteraction) => Awaitable<string>;
    textInputGetter?: (this: SlashSubcommandGroup<CacheType>, i: ModalSubmitInteraction) => Awaitable<string>;
    // Register the same way as addSubcommand
    subcommands?: SlashSubcommand[];
}

interface SlashSubcommandOptions<CacheType extends NodePgJsonValue = never> extends SlashCommandOptions<CacheType> {
    data: SlashCommandSubcommandBuilder;
}

interface ContextCommandOptions<CacheType extends NodePgJsonValue = never> extends BaseCommandOptions {
    data: ContextMenuCommandBuilder;
    execute?: (this: ContextCommand<CacheType>, i: ContextMenuCommandInteraction) => Promise<void>;
}

// Type helper to extract all keys and values from a class that are functions matching our signature
type RegisterFunctions<T> = {
    [K in keyof T as T[K] extends (this: T, ...args: never) => Promise<void> ? K : never]?: T[K];
};

enum CommandType {
    NONE,
    MESSAGE_COMMAND,
    SLASH_COMMAND_NO_SUBCOMMAND,
    SLASH_COMMAND_WITH_SUBCOMMAND,
    SLASH_SUBCOMMAND_GROUP,
    SLASH_SUBCOMMAND,
    CONTEXT_COMMAND,
}

/**
 * Base class for all commands.
 */
class BaseCommand {
    long_description: string;
    admin: boolean;
    type: CommandType;

    protected constructor(options: BaseCommandOptions) {
        this.long_description = options.long_description;
        this.admin = options.admin ?? false;
        this.type = CommandType.NONE;
    }

    isMessageCommand<CacheType extends NodePgJsonValue = never>():
        this is MessageCommand<CacheType> {
        return this.type === CommandType.MESSAGE_COMMAND;
    }

    isSlashCommandNoSubcommand<CacheType extends NodePgJsonValue = never>():
        this is SlashCommandNoSubcommand<CacheType> {
        return this.type === CommandType.SLASH_COMMAND_NO_SUBCOMMAND;
    }

    isSlashCommandWithSubcommand<CacheType extends NodePgJsonValue = never>():
        this is SlashCommandWithSubcommand<CacheType> {
        return this.type === CommandType.SLASH_COMMAND_WITH_SUBCOMMAND;
    }

    isSlashSubcommandGroup<CacheType extends NodePgJsonValue = never>():
        this is SlashSubcommandGroup<CacheType> {
        return this.type === CommandType.SLASH_SUBCOMMAND_GROUP;
    }

    isSlashSubcommand<CacheType extends NodePgJsonValue = never>():
        this is SlashSubcommand<CacheType> {
        return this.type === CommandType.SLASH_SUBCOMMAND;
    }

    isContextCommand<CacheType extends NodePgJsonValue = never>():
        this is ContextCommand<CacheType> {
        return this.type === CommandType.CONTEXT_COMMAND;
    }

    isSlashCommand<CacheType extends NodePgJsonValue = never>():
        this is SlashCommand<CacheType> {
        return this.isSlashCommandNoSubcommand() || this.isSlashCommandWithSubcommand() ||
            this.isSlashSubcommandGroup() || this.isSlashSubcommand();
    }

    isInteractionCommand<CacheType extends NodePgJsonValue = never>():
        this is SlashCommand<CacheType> | ContextCommand<CacheType> {
        return this.isSlashCommand() || this.isContextCommand();
    }
}

/**
 * Class for message commands.
 * Objects of this class can be exported by command files.
 */
export class MessageCommand<CacheType extends NodePgJsonValue = never> extends BaseCommand {
    name: string;
    cache: Cache<CacheType>;
    execute: (msg: Message, args: string[]) => Promise<void>;

    constructor(options: MessageCommandOptions<CacheType>) {
        super(options);
        this.name = options.name;
        this.cache = new Cache<CacheType>(this.name);
        this.execute = (options.execute ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.type = CommandType.MESSAGE_COMMAND;
    }

    register(fns: RegisterFunctions<MessageCommand>) {
        if (fns.execute) this.execute = fns.execute.bind(this);
        return this;
    }
}

/**
 * Base Class for any slash commands.
 * Do not export anything of this type.
 */
class SlashCommand<CacheType extends NodePgJsonValue = never> extends BaseCommand {
    data: SharedNameAndDescription;
    cache: Cache<CacheType>;
    execute: (i: ChatInputCommandInteraction) => Promise<void>;
    buttonReact: (i: ButtonInteraction) => Promise<void>;
    menuReact: (i: AnySelectMenuInteraction) => Promise<void>;
    textInput: (i: ModalSubmitInteraction) => Promise<void>;

    protected constructor(options: SlashCommandOptions<CacheType>) {
        super(options);
        this.data = options.data;
        this.cache = new Cache<CacheType>(this.data.name);
        this.execute = (options.execute ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.buttonReact = (options.buttonReact ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.menuReact = (options.menuReact ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.textInput = (options.textInput ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.type = CommandType.NONE;
    }

    // Very powerful command to allow the registering to overwrite any default set functions.
    // For example, perhaps the buttonReact on subcommands need extra functionality that the default
    // cannot provide. This allows for overriding the default after setting it to whatever you want.
    register(fns: RegisterFunctions<SlashCommand>) {
        if (fns.execute) this.execute = fns.execute.bind(this);
        if (fns.buttonReact) this.buttonReact = fns.buttonReact.bind(this);
        if (fns.menuReact) this.menuReact = fns.menuReact.bind(this);
        if (fns.textInput) this.textInput = fns.textInput.bind(this);
        return this;
    }
}

// This can't and shouldn't be instantiated.
export type { SlashCommand };

/**
 * Class for slash commands with no subcommands.
 * Objects of this class can be exported by command files.
 */
export class SlashCommandNoSubcommand<CacheType extends NodePgJsonValue = never> extends SlashCommand<CacheType> {
    data!: SlashCommandOptionsOnlyBuilder;

    constructor(options: SlashCommandNoSubcommandOptions<CacheType>) {
        super(options);
        this.type = CommandType.SLASH_COMMAND_NO_SUBCOMMAND;
    }
}

/**
 * Class for slash commands with subcommands.
 * Objects of this class can be exported by command files.
 */
export class SlashCommandWithSubcommand<CacheType extends NodePgJsonValue = never> extends SlashCommand<CacheType> {
    data!: SlashCommandSubcommandsOnlyBuilder;
    subcommands: Map<string, SlashSubcommandGroup | SlashSubcommand>;

    constructor(options: SlashCommandWithSubcommandOptions<CacheType>) {
        super(options);
        this.subcommands = new Map();
        this.type = CommandType.SLASH_COMMAND_WITH_SUBCOMMAND;
        // Different from SlashCommand without subcommands in the sense that we handle the execute
        // and all other functions automatically so only one definition is required in the lowest subcommand level.
        this.execute = async function (i) {
            if (this.subcommands.size === 0) throw new Error(`execute: NO SUBCOMMANDS FOR ${this.data.name}`);
            const subcommand = this.subcommands.get(
                i.options.getSubcommandGroup(false) ??
                i.options.getSubcommand()!,
            );
            if (!subcommand) throw new Error(`execute: SUBCOMMAND FOR ${this.data.name} NOT FOUND`);
            return subcommand.execute.bind(this)(i);
        };
        this.buttonReact = async function (i) {
            if (this.subcommands.size === 0) throw new Error(`buttonReact: NO SUBCOMMANDS FOR ${this.data.name}`);
            const subcommandName = await options.buttonReactGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand) throw new Error(`buttonReact: SUBCOMMAND FOR ${this.data.name} NOT FOUND`);
            return subcommand.buttonReact(i);
        };
        this.menuReact = async function (i) {
            if (this.subcommands.size === 0) throw new Error(`menuReact: NO SUBCOMMANDS FOR ${this.data.name}`);
            const subcommandName = await options.menuReactGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand) throw new Error(`menuReact: SUBCOMMAND FOR ${this.data.name} NOT FOUND`);
            return subcommand.menuReact.bind(this)(i);
        };
        this.textInput = async function (i) {
            if (this.subcommands.size === 0) throw new Error(`textInput: NO SUBCOMMANDS FOR ${this.data.name}`);
            const subcommandName = await options.textInputGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand) throw new Error(`textInput: SUBCOMMAND FOR ${this.data.name} NOT FOUND`);
            return subcommand.textInput.bind(this)(i);
        };
        for (const subcommand of options.subcommands ?? []) {
            if (subcommand.isSlashSubcommand()) this.addSubcommand(subcommand);
            else this.addSubcommandGroup(subcommand);
        }
    }

    addSubcommand(subcommand: SlashSubcommand) {
        this.data.addSubcommand(subcommand.data);
        this.subcommands.set(subcommand.data.name, subcommand);
        return this;
    }

    addSubcommandGroup(subcommandGroup: SlashSubcommandGroup) {
        this.data.addSubcommandGroup(subcommandGroup.data);
        this.subcommands.set(subcommandGroup.data.name, subcommandGroup);
        return this;
    }
}

/**
 * Class for subcommand groups. This can have subcommands added to it.
 * Objects of this class should not be exported by command files.
 */
export class SlashSubcommandGroup<CacheType extends NodePgJsonValue = never> extends SlashCommand<CacheType> {
    data!: SlashCommandSubcommandGroupBuilder;
    subcommands: Map<string, SlashSubcommand>;

    constructor(options: SlashSubcommandGroupOptions<CacheType>) {
        super(options);
        this.subcommands = new Map();
        this.type = CommandType.SLASH_SUBCOMMAND_GROUP;
        // Different from SlashCommand without subcommands in the sense that we handle the execute
        // and all other functions automatically so only one definition is required in the lowest subcommand level.
        this.execute = async function (i) {
            if (this.subcommands.size === 0) throw new Error(`execute: NO SUBCOMMANDS IN GROUP ${this.data.name}`);
            const subcommand = this.subcommands.get(i.options.getSubcommand()!);
            if (!subcommand) throw new Error(`execute: SUBCOMMAND IN GROUP ${this.data.name} NOT FOUND`);
            return subcommand.execute.bind(this)(i);
        };
        this.buttonReact = async function (i) {
            if (this.subcommands.size === 0) throw new Error(`buttonReact: NO SUBCOMMANDS IN GROUP ${this.data.name}`);
            const subcommandName = await options.buttonReactGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand) throw new Error(`buttonReact: SUBCOMMAND IN GROUP ${this.data.name} NOT FOUND`);
            return subcommand.buttonReact.bind(this)(i);
        };
        this.menuReact = async function (i) {
            if (this.subcommands.size === 0) throw new Error(`menuReact: NO SUBCOMMANDS IN GROUP ${this.data.name}`);
            const subcommandName = await options.menuReactGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand) throw new Error(`menuReact: SUBCOMMAND IN GROUP ${this.data.name} NOT FOUND`);
            return subcommand.menuReact.bind(this)(i);
        };
        this.textInput = async function (i) {
            if (this.subcommands.size === 0) throw new Error(`textInput: NO SUBCOMMANDS IN GROUP ${this.data.name}`);
            const subcommandName = await options.textInputGetter?.bind(this)(i);
            const subcommand = this.subcommands.get(subcommandName ?? '');
            if (!subcommand) throw new Error(`textInput: SUBCOMMAND IN GROUP ${this.data.name} NOT FOUND`);
            return subcommand.textInput.bind(this)(i);
        };
        for (const subcommand of options.subcommands ?? []) {
            this.addSubcommand(subcommand);
        }
    }

    addSubcommand(subcommand: SlashSubcommand) {
        this.data.addSubcommand(subcommand.data);
        this.subcommands.set(subcommand.data.name, subcommand);
        return this;
    }
}

/**
 * Class for subcommands. This is the lowest level; no more subcommands can be added.
 * Objects of this class should not be exported by command files.
 */
export class SlashSubcommand<CacheType extends NodePgJsonValue = never> extends SlashCommand<CacheType> {
    data!: SlashCommandSubcommandBuilder;

    constructor(options: SlashSubcommandOptions<CacheType>) {
        super(options);
        this.type = CommandType.SLASH_SUBCOMMAND;
    }
}

/**
 * Class for context menu commands.
 * Objects of this class can be exported by command files.
 */
export class ContextCommand<CacheType extends NodePgJsonValue = never> extends BaseCommand {
    data: ContextMenuCommandBuilder;
    cache: Cache<CacheType>;
    execute: (i: ContextMenuCommandInteraction) => Promise<void>;

    constructor(options: ContextCommandOptions<CacheType>) {
        super(options);
        this.data = options.data;
        this.cache = new Cache<CacheType>(this.data.name);
        this.execute = (options.execute ?? DEFAULT_COMMAND_FUNCTION).bind(this);
        this.type = CommandType.CONTEXT_COMMAND;
    }

    register(fns: RegisterFunctions<ContextCommand>) {
        if (fns.execute) this.execute = fns.execute.bind(this);
        return this;
    }
}

/**
 * A collection of commands.
 */
export interface Cog {
    // Name of this cog
    name: string;
    // Short description of this cog
    desc: string;
    // All commands to be displayed in this cog, this means it only includes MessageCommand and SlashCommand
    displayed_commands: (SlashCommand | MessageCommand)[];
    // The real amount of commands available in this file, drilling down to subcommand groups and subcommands.
    real_command_count: number;
}

/**
 * Essentially a cog; but the actual collection of commands that a file must export
 */
export type CommandFile = {
    // Name of this cog
    name: string;
    // Short description of this cog
    desc: string;
} & {
    [key: string]: BaseCommand;
};
