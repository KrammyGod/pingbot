"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.default = {
    ////// Must haves, for bot to work
    /**
     * The bot's owner ID. Used for owner-only commands and pings.
     */
    admin: process.env.ADMIN,
    /**
     * The bot's token. Used to log in to Discord.
     */
    token: process.env.TOKEN,
    /**
     * The bot's client ID. Used for invite link and deploying commands.
     */
    client: process.env.CLIENT_ID,
    ////// Semi-optional - bot still works, but not fully functional
    /**
     * The bot's prefix. Used for message commands.
     */
    prefix: process.env.PREFIX || '',
    /**
     * The base url of the CDN that hosts images.
     */
    cdn: 'https://d1irvsiobt1r8d.cloudfront.net',
    /**
     * The url for uploading images to AWS CDN.
     */
    origin: process.env.ORIGIN_URL,
    /**
     * The secret for uploading images to AWS CDN.
     */
    secret: process.env.SECRET,
    /**
     * The support server's ID.
     */
    guild: process.env.GUILD,
    /**
     * Secret server that stores all the emojis.
     * Can be same as support server.
     */
    emojis: process.env.EMOJIGUILD,
    /**
     * Pixiv refresh token to use when scraping pixiv links.
     */
    pixiv: process.env.PIXIV_REFRESH_TOKEN || '',
    /**
     * The host of the twitter scraper server.
     */
    scraper: process.env.SCRAPER_HOST,
    /**
     * The channel ID of where logs should go
     */
    log: process.env.LOGID,
    /**
     * The channel ID of where to verify submission requests
     * Can be same as log ID.
     */
    submit: process.env.SUBMIT_ID,
    /**
     * The channel ID of where to send approved submission requests
     */
    chars: process.env.NEW_CHAR_ID,
    ////// Flags
    /**
     * Flag used to indicate in testing mode. Logs won't be sent to log channel.
     */
    testing: process.env.TESTING,
    /**
     * Special flag for special events. :)
     */
    events: process.env.EVENTS,
    ////// Completely optional - they have defaults
    /**
     * Port to receive messages from collector and possibly other services.
     */
    port: process.env.PORT || 5000,
    /**
     * The environment the bot is running in. Only used to determine whether to send a welcome message or not.
     */
    env: process.env.BOT_ENV,
};
//# sourceMappingURL=config.js.map