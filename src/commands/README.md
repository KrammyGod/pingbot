# Commands Folder

This folder contains all slash and message commands that will be deployed via [deployment/](../deployment). This may not
be an updated list of files, however effort will be made to keep it updated.

## Files

- [admin_commands.ts](admin_commands.ts): Admin only commands that modify state of the bot. Only available to myself.
- [anime_commands.ts](anime_commands.ts): The largest file, containing all commands for the anime character generation
  system. This file contains all the commands listed under "Animes/Gacha" in the help command.
- [fun_commands.ts](fun_commands.ts): A collection of slash commands that are either useful, or purely for
  entertainment. This file contains all the commands listed under "Fun" in the help command.
- [help_command.ts](help_command.ts): A complex custom help slash command that displays all commands in an interactive
  and easy to read format.
- [minigame_commands.ts](minigame_commands.ts): A compilation of mini-games in the form of slash commands that uses the
  currency of the anime character system to play. This file contains all the commands listed under "Minigames" in the
  help command.
- [mod_commands.ts](mod_commands.ts): A collection of slash commands that are only available to moderators of a server.
  It contains helpful commands like purging messages, and changing guild join settings. This file contains all the
  commands listed under "Moderation" in the help command.
- [music_commands.ts](music_commands.ts): A collection of slash commands used to make the bot play music in a voice
  channel. This file contains all the commands listed under "Music" in the help command.
