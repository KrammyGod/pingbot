import config from '@config';
import Pixiv from 'pixiv.ts';
import { load } from 'cheerio';

// Pixiv object for scraping pixiv images.
let pixiv: Pixiv;

/**
 * Returns all images scraped from the given url.
 */
export default async function scrape(source: string) {
    const images: string[] = [];

    // This part is parsing pixiv images.
    if (source.startsWith('https://www.pixiv.net/')) {
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
        let imageNumber = parseInt(source.match(/\/artworks\/\d{7,}\/(?<id>-?[0-9]+)$/)?.groups.id);
        if (imageNumber > 0) --imageNumber; // Positive indexes start at 0

        const res = await pixiv.illust.get(source).catch(() => {
            // We try to refresh token to hopefully fix the error.
            return pixiv.refreshToken().then(() => {
                return pixiv.illust.get(source);
            }, () => {
                console.error('\x1b[31m%s\x1b[0m', 'Warning! Pixiv refresh token expired!');
            });
        });
        if (res) {
            source = res.url!;
            // Try to find given imageNumber, choose first if not found.
            const new_url = res.meta_pages.at(imageNumber)?.image_urls.original ??
                res.meta_pages.at(0)?.image_urls.original ??
                res.meta_single_page.original_image_url ?? res.image_urls.large ??
                res.image_urls.medium;
            // There are multiple images, and did not specify an image, return all available.
            if (res.meta_pages.length && isNaN(imageNumber)) {
                images.push(...res.meta_pages.map(p => p.image_urls.original));
            } else {
                images.push(new_url);
            }
        }
    }

    // This part is parsing danbooru images.
    if (source.startsWith('https://danbooru.donmai.us/')) {
        const $ = await fetch(source).then(res => res.text()).then(load);
        const sectionTag = $('section').find('.image-container');
        // Backup in case there is no section/image source
        const imgTag = $('img#image');
        const raw_image = sectionTag.attr('data-file-url') ?? sectionTag.attr('data-source') ??
            imgTag.attr('src')?.replace('/sample/', '/original/').replace('sample-', '');
        if (raw_image) {
            images.push(raw_image);
        }
    }

    if (!images.length) {
        // Let a separate server handle the parsing of twitter images with playwright.
        const { imgs } = await fetch(`${config.scraper}?url=${source}`)
            .then(res => res.json(), () => ({ imgs: [] }));
        images.push(...imgs);
    }

    // No images could be found, tell caller to try uploading source
    if (!images.length) images.push(source);

    return { images, source };
}
