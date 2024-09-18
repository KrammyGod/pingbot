import type { CommandFile } from '@classes/commands';
export const admin = import('./admin_commands') as unknown as CommandFile;
export const anime = import('./anime_commands') as unknown as CommandFile;
export const fun = import('./fun_commands') as unknown as CommandFile;
export const help = import('./help_command') as unknown as CommandFile;
export const minigame = import('./minigame_commands') as unknown as CommandFile;
export const mod = import('./mod_commands') as unknown as CommandFile;
// Disabling all music commands atm, there is currently an issue with the player interacting with youtube's API
// export const music = import('./music_commands') as unknown as CommandFile;
