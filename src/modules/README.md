# Modules Folder

This folder contains a load of useful helper scripts that are used in multiple command files. This may not be an updated
list of files, however effort will be made to keep it updated.

## Files

- [cdn.ts](cdn.ts): A collection of helper functions to upload, retrieve, delete, and modify files on the CDN.
- [database.ts](database.ts): A collection of helpers that interact directly with the database, using raw SQL.
- [hoyolab.ts](hoyolab.ts): A simple helper file that contains commands to retrieve HoyoLab data to allow users to add
  their HoyoLab account, and retrieve information.
- [load_commands.ts](load_commands.ts): A script that loads all the commands in the [commands/](../commands) folder into
  the bot to allow the bot to call the specific command in the command handler.
- [purge_utils.ts](purge_utils.ts): A collection of helper functions that allow the bot to purge messages in a channel.
  Separated as a module to be used in both the purge message command and slash command.
- [reset_db.ts](reset_db.ts): A simple script that resets dailies for the anime character system and grabs as many
  common characters from a specified public database as possible.
- [scraper.ts](scraper.ts): A script that supports scraping the raw image link from a variety of websites, including
  Twitter, Pixiv, and Danbooru.
- [utils.ts](utils.ts): A collection of very useful helper functions, like converting a name to a Discord object, and
  creating a unique dialog to allow users to select a specific option.
