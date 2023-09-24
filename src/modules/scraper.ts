import Pixiv from 'pixiv.ts';
import config from '@config';
import { load } from 'cheerio';

// Pixiv object for scraping pixiv images.
let pixiv: Pixiv;

/**
 * Returns the source and sauce of an image.
 * Source is the raw image url, sauce is the
 * description for imgur uploads (if needed)
 */
export default async function scrape(url: string, all: string[] = []) {
    let sauce;
    let source = url;

    // Let a separate server handle the parsing of twitter images with playwright.
    const { imgs } = await fetch(`${config.scraper}?url=${url}`).then(res => res.json()).catch(() => ({ imgs: [url] }));
    // Server returns original image if it couldn't find twitter images.
    if (imgs[0] !== url) {
        all.push(...imgs); // We also return all images in case we want to upload all
        source = imgs[0];
        sauce = url;
    }

    // This part is parsing pixiv images.
    if (url.startsWith('https://www.pixiv.net/en/artworks/')) {
        if (pixiv === undefined) {
            // Login to pixiv only when needed.
            pixiv = await Pixiv.refreshLogin(config.pixiv).catch(() => {
                console.error('\x1b[31m%s\x1b[0m', 'Warning! Pixiv login failed!');
                // Intentionally keep pixiv as undefined to throw error later.
                return pixiv;
            });
        }
        // We attempt to extract the image # from the url
        // Image number is always after /artworks/id, and at the end
        // @ts-expect-error parseInt can handle undefined
        let imageNumber = parseInt(url.match(/\/artworks\/\d{8,}\/(?<id>-?[0-9]+)$/)?.groups.id);
        if (isNaN(imageNumber)) imageNumber = 1;
        else url = url.replace(RegExp(`/${imageNumber}$`), '');
        if (imageNumber > 0) --imageNumber; // Positive indexes start at 0

        const res = await pixiv.illust.get(url).catch(() => {
            // We try to refresh token to hopefully fix the error.
            return pixiv.refreshToken().then(() => {
                return pixiv.illust.get(url);
            }).catch(() => {
                console.error('\x1b[31m%s\x1b[0m', 'Warning! Pixiv refresh token expired!');
            });
        });
        // Try to find given imageNumber, choose first if not found.
        const new_url = res?.meta_pages.at(imageNumber)?.image_urls.original ??
            res?.meta_single_page.original_image_url ?? res?.image_urls.large ??
            res?.image_urls.medium;
        if (new_url) {
            sauce = url;
            source = new_url;
        }
        if (res?.meta_pages.length) {
            all.push(...res.meta_pages.map(p => p.image_urls.original));
        } else if (res?.meta_single_page.original_image_url) {
            all.push(res.meta_single_page.original_image_url);
        }
    }

    // This part is parsing danbooru images.
    if (url.startsWith('https://danbooru.donmai.us/')) {
        const $ = await fetch(url).then(res => res.text()).then(load);
        const sectionTag = $('section').find('.image-container');
        // Backup in case there is no section/image source
        const imgTag = $('img#image');
        source = sectionTag.attr('data-file-url') ?? sectionTag.attr('data-source') ??
            imgTag.attr('src')?.replace('/sample/', '/original/').replace('sample-', '') ?? url;
        // Sauce is not url if source is url. url is fallback if sauce does not exist, but we found source.
        sauce = sectionTag.attr('data-normalized-source') ?? (source === url ? undefined : url);
    }

    return { source, sauce };
}
