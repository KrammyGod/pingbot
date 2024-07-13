import {
    AnySelectMenuInteraction,
    ButtonInteraction,
    ChatInputCommandInteraction,
    ContextMenuCommandBuilder,
    ContextMenuCommandInteraction,
    Message,
    ModalSubmitInteraction,
    SharedNameAndDescription,
    SlashCommandBuilder,
    SlashCommandOptionsOnlyBuilder,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    SlashCommandSubcommandsOnlyBuilder,
} from 'discord.js';
import type { Cache } from '@modules/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSlashSubcommand(obj: any): obj is SlashSubcommand {
    return obj && obj.data instanceof SlashCommandSubcommandBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.execute.length <= 2;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSlashSubcommandGroup(obj: any): obj is SlashSubcommandGroup {
    return obj && obj.data instanceof SlashCommandSubcommandGroupBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.subcommands && obj.execute.length <= 2;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSlashCommand(obj: any): obj is SlashCommand {
    return obj && obj.data instanceof SlashCommandBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.execute.length <= 2;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isContextCommand(obj: any): obj is ContextCommand {
    return obj && obj.data instanceof ContextMenuCommandBuilder &&
        typeof obj.execute === 'function' && obj.execute.length <= 2;
}

export function isInteractionCommand(obj: unknown): obj is InteractionCommand {
    return isSlashCommand(obj) || isContextCommand(obj);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMessageCommand(obj: any): obj is MessageCommand {
    return obj && typeof obj.name === 'string' && typeof obj.admin === 'boolean' &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' && obj.execute.length <= 3;
}

export type CommandFile = {
    name: string;
    desc: string;
    // This is not exported by each file; it is loaded by load_commands.ts
    commands: (MessageCommand | SlashCommand)[];
    // The real amount of commands available in this file
    // This includes subcommands and subcommand groups and message commands
    // Loaded by load_commands.ts
    amt: number;
    [key: string]: MessageCommand | InteractionCommand | unknown;
};

// Basics that every message command must have
export interface MessageCommand {
    name: string;
    admin: boolean;
    desc: string;
    execute: (msg: Message, args: string[]) => Promise<void>;
}

// Basics that every slash command must have
interface Command {
    data: SharedNameAndDescription;
    desc: string; // Long description for help command
    execute: (i: ChatInputCommandInteraction) => Promise<void>;
    buttonReact?: (i: ButtonInteraction) => Promise<void>;
    menuReact?: (i: AnySelectMenuInteraction) => Promise<void>;
    textInput?: (i: ModalSubmitInteraction) => Promise<void>;
}

export interface SlashSubcommand extends Command {
    data: SlashCommandSubcommandBuilder;
}

export interface SlashSubcommandGroup extends Command {
    data: SlashCommandSubcommandGroupBuilder;
    subcommands: Map<string, SlashSubcommand>;
}

export interface SlashCommand extends Command {
    data: SlashCommandOptionsOnlyBuilder | SlashCommandSubcommandsOnlyBuilder;
    subcommands?: Map<string, SlashSubcommandGroup | SlashSubcommand>;
}

type CacheData<T extends object> = { cache: Cache<T> };
export type CachedSlashCommand<T extends object> = SlashCommand & CacheData<T>;
export type CachedSlashSubcommand<T extends object> = SlashCommand & CacheData<T>;
export type CachedSlashSubcommandGroup<T extends object> = SlashCommand & CacheData<T>;

// Basics that every context command must have
export interface ContextCommand {
    data: ContextMenuCommandBuilder;
    execute: (i: ContextMenuCommandInteraction) => Promise<void>;
}

export type InteractionCommand = SlashCommand | ContextCommand;
