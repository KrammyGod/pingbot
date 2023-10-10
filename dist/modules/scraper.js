"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _config_1 = __importDefault(require("../classes/config.js"));
const pixiv_ts_1 = __importDefault(require("pixiv.ts"));
const cheerio_1 = require("cheerio");
// Pixiv object for scraping pixiv images.
let pixiv;
/**
 * Returns all images scraped from the given url.
 */
async function scrape(url) {
    const retval = [];
    // Let a separate server handle the parsing of twitter images with playwright.
    const { imgs } = await fetch(`${_config_1.default.scraper}?url=${url}`).then(res => res.json()).catch(() => ({ imgs: [url] }));
    // Server returns original image if it couldn't find twitter images.
    if (imgs[0] !== url) {
        retval.push(...imgs);
    }
    // This part is parsing pixiv images.
    if (url.startsWith('https://www.pixiv.net/en/artworks/')) {
        if (pixiv === undefined) {
            // Login to pixiv only when needed.
            pixiv = await pixiv_ts_1.default.refreshLogin(_config_1.default.pixiv).catch(() => {
                console.error('\x1b[31m%s\x1b[0m', 'Warning! Pixiv login failed!');
                // Intentionally keep pixiv as undefined to throw error later.
                return pixiv;
            });
        }
        // We attempt to extract the image # from the url
        // Image number is always after /artworks/id, and at the end
        // @ts-expect-error parseInt can handle undefined
        let imageNumber = parseInt(url.match(/\/artworks\/\d{8,}\/(?<id>-?[0-9]+)$/)?.groups.id);
        if (imageNumber > 0)
            --imageNumber; // Positive indexes start at 0
        const res = await pixiv.illust.get(url).catch(() => {
            // We try to refresh token to hopefully fix the error.
            return pixiv.refreshToken().then(() => {
                return pixiv.illust.get(url);
            }).catch(() => {
                console.error('\x1b[31m%s\x1b[0m', 'Warning! Pixiv refresh token expired!');
            });
        });
        if (res) {
            // Try to find given imageNumber, choose first if not found.
            const new_url = res.meta_pages.at(imageNumber)?.image_urls.original ??
                res.meta_pages.at(0)?.image_urls.original ??
                res.meta_single_page.original_image_url ?? res.image_urls.large ??
                res.image_urls.medium;
            // There are multiple images, and did not specify an image, return all available.
            if (res.meta_pages.length && isNaN(imageNumber)) {
                retval.push(...res.meta_pages.map(p => p.image_urls.original));
            }
            else {
                retval.push(new_url);
            }
        }
    }
    // This part is parsing danbooru images.
    if (url.startsWith('https://danbooru.donmai.us/')) {
        const $ = await fetch(url).then(res => res.text()).then(cheerio_1.load);
        const sectionTag = $('section').find('.image-container');
        // Backup in case there is no section/image source
        const imgTag = $('img#image');
        const source = sectionTag.attr('data-file-url') ?? sectionTag.attr('data-source') ??
            imgTag.attr('src')?.replace('/sample/', '/original/').replace('sample-', '');
        if (source) {
            retval.push(source);
        }
    }
    return retval;
}
exports.default = scrape;
//# sourceMappingURL=scraper.js.map