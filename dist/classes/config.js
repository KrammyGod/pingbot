"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
exports.default = {
    // Must haves, for bot to work
    prefix: process.env.PREFIX ?? '',
    admin: process.env.ADMIN,
    token: process.env.TOKEN,
    client: process.env.CLIENT_ID,
    // Semi-optional - bot still works, but not fully functional
    imgur: process.env.IMGUR_CLIENT_ID,
    guild: process.env.GUILD,
    emojis: process.env.EMOJIGUILD,
    pixiv: process.env.PIXIV_REFRESH_TOKEN ?? '',
    scraper: process.env.SCRAPER_HOST,
    log: process.env.LOGID,
    submit: process.env.SUBMIT_ID,
    chars: process.env.NEW_CHAR_ID,
    // Flags
    maintenance: process.env.MAINTENANCE,
    events: process.env.EVENTS,
    // Completely optional - they have defaults
    port: process.env.PORT || 5000,
    ffmpeg: process.env.NEW_FFMPEG_PATH
};
//# sourceMappingURL=config.js.map