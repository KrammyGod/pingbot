import type { Cog, ContextCommand, MessageCommand, SlashCommand } from '@classes/commands';

// Some custom properties for the client, initialized in bot.ts
declare module 'discord.js' {
    interface Client {
        is_ready: boolean;                                                  // Is fully loaded
        is_listening: boolean;                                              // Is currently listening for interactions
        is_user_cache_ready: boolean;                                       // Is current shard's user cache is ready
        is_using_lambda: boolean;                                           // Is using AWS lambda for scraping
        prefix: string;                                                     // Message prefix
        admin: User;                                                        // Admin user object
        log_channel: GuildTextBasedChannel;                                 // Error logs should go here
        bot_emojis: Record<string, string>;                                 // All available emojis in the private guild
        lines: string[][];                                                  // All message reply lines from lines.txt
        cogs: Cog[];                                                        // All cogs (groups of commands)
        interaction_commands: Map<string, SlashCommand | ContextCommand>;   // All interaction commands
        message_commands: Map<string, MessageCommand>;                      // All message commands
    }
}
