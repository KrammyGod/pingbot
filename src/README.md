# Source Folder

This folder contains all the source code that is run for the project. This may not be an updated list of files, however
effort will be made to keep it updated.

## Subfolders

- [classes/](classes): Contains custom type definitions and helpers used for the project.
- [collector/](collector): Contains a helper script that automatically collects hoyolab dailies from 3 games, and the
  crontab file that runs it.
- [commands/](commands): Contains all the commands available for the bot. Each file contains a group of slash commands,
  or message commands.
- [deployment/](deployment): Contains a helper script that deploys slash commands to Discord.
- [modules/](modules): Contains a collection of all helpers that are used in multiple command files or commands.
- [typings/](typings): Contains all custom typings that are needed for TypeScript to compile correctly.

## Files

- [bot.ts](bot.ts): The main bot script that started the bot, and attaches appropriate listeners. This is the where the
  bot logins, and the entrypoint for slash and message commands.
- [index.ts](index.ts): This is the main script that is run to start the bot. It spawns multiple instances of bot.ts to
  support sharding. There is also a server that listens for internal messages.
