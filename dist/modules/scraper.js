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
async function scrape(source) {
    const images = [];
    // This part is parsing pixiv images.
    console.log(`${source}: Trying pixiv...`);
    if (source.startsWith('https://www.pixiv.net/')) {
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
        let imageNumber = parseInt(source.match(/\/artworks\/\d{7,}\/(?<id>-?[0-9]+)$/)?.groups.id);
        if (imageNumber > 0)
            --imageNumber; // Positive indexes start at 0
        const res = await pixiv.illust.get(source).catch(() => {
            // We try to refresh token to hopefully fix the error.
            return pixiv.refreshToken().then(() => {
                return pixiv.illust.get(source);
            }, () => {
                console.error('\x1b[31m%s\x1b[0m', 'Warning! Pixiv refresh token expired!');
            });
        });
        if (res) {
            source = res.url;
            // Try to find given imageNumber, choose first if not found.
            const new_url = res.meta_pages.at(imageNumber)?.image_urls.original ??
                res.meta_pages.at(0)?.image_urls.original ??
                res.meta_single_page.original_image_url ?? res.image_urls.large ??
                res.image_urls.medium;
            // There are multiple images, and did not specify an image, return all available.
            if (res.meta_pages.length && isNaN(imageNumber)) {
                images.push(...res.meta_pages.map(p => p.image_urls.original));
            }
            else {
                images.push(new_url);
            }
        }
    }
    console.log(`${source}: Have ${images} after pixiv.`);
    // This part is parsing danbooru images.
    console.log(`${source}: Trying danbooru...`);
    if (source.startsWith('https://danbooru.donmai.us/')) {
        const $ = await fetch(source).then(res => res.text()).then(cheerio_1.load);
        const sectionTag = $('section').find('.image-container');
        // Backup in case there is no section/image source
        const imgTag = $('img#image');
        const raw_image = sectionTag.attr('data-file-url') ?? sectionTag.attr('data-source') ??
            imgTag.attr('src')?.replace('/sample/', '/original/').replace('sample-', '');
        if (raw_image) {
            images.push(raw_image);
        }
    }
    console.log(`${source}: Have ${images} after danbooru.`);
    if (!images.length) {
        console.log(`${source}: Trying twitter...`);
        // Let a separate server handle the parsing of twitter images with playwright.
        const { imgs } = await fetch(`${_config_1.default.scraper}?url=${source}`)
            .then(res => res.json(), () => ({ imgs: [] }));
        images.push(...imgs);
        console.log(`${source}: Got ${images} from twitter.`);
    }
    // No images could be found, tell caller to try uploading source
    if (!images.length)
        images.push(source);
    return { images, source };
}
exports.default = scrape;
//# sourceMappingURL=scraper.js.map