# Classes Folder

This folder contains all custom typings (interfaces/classes) that are used by the bot to make TypeScript happy. This may
not be an updated list of files, however effort will be made to keep it updated.

## Files

- [config.ts](config.ts): Constant exported object that contains all the required environment variables for the bot to
  run properly in production. It is easier to view and maintain the configuration rather than editing .env.template
- [exceptions.ts](exceptions.ts): Very simple type definitions of a couple of custom exception types we use to
  differentiate between actual errors and expected errors.
- [GuildVoice.ts](GuildVoice.ts): Type to support music commands. It contains multiple helpers to load songs, and play
  them. Also contains a global definition of all guilds that are currently playing music.
