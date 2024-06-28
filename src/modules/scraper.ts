import crypto from 'crypto';
import config from '@config';
import Pixiv from 'pixiv.ts';
import { load, } from 'cheerio';
import { LambdaClient, InvokeCommand, } from '@aws-sdk/client-lambda';

// Pixiv object for scraping pixiv images.
let pixiv: Pixiv;

/**
 * Returns all images scraped from the given url.
 */
export async function getRawImageLink(source: string) {
    const images: string[] = [];

    // Generate unique ID for logs
    const id = crypto.randomInt(100000);

    // This part is parsing pixiv images.
    console.log(`(scraper/getRawImageLink ${id}) Got ${source}`);
    if (source.startsWith('https://www.pixiv.net/')) {
        console.log(`(scraper/getRawImageLink ${id}) I think it's a pixiv link. Trying pixiv...`);
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
        console.log(`(scraper/getRawImageLink ${id}) Have ${JSON.stringify(images)} after pixiv.`);
    }

    // This part is parsing danbooru images.
    if (source.startsWith('https://danbooru.donmai.us/')) {
        console.log(`(scraper/getRawImageLink ${id}) I think it's a danbooru link. Trying danbooru...`);
        const $ = await fetch(source).then(res => res.text()).then(load);
        const sectionTag = $('section').find('.image-container');
        // Backup in case there is no section/image source
        const imgTag = $('img#image');
        const raw_image = sectionTag.attr('data-file-url') ?? sectionTag.attr('data-source') ??
            imgTag.attr('src')?.replace('/sample/', '/original/').replace('sample-', '');
        if (raw_image) {
            images.push(raw_image);
        }
        console.log(`(scraper/getRawImageLink ${id}) Have ${JSON.stringify(images)} after danbooru.`);
    }

    if (!images.length) {
        console.log(`(scraper/getRawImageLink ${id}) Trying twitter...`);
        console.log(`(scraper/getRawImageLink ${id}) GET ${config.scraper}?url=${source}`);
        // Let a separate server handle the parsing of twitter images with playwright.
        const { imgs } = await fetch(`${config.scraper}?url=${source}`)
            .then(res => {
                console.log(`(scraper/getRawImageLink ${id}) Scraper returned ${res.status}.`);
                return res.json();
            }, () => { 
                return { imgs: [] };
            });
        images.push(...imgs);
        console.log(`(scraper/getRawImageLink ${id}) Response: ${JSON.stringify(images)}`);
    }

    // No images could be found, tell caller to try uploading source
    if (!images.length) {
        console.log(`(scraper/getRawImageLink ${id}) Exhausted all known links. No images found.`);
        images.push(source);
    }

    return { images, source };
}

// When error is true, sauce is a message instead of a link.
interface GetSauceResponse {
    error: boolean;
    sauce: string;
};
const client = new LambdaClient();
/**
 * Scrape saucenao.com API for best image source we can get.
 */
export async function getSauce(rawImageLink: string, retries: number = 2): Promise<GetSauceResponse> {
    // By default, use AWS lambda to scrape saucenao as they have rotating IPs, resulting in better rate limits.
    if (config.lambda) {
        const command = new InvokeCommand({
            FunctionName: 'SauceNao-Scraper',
            Payload: JSON.stringify({ url: rawImageLink }),
        });
        const res = await client.send(command).then(res => new TextDecoder().decode(res.Payload));
        return JSON.parse(res);
    }
    
    // However, also allow local scraping.
    const url = 'https://saucenao.com/search.php?' + new URLSearchParams({
        output_type: '2',
        numres: '1',
        // pixiv, danbooru, gelbooru, twitter
        dbmask: (0x20 | 0x200 | 0x1000000 | 0x10000000000).toString(),
        api_key: Buffer.from(config.saucenao, 'base64').toString(),
        url: rawImageLink,
    });
    console.log('(scraper/getSauce) fetching:', url);
    return fetch(url).then(res => res.json()).then(async res => {
        if (res.header.status > 0) {
            return {
                error: true,
                sauce: res.header.message,
            };
        } else if (res.header.status < 0) {
            if (res.header.short_remaining) {
                // If there exists the short_remaining key, we've failed the search, so error
                return {
                    error: true,
                    sauce: res.header.message,
                };
            }
            // Otherwise we've hit short limit, wait 30 seconds (short limit), and retry.
            // We keep retrying, and keep getting no short limit
            // Likely we've hit long limit, stop and error
            if (retries === 0) {
                return {
                    error: true,
                    sauce: res.header.message,
                };
            }
            return new Promise(resolve => setTimeout(() => {
                getSauce(rawImageLink, retries - 1).then(resolve);
            }, 30000)) as Promise<GetSauceResponse>;
        }
        return {
            error: false,
            sauce: res.results[0].data.ext_urls[0],
        };
    }).catch((err) => {
        return {
            error: true,
            sauce: err.toString(),
        };
    });
}
