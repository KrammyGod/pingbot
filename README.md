# pingbot - A multi-purpose Discord Bot

<div align="center">

[![Support Server](https://img.shields.io/discord/850899856452878377?color=7289da&label=Discord&logo=discord&logoColor=white)](https://discord.gg/BKAWvgVZtN)

</div>

A multi-purpose Discord Bot. Made with Discord.JS, TypeScript, and PostgreSQL. There are also other services for some of the bot's features, such as [Twitter Scraper](https://github.com/KrammyGod/twitter-scraper) or [AWS CDN Origin Server](https://github.com/KrammyGod/image-server) which are also hosted personally and used internally.

[Invite me!](https://discord.com/api/oauth2/authorize?client_id=632641386772168714&permissions=1512670883152&scope=bot%20applications.commands)

## Features
- Anime Commands
  - Currency system that allows you to collect anime characters
  - Collect currency by using `/daily`, generate characters using `/multi`.
  - Submit new characters using `/submit`
    - Includes an under-the-hood implementation of a scraper that is capable of scraping images from X (formerly Twitter), Pixiv, and Danbooru.
- Music commands
  - Play music from YouTube, Spotify, SoundCloud, and more to come!
  - Advanced queue system with support for skipping and removing songs, and playing on repeats.
- Miscellaneous commands
  - Hoyolab autocollector
  - Poll command
- Fully featured help command
- Moderation (in progress)
- ...and more!

## Technical Details:
Prior to formal education on databases, the schema for the Postgres instance was extremely messy (can be viewed [here](sqls/old_schema.sql)). As such, there is a [migration script](sqls/migrate.sql) to move to the new and [improved schema](sqls/schema.sql).

This specific bot is hosted on a personal [Orange Pi 5](http://www.orangepi.org/html/hardWare/computerAndMicrocontrollers/details/Orange-Pi-5.html), and to lessen the burden on its processor, there is a [workflow](.github/workflows/push.yml) that transpiles the TypeScript files into JavaScript files, and then uploads them to a different branch, `dist`. The same workflow uses pm2, and the [configuration file](ecosystem.config.js) to automatically deploy the latest version.

## package.json scripts

- `collect:game` - Runs the autocollector for the specified game
- `reset` - Runs the daily reset for daily rotating commands like `/daily`
- `cookie` - Tests the hoyolab cookie to see if it is still valid
- `download` - Downloads the waifus into files/waifus.txt
- `upload` - Uploads files/waifus.txt into database
- `dev` - Starts the bot in development mode, using nodemon
- `lint` - Lints the source code
- `lint:fix` - Runs eslint with fix option
- `build` - Transpiles the source code
- `deploy` - Transpiles the source code and registers slash commands
- `start` - Transpiles the source code and starts the bot

More details will be added as the project progresses when necessary.
