import Pixiv from 'pixiv.ts';
import config from '@config';
import EventEmitter from 'events';
import { load } from 'cheerio';

// Connect to pixiv
let pixiv: Pixiv;
const PixivReady = new EventEmitter();
Pixiv.refreshLogin(config.pixiv).then(res => {
    pixiv = res;
    PixivReady.emit('ready');
}).catch(() => { });

// Returns the source and sauce of an image.
// Source is the raw image url, sauce is the
// description for imgur uploads (if needed)
export default async function scrape(url: string, all: string[] = []) {
    let source = url;
    let sauce = undefined;

    // Let a separate server handle the parsing of twitter images with playwright.
    const { imgs }: { imgs: string[] } = await fetch(
        `${config.scraper}?url=${url}`
    ).then(res => res.json());
    // Server returns original image if it couldn't find twitter images.
    if (imgs[0] !== url) {
        all.push(...imgs); // We also return all images in case we want to upload all
        source = imgs[0];
        sauce = url;
    }

    // This part is parsing pixiv images.
    if (url.startsWith('https://www.pixiv.net/')) {
        // Wait for pixiv to be ready before continuing
        if (pixiv === undefined) {
            await new Promise(resolve => PixivReady.once('ready', resolve));
        }
        // We attempt to extract the image # from the url
        // Replace /artworks/id with nothing so we can extract the image number
        const imgNums = url.replace(/\/artworks\/[0-9]+/, '').match(/-?[0-9]+/);
        let imageNumber: number | undefined = undefined;
        if (imgNums) imageNumber = parseInt(imgNums[0]);
        if (!imageNumber || isNaN(imageNumber)) imageNumber = 1;
        else url = url.replace(RegExp(`/${imageNumber}$`), '');
        if (imageNumber <= 0) imageNumber = 1;
        // 1 is first image, but is 0 in array
        --imageNumber;

        const res = await pixiv.illust.get(url);
        // Try to find given imageNumber, choose first if not found.
        const new_url = res?.meta_pages[imageNumber]?.image_urls?.original ??
            res?.meta_single_page?.original_image_url ?? res?.image_urls?.large ??
            res?.image_urls?.medium;
        if (new_url) {
            sauce = url;
            source = new_url;
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
