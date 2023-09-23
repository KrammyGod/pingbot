import config from '@config';
import {
    Client, ContextMenuCommandBuilder, Routes, SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder, SlashCommandBuilder
} from 'discord.js';
import type DTypes from 'discord.js';
import type GuildVoice from '@classes/GuildVoice';
import type { Cache } from '@modules/database';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSlashSubcommand(obj: any): obj is SlashSubcommand {
    return obj && obj.data instanceof SlashCommandSubcommandBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.execute.length === 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSlashSubcommandGroup(obj: any): obj is SlashSubcommandGroup {
    return obj && obj.data instanceof SlashCommandSubcommandGroupBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.subcommands && obj.execute.length === 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isSlashCommand(obj: any): obj is SlashCommand {
    return obj && obj.data instanceof SlashCommandBuilder &&
        typeof obj.desc === 'string' && typeof obj.execute === 'function' &&
        obj.execute.length === 1;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isContextCommand(obj: any): obj is ContextCommand {
    return obj && obj.data instanceof ContextMenuCommandBuilder &&
        typeof obj.execute === 'function' && obj.execute.length === 1;
}

export function isInteractionCommand(obj: unknown): obj is InteractionCommand {
    return isSlashCommand(obj) || isContextCommand(obj);
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function isMessageCommand(obj: any): obj is MessageCommand {
    return obj && typeof obj.name === 'string' &&
        typeof obj.execute === 'function' && obj.execute.length <= 2;
}

export type CommandFile = {
    name: string;
    desc: string;
    // This is not exported by each file; it is loaded by load_commands.ts
    commands: (MessageCommand | SlashCommand)[];
    [key: string]: MessageCommand | InteractionCommand | unknown;
};

// Basics that every message command must have
export interface MessageCommand {
    name: string;
    admin: boolean;
    desc: string;
    execute: (msg: DTypes.Message & { readonly client: CustomClient }, args: string[]) => Promise<unknown>;
}

export interface SlashSubcommand {
    data: DTypes.SlashCommandSubcommandBuilder;
    desc: string; // Long description for help command
    execute: (i: DTypes.ChatInputCommandInteraction & { client: CustomClient; }) => Promise<unknown>;
    buttonReact?: (i: DTypes.ButtonInteraction & { readonly client: CustomClient }) => Promise<unknown>;
    menuReact?: (i: DTypes.AnySelectMenuInteraction & { readonly client: CustomClient }) => Promise<unknown>;
    textInput?: (i: DTypes.ModalSubmitInteraction & { readonly client: CustomClient }) => Promise<unknown>;
}

export interface SlashSubcommandGroup {
    data: DTypes.SlashCommandSubcommandGroupBuilder;
    desc: string;
    subcommands: Map<string, SlashSubcommand>;
    execute: (i: DTypes.ChatInputCommandInteraction & { readonly client: CustomClient; }) => Promise<unknown>;
    buttonReact?: (i: DTypes.ButtonInteraction & { readonly client: CustomClient }) => Promise<unknown>;
    menuReact?: (i: DTypes.AnySelectMenuInteraction & { readonly client: CustomClient }) => Promise<unknown>;
    textInput?: (i: DTypes.ModalSubmitInteraction & { readonly client: CustomClient }) => Promise<unknown>;
}

// Basics that every slash command must have
export interface SlashCommand {
    data: DTypes.SlashCommandBuilder;
    desc: string; // Long description for help command
    subcommands?: Map<string, SlashSubcommandGroup | SlashSubcommand>;
    execute: (i: DTypes.ChatInputCommandInteraction & { readonly client: CustomClient; }) => Promise<unknown>;
    buttonReact?: (i: DTypes.ButtonInteraction & { readonly client: CustomClient }) => Promise<unknown>;
    menuReact?: (i: DTypes.AnySelectMenuInteraction & { readonly client: CustomClient }) => Promise<unknown>;
    textInput?: (i: DTypes.ModalSubmitInteraction & { readonly client: CustomClient }) => Promise<unknown>;
}

export interface CachedSlashCommand<T extends object> extends SlashCommand {
    cache: Cache<T>;
}

export interface CachedSlashSubcommand<T extends object> extends SlashSubcommand {
    cache: Cache<T>;
}

export interface CachedSlashSubcommandGroup<T extends object> extends SlashSubcommandGroup {
    cache: Cache<T>;
}

// Basics that every context command must have
export interface ContextCommand {
    data: DTypes.ContextMenuCommandBuilder;
    execute: (i: DTypes.ContextMenuCommandInteraction & { client: CustomClient; }) => Promise<unknown>;
}

export type InteractionCommand = SlashCommand | ContextCommand;

export const GuildVoices = new Map<string, GuildVoice>();

export class CustomClient extends Client {
    // Predefine custom properties
    is_ready!: boolean;                              // Is fully loaded
    is_listening!: boolean;                          // Is currently listening for interactions
    prefix!: string;                                 // Message prefix
    admin!: DTypes.User;                             // Admin user
    log_channel!: DTypes.TextBasedChannel;           // Error logs
    bot_emojis!: Record<string, string>;             // All available emojis
    lines!: string[][];                              // All message reply lines
    cogs!: CommandFile[];                            // All cogs (groups of commands)
    commands!: Map<string, InteractionCommand>;      // All non-admin commands
    admin_commands!: Map<string, MessageCommand>;    // All admin commands
    message_commands!: Map<string, MessageCommand>;  // All message commands
    user_cache_ready!: boolean;                      // Whether user cache is ready for current shard
    deleteFollowUp!: (i: DTypes.RepliableInteraction, msg: DTypes.Message) => Promise<unknown>;

    private static _instance: CustomClient;

    constructor(options?: DTypes.ClientOptions) {
        if (CustomClient._instance) {
            return CustomClient._instance;
        }
        super(options!);
        this.is_ready = false;
        this.is_listening = true;
        this.prefix = config.prefix;
        this.bot_emojis = {};
        this.lines = [];
        this.commands = new Map();
        this.user_cache_ready = false;
        this.deleteFollowUp = async (i, msg) => {
            return this.rest.delete(Routes.webhookMessage(i.webhook.id, i.token, msg.id));
        };
        // Everything is ready, set instance here
        CustomClient._instance = this;
    }
}
