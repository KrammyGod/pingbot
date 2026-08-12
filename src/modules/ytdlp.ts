/**
 * Media extraction backed by yt-dlp.
 *
 * Design notes, driven by the modest ARM64 hardware this runs on: every yt-dlp
 * invocation costs roughly a second of CPU on a developer machine and several
 * times that on the deployment target, almost all of it in extraction itself
 * rather than serialisation, so the only lever that matters is invoking it as
 * few times as possible.
 *
 *   - Playlists are read with --flat-playlist, which is a single call regardless
 *     of length: 200 entries in under two seconds. Extracting the same playlist
 *     properly costs about 1.3s per entry, so roughly four minutes, and that is
 *     on a developer machine rather than the deployment target.
 *   - Stream URLs are resolved lazily, one call per song at playback time, not
 *     when the song is queued. They are IP bound and expire after a few hours,
 *     so resolving a whole queue up front would both stall and go stale.
 *   - yt-dlp is never kept alive to pipe audio. It prints a direct CDN URL and
 *     exits, and ffmpeg streams from that URL. Piping through yt-dlp would hold
 *     a Python process open for the length of every song.
 */
import { readFileSync } from 'fs';
import youtubeDl, { create as createYoutubeDl } from 'youtube-dl-exec';

/**
 * Containers install a pinned yt-dlp with pip and point YTDLP_PATH at it, which
 * keeps the binary upgradable without waiting on a youtube-dl-exec release.
 * Local development falls back to the copy the package ships.
 */
const ytdlp = process.env.YTDLP_PATH ? createYoutubeDl(process.env.YTDLP_PATH) : youtubeDl;

/**
 * youtube-dl-exec ships a closed Flags type that predates the yt-dlp options this
 * module depends on (--print, --flat-playlist), and it declares the resolved value
 * as a parsed payload even though --print yields a plain string. Casting once here
 * keeps every call site below honestly typed instead of scattering assertions.
 */
type YtdlpRun = (
    url: string,
    flags: Record<string, unknown>,
    options?: { timeout?: number },
) => Promise<unknown>;
const run = ytdlp as unknown as YtdlpRun;

/**
 * Netscape cookie file for a signed in YouTube account, which is the only way to
 * reach age gated videos.
 */
const COOKIES_PATH = (() => {
    const configured = process.env.YT_COOKIES_PATH;
    if (!configured) return undefined;

    let jar;
    try {
        jar = readFileSync(configured, 'utf8');
    } catch {
        console.error(`YT_COOKIES_PATH is set to ${configured}, but nothing is there. ` +
            'Age gated videos will not play until a cookie jar is put at that path.');
        return undefined;
    }
    // Every lookup carries these, so a jar yt-dlp rejects would fail all of them rather
    // than just the age gated ones. Both checks drop the credentials instead.
    if (!/^#\s*(Netscape\s+)?HTTP Cookie File/i.test(jar)) {
        console.error(`${configured} is not a Netscape cookie file; ignoring it.`);
        return undefined;
    }
    if (!jar.split('\n').some(line => line.trim() && !line.startsWith('#'))) {
        console.error(`${configured} holds no cookies. Copy a signed in export over it. ` +
            'Age gated videos will not play until then.');
        return undefined;
    }
    return configured;
})();

/**
 * Merges credentials into a call's flags. Every yt-dlp invocation goes through this.
 */
function withCookies(flags: Record<string, unknown>): Record<string, unknown> {
    // Inject JS runtimes so it can solve JS challenges, only if there is a cookie included.
    // https://github.com/yt-dlp/yt-dlp/issues/17389
    return COOKIES_PATH ? {
        ...flags,
        cookies: COOKIES_PATH,
        jsRuntimes: 'node',
        extractorArgs: 'youtube:player_client=default,web_embedded',
    } : flags;
}

/** Runs yt-dlp once, carrying credentials, and reports why it failed if it did. */
async function runPrint(
    target: string,
    flags: Record<string, unknown>,
    timeout: number,
): Promise<{ printed?: string; error?: string }> {
    let error = '';
    const printed = await run(target, withCookies(flags), { timeout }).catch((err: unknown) => {
        const failure = err as { stderr?: string; message?: string };
        error = failure?.stderr || failure?.message || '';
        return undefined;
    });
    if (typeof printed === 'string' && printed.trim()) return { printed: printed };
    console.error(error);
    return { error: error };
}

/**
 * yt-dlp's wording for a video it can see but may not read without an account. Worth
 * telling apart from a genuinely missing video, since the two need different answers.
 */
const AGE_GATE = /confirm your age|age.restricted|inappropriate for some users/i;

/**
 * Unit separator. yt-dlp --print emits raw field values, so the delimiter has to
 * be something that cannot appear in a video title.
 */
const SEP = '\x1f';

/** yt-dlp writes this literal string for any field it could not fill in. */
const NOT_AVAILABLE = 'NA';

const METADATA_TIMEOUT_MS = 30_000;
const PLAYLIST_TIMEOUT_MS = 60_000;

/** Guards against a runaway playlist exhausting memory on a small device. */
const MAX_PLAYLIST_ENTRIES = 500;

/** A song, normalised so nothing downstream depends on the extractor's shapes. */
export interface TrackInfo {
    url: string;
    title: string;
    durationInSec: number;
    thumbnail: string | null;
    /** YouTube age gate. */
    ageRestricted?: boolean;
}

/** A playlist and the tracks in it. */
export interface PlaylistInfo {
    url: string;
    title: string;
    thumbnail: string | null;
    entries: TrackInfo[];
}

/** What a link points at, replacing play-dl's validate(). */
export type LinkKind = 'yt_video' | 'yt_playlist' | 'spotify' | 'search';

/** A resolved, directly playable stream. */
export interface StreamTarget {
    /** Direct CDN URL. Short lived and IP bound; hand it straight to ffmpeg. */
    streamUrl: string;
    webpageUrl: string;
    title: string;
    durationInSec: number;
    /** Codec of the chosen format. 'opus' means it can reach Discord unmodified. */
    acodec: string;
    /** YouTube age gate. Playlist entries only report this once resolved. */
    ageLimit: number;
}

/** Reads a --print field, mapping yt-dlp's NA placeholder onto undefined. */
function field(value: string | undefined): string | undefined {
    if (!value || value === NOT_AVAILABLE) return undefined;
    return value;
}

/** Reads a numeric --print field. Durations come back as floats for live streams. */
function numberField(value: string | undefined): number {
    const raw = field(value);
    if (!raw) return 0;
    const parsed = Number.parseFloat(raw);
    return Number.isFinite(parsed) ? Math.floor(parsed) : 0;
}

/**
 * Classifies a link so the caller knows which lookup to run.
 * play-dl did this over the network; it is pure string work.
 */
export function classifyLink(link: string): LinkKind {
    if (!/^https?:\/\//i.test(link)) return 'search';
    let url;
    try {
        url = new URL(link);
    } catch {
        return 'search';
    }
    const host = url.hostname.replace(/^www\./, '');
    if (host === 'open.spotify.com' || host === 'spotify.com') return 'spotify';
    if (host === 'youtu.be') return 'yt_video';
    if (host === 'youtube.com' || host === 'music.youtube.com' || host === 'm.youtube.com') {
        // A watch URL carrying a list= is still a single video unless it is the
        // playlist page itself, which matches how the old code special cased index=.
        if (url.pathname === '/playlist' && url.searchParams.has('list')) return 'yt_playlist';
        if (url.searchParams.has('list') && !url.searchParams.has('v')) return 'yt_playlist';
        return 'yt_video';
    }
    // Anything else is not something yt-dlp is being asked to guess at.
    return 'search';
}

/**
 * First hit for a search phrase, read the same way playlists are: --flat-playlist
 * skips the per video extraction that dominates a search, which is about a third of
 * the wall time. The entry still carries a title, duration and thumbnails; the one
 * field it loses is age_limit, so searched songs are gated when they start playing
 * rather than when they are queued, exactly as playlist entries already were.
 */
async function searchVideo(query: string): Promise<TrackInfo | undefined> {
    const dumped = await run(`ytsearch1:${query}`, withCookies({
        dumpJson: true,
        flatPlaylist: true,
        noWarnings: true,
    }), { timeout: METADATA_TIMEOUT_MS }).catch(() => undefined);

    let entry;
    try {
        entry = typeof dumped === 'string' ? JSON.parse(dumped) : dumped;
    } catch {
        return undefined;
    }
    if (!entry?.title) return undefined;
    const url = entry.webpage_url ?? entry.url;
    if (!url) return undefined;
    return {
        url: url,
        title: entry.title,
        durationInSec: Math.floor(entry.duration ?? 0),
        thumbnail: bestThumbnail(entry.thumbnails),
    };
}

/**
 * Metadata for one video, or the first hit for a search phrase.
 * Deliberately does not resolve a stream URL; see resolveStream.
 *
 * ageGated separates "YouTube will not show me this without an account" from "no such
 * video". They look identical from here but need opposite answers: one is a credential
 * problem to fix, the other is a bad link.
 */
export async function fetchVideo(urlOrQuery: string): Promise<{ info?: TrackInfo; ageGated?: boolean }> {
    if (!/^https?:\/\//i.test(urlOrQuery)) return { info: await searchVideo(urlOrQuery) };
    const { printed, error } = await runPrint(urlOrQuery, {
        print: [
            '%(webpage_url)s',
            '%(title)s',
            '%(duration)s',
            '%(thumbnail)s',
            '%(age_limit)s',
        ].join(SEP),
        noWarnings: true,
        noPlaylist: true,
        skipDownload: true,
    }, METADATA_TIMEOUT_MS);
    if (!printed) return { ageGated: AGE_GATE.test(error ?? '') };

    const [url, title, duration, thumbnail, ageLimit] = printed.trim().split(SEP);
    if (!field(url) || !field(title)) return {};
    return {
        info: {
            url: url,
            title: title,
            durationInSec: numberField(duration),
            thumbnail: field(thumbnail) ?? null,
            ageRestricted: numberField(ageLimit) > 0,
        },
    };
}

/**
 * Every entry of a playlist in one call. --flat-playlist skips per video
 * extraction, which is the difference between one second and several minutes.
 * Durations are present but age limits are not, so entries are treated as clean
 * here and re-checked when each one is actually resolved for playback.
 */
export async function fetchPlaylist(url: string): Promise<PlaylistInfo | undefined> {
    const dumped = await run(url, withCookies({
        dumpSingleJson: true,
        flatPlaylist: true,
        noWarnings: true,
    }), { timeout: PLAYLIST_TIMEOUT_MS }).catch(() => undefined);

    let parsed;
    try {
        parsed = typeof dumped === 'string' ? JSON.parse(dumped) : dumped;
    } catch {
        return undefined;
    }
    if (!parsed || !Array.isArray(parsed.entries)) return undefined;

    const entries: TrackInfo[] = [];
    for (const entry of parsed.entries.slice(0, MAX_PLAYLIST_ENTRIES)) {
        // Unavailable and private videos survive as entries with no title.
        if (!entry?.url || !entry?.title) continue;
        entries.push({
            url: entry.url,
            title: entry.title,
            durationInSec: Math.floor(entry.duration ?? 0),
            thumbnail: bestThumbnail(entry.thumbnails),
        });
    }
    if (!entries.length) return undefined;

    return {
        url: parsed.webpage_url ?? url,
        title: parsed.title ?? '',
        thumbnail: bestThumbnail(parsed.thumbnails),
        entries: entries,
    };
}

/**
 * Resolves something playable into a direct CDN URL, in a single yt-dlp call
 * Accepts a URL or a bare search phrase.
 */
export async function resolveStream(urlOrQuery: string): Promise<StreamTarget | undefined> {
    const target = /^https?:\/\//i.test(urlOrQuery) ? urlOrQuery : `ytsearch1:${urlOrQuery}`;
    const { printed } = await runPrint(target, {
        // Opus is preferred over an equal bitrate AAC because it is already the
        // codec Discord speaks, so it can be forwarded without re-encoding.
        // See createOpusStream() in classes/voice.
        format: 'bestaudio[acodec=opus]/bestaudio/best',
        print: [
            '%(urls)s',
            '%(webpage_url)s',
            '%(title)s',
            '%(duration)s',
            '%(acodec)s',
            '%(age_limit)s',
        ].join(SEP),
        noWarnings: true,
        noPlaylist: true,
        skipDownload: true,
    }, METADATA_TIMEOUT_MS);
    if (!printed) return undefined;

    const [streamUrl, webpageUrl, title, duration, acodec, ageLimit] = printed.trim().split(SEP);
    if (!field(streamUrl) || !field(webpageUrl)) return undefined;
    return {
        streamUrl: streamUrl.split('\n')[0],
        webpageUrl: webpageUrl,
        title: field(title) ?? '',
        durationInSec: numberField(duration),
        acodec: field(acodec) ?? '',
        ageLimit: numberField(ageLimit),
    };
}

/** Largest thumbnail from a yt-dlp thumbnails array. */
function bestThumbnail(thumbnails: unknown): string | null {
    if (!Array.isArray(thumbnails) || !thumbnails.length) return null;
    let best: { url?: string; width?: number; height?: number } | undefined;
    let bestArea = -1;
    for (const thumbnail of thumbnails) {
        if (!thumbnail?.url) continue;
        const area = (thumbnail.width ?? 0) * (thumbnail.height ?? 0);
        if (area > bestArea) {
            bestArea = area;
            best = thumbnail;
        }
    }
    return best?.url ?? null;
}
