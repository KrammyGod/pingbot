import type { CommandFile, InteractionCommand, MessageCommand } from '@typings/commands';

declare module 'discord.js' {
    interface Client {
        // Predefine custom properties
        is_ready: boolean;                              // Is fully loaded
        is_listening: boolean;                          // Is currently listening for interactions
        prefix: string;                                 // Message prefix
        admin: User;                                    // Admin user
        log_channel: TextBasedChannel;                  // Error logs
        bot_emojis: Record<string, string>;             // All available emojis
        lines: string[][];                              // All message reply lines
        cogs: CommandFile[];                            // All cogs (groups of commands)
        commands: Map<string, InteractionCommand>;      // All non-admin commands
        admin_commands: Map<string, MessageCommand>;    // All admin commands
        message_commands: Map<string, MessageCommand>;  // All message commands
        user_cache_ready: boolean;                      // Whether user cache is ready for current shard
    }
}
