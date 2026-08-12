/**
 * Spotify metadata for the music commands.
 *
 * Spotify streams are DRM'd and cannot be played, so nothing here resolves audio. A
 * Spotify link is read for metadata and turned into the same TrackInfo the yt-dlp
 * module produces, carrying a searchQuery so playback matches it against YouTube
 * lazily, when the song actually starts.
 */
import config from '@config';
import { MAX_PLAYLIST_ENTRIES, PlaylistInfo, TrackInfo } from '@modules/ytdlp';

/** Spotify ids are 22 characters of base62. Checked before any call so junk never leaves the process. */
const SPOTIFY_ID = /^[A-Za-z0-9]{22}$/;

const TOKEN_URL = 'https://accounts.spotify.com/api/token';
const API_BASE = 'https://api.spotify.com/v1';

/** fetch has no default timeout, and a stalled lookup would hold up the whole command. */
const REQUEST_TIMEOUT_MS = 10_000;

/** Renew this early so a token cannot lapse between the expiry check and the request using it. */
const TOKEN_SAFETY_MARGIN_MS = 60_000;

/** Spotify's documented lifetime, assumed only until the response states its own. */
const ASSUMED_TOKEN_LIFETIME_MS = 3_600_000;

/** Why a link could not be turned into songs. Each one needs a different answer, so they stay distinct. */
export type SpotifyFailure = 'unconfigured' | 'notFound' | 'rateLimited' | 'unsupported' | 'error';

export type SpotifyResult =
    | { kind: 'track'; track: TrackInfo }
    | { kind: 'collection'; collection: PlaylistInfo }
    | { kind: 'failure'; failure: SpotifyFailure };

type SpotifyTarget = { type: 'track' | 'album' | 'playlist'; id: string };

/**
 * Pulls the resource out of any shape Spotify hands out, including the spotify: URIs the
 * desktop client copies and the /intl-xx/ locale segment mobile shares carry.
 */
export function parseSpotifyLink(link: string): SpotifyTarget | 'unsupported' {
    let type: string | undefined;
    let id: string | undefined;
    const uri = /^spotify:([a-z]+):([A-Za-z0-9]+)$/i.exec(link.trim());
    if (uri) {
        [, type, id] = uri;
        type = type?.toLowerCase();
    } else {
        let url;
        try {
            url = new URL(link);
        } catch {
            return 'unsupported';
        }
        if (url.hostname.replace(/^www\./, '') !== 'open.spotify.com') return 'unsupported';
        const parts = url.pathname.split('/').filter(Boolean);
        if (parts[0]?.startsWith('intl-')) parts.shift();
        [type, id] = parts;
    }
    if (!id || !SPOTIFY_ID.test(id)) return 'unsupported';
    if (type !== 'track' && type !== 'album' && type !== 'playlist') return 'unsupported';
    return { type: type, id: id };
}

type CachedToken = { expiresAt: number; token: Promise<string | undefined> };

let cachedToken: CachedToken | undefined;

async function mintToken(): Promise<{ token: string; expiresAt: number } | undefined> {
    const credentials = Buffer.from(`${config.spotifyId}:${config.spotifySecret}`).toString('base64');
    const res = await fetch(TOKEN_URL, {
        method: 'POST',
        headers: {
            authorization: `Basic ${credentials}`,
            'content-type': 'application/x-www-form-urlencoded',
        },
        body: 'grant_type=client_credentials',
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => undefined);
    if (!res?.ok) {
        console.error(`Spotify refused the client credentials (${res?.status ?? 'no response'}).`);
        return undefined;
    }
    const body = await res.json().catch(() => undefined) as
        { access_token?: string; expires_in?: number } | undefined;
    if (!body?.access_token) return undefined;
    // expires_in is seconds and needs the *1000; the fallback is already milliseconds.
    const lifetimeMs = body.expires_in !== undefined ? body.expires_in * 1000 : ASSUMED_TOKEN_LIFETIME_MS;
    return {
        token: body.access_token,
        expiresAt: Date.now() + lifetimeMs - TOKEN_SAFETY_MARGIN_MS,
    };
}

/**
 * Caches the in-flight promise rather than the resolved token, so several commands racing
 * at startup share one request instead of minting a token each.
 */
function getToken(): Promise<string | undefined> {
    if (cachedToken && cachedToken.expiresAt > Date.now()) return cachedToken.token;
    const entry: CachedToken = {
        // Held only long enough for concurrent callers to coalesce onto this request;
        // the response replaces it with the lifetime Spotify actually granted.
        expiresAt: Date.now() + ASSUMED_TOKEN_LIFETIME_MS - TOKEN_SAFETY_MARGIN_MS,
        token: Promise.resolve(undefined),
    };
    entry.token = mintToken().then(minted => {
        // A failed mint must not be cached, or every later call fails until it expires.
        if (!minted) {
            if (cachedToken === entry) cachedToken = undefined;
            return undefined;
        }
        entry.expiresAt = minted.expiresAt;
        return minted.token;
    });
    cachedToken = entry;
    return entry.token;
}

type ApiResult<T> = { data: T } | { failure: SpotifyFailure };

/**
 * One GET against the Web API. `retry` exists so a 401 gets exactly one fresh token
 * rather than looping: a revoked token and a drifted clock look identical from here.
 */
async function spotifyApi<T>(path: string, retry = true): Promise<ApiResult<T>> {
    if (!config.spotifyId || !config.spotifySecret) return { failure: 'unconfigured' };
    const token = await getToken();
    if (!token) return { failure: 'error' };

    const res = await fetch(`${API_BASE}${path}`, {
        headers: { authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => undefined);
    if (!res) {
        console.error(`Spotify request to ${path} did not complete.`);
        return { failure: 'error' };
    }
    if (res.status === 401 && retry) {
        cachedToken = undefined;
        return spotifyApi<T>(path, false);
    }
    // 404 is also what Spotify's own editorial playlists return to app credentials.
    if (res.status === 404) return { failure: 'notFound' };
    if (res.status === 429) {
        console.error(
            `Spotify rate limited ${path}; retry after ${res.headers.get('retry-after') ?? '?'}s.`,
        );
        return { failure: 'rateLimited' };
    }
    if (!res.ok) {
        console.error(`Spotify returned ${res.status} for ${path}.`);
        return { failure: 'error' };
    }
    const data = await res.json().catch(() => undefined) as T | undefined;
    if (data === undefined) return { failure: 'error' };
    return { data: data };
}

interface SpotifyImage { url?: string; width?: number | null }
interface SpotifyTrack {
    name?: string;
    type?: string;
    is_local?: boolean;
    duration_ms?: number;
    external_urls?: { spotify?: string };
    artists?: { name?: string }[];
    album?: { images?: SpotifyImage[] };
}
interface SpotifyPage<T> { items?: T[]; next?: string | null }
interface SpotifyAlbum {
    name?: string;
    images?: SpotifyImage[];
    external_urls?: { spotify?: string };
    tracks?: SpotifyPage<SpotifyTrack>;
}
interface SpotifyPlaylistItem { is_local?: boolean; track?: SpotifyTrack | null }
interface SpotifyPlaylist {
    name?: string;
    images?: SpotifyImage[];
    external_urls?: { spotify?: string };
    tracks?: SpotifyPage<SpotifyPlaylistItem>;
}

/** Largest image offered. Spotify orders them widest first but does not promise to. */
function bestImage(images: SpotifyImage[] | undefined): string | null {
    if (!Array.isArray(images)) return null;
    let best: SpotifyImage | undefined;
    for (const image of images) {
        if (!image?.url) continue;
        if (!best || (image.width ?? 0) > (best.width ?? 0)) best = image;
    }
    return best?.url ?? null;
}

/**
 * The explicit flag is deliberately not mapped onto ageRestricted: that gate silently
 * drops songs outside NSFW channels, and explicit is not YouTube's age gate. The real
 * gate still applies, re-checked from the resolved stream when the song starts.
 */
function toTrackInfo(track: SpotifyTrack | null | undefined, fallbackThumbnail: string | null): TrackInfo | undefined {
    // Removed, region blocked, local, and podcast entries all survive in a playlist
    // carrying none of the fields below.
    if (!track?.name || track.is_local) return undefined;
    if (track.type && track.type !== 'track') return undefined;
    const url = track.external_urls?.spotify;
    if (!url) return undefined;
    const artists = (track.artists ?? []).map(artist => artist.name).filter(Boolean);
    const title = artists.length ? `${artists.join(', ')} - ${track.name}` : track.name;
    return {
        url: url,
        title: title,
        durationInSec: Math.floor((track.duration_ms ?? 0) / 1000),
        thumbnail: bestImage(track.album?.images) ?? fallbackThumbnail,
        searchQuery: title,
    };
}

/**
 * Walks a paged endpoint until the cap is reached. Albums come 50 at a time and playlists
 * 100, so a capped collection is at most a handful of calls. Offsets are rebuilt rather
 * than following the `next` URL, which keeps the query under this module's control.
 */
async function collectPages<T>(
    path: string,
    limit: number,
    firstPage: SpotifyPage<T> | undefined,
    toTrack: (item: T) => TrackInfo | undefined,
    extraQuery = '',
): Promise<{ entries: TrackInfo[] } | { failure: SpotifyFailure }> {
    const entries: TrackInfo[] = [];
    const take = (items: T[] | undefined) => {
        for (const item of items ?? []) {
            if (entries.length >= MAX_PLAYLIST_ENTRIES) return;
            const track = toTrack(item);
            if (track) entries.push(track);
        }
    };

    let page = firstPage;
    take(page?.items);
    let offset = page?.items?.length ?? 0;
    while (page?.next && entries.length < MAX_PLAYLIST_ENTRIES) {
        const result = await spotifyApi<SpotifyPage<T>>(`${path}?limit=${limit}&offset=${offset}${extraQuery}`);
        if ('failure' in result) return { failure: result.failure };
        page = result.data;
        // A next pointer with nothing behind it would otherwise spin forever.
        if (!page.items?.length) break;
        take(page.items);
        offset += page.items.length;
    }
    return { entries: entries };
}

/** Untrimmed playlist responses are enormous; ask only for what maps onto TrackInfo. */
const PLAYLIST_ITEMS =
    'items(is_local,track(name,type,duration_ms,external_urls.spotify,album(images),artists(name)))';

async function fetchTrack(id: string): Promise<SpotifyResult> {
    const result = await spotifyApi<SpotifyTrack>(`/tracks/${id}`);
    if ('failure' in result) return { kind: 'failure', failure: result.failure };
    const track = toTrackInfo(result.data, null);
    if (!track) return { kind: 'failure', failure: 'notFound' };
    return { kind: 'track', track: track };
}

async function fetchAlbum(id: string): Promise<SpotifyResult> {
    const result = await spotifyApi<SpotifyAlbum>(`/albums/${id}`);
    if ('failure' in result) return { kind: 'failure', failure: result.failure };
    const album = result.data;
    const url = album.external_urls?.spotify;
    if (!url) return { kind: 'failure', failure: 'notFound' };
    // Album track objects carry no album of their own, so the cover has to come from
    // the album and be applied to every entry.
    const thumbnail = bestImage(album.images);
    const collected = await collectPages<SpotifyTrack>(
        `/albums/${id}/tracks`, 50, album.tracks,
        track => toTrackInfo(track, thumbnail),
    );
    if ('failure' in collected) return { kind: 'failure', failure: collected.failure };
    if (!collected.entries.length) return { kind: 'failure', failure: 'notFound' };
    return {
        kind: 'collection',
        collection: { url: url, title: album.name ?? '', thumbnail: thumbnail, entries: collected.entries },
    };
}

async function fetchPlaylist(id: string): Promise<SpotifyResult> {
    const fields = `name,external_urls.spotify,images,tracks.next,tracks.${PLAYLIST_ITEMS}`;
    const result = await spotifyApi<SpotifyPlaylist>(`/playlists/${id}?fields=${encodeURIComponent(fields)}`);
    if ('failure' in result) return { kind: 'failure', failure: result.failure };
    const playlist = result.data;
    const url = playlist.external_urls?.spotify;
    if (!url) return { kind: 'failure', failure: 'notFound' };
    const thumbnail = bestImage(playlist.images);
    const collected = await collectPages<SpotifyPlaylistItem>(
        `/playlists/${id}/tracks`, 100, playlist.tracks,
        item => (item?.is_local ? undefined : toTrackInfo(item?.track, thumbnail)),
        `&fields=${encodeURIComponent(`${PLAYLIST_ITEMS},next`)}`,
    );
    if ('failure' in collected) return { kind: 'failure', failure: collected.failure };
    if (!collected.entries.length) return { kind: 'failure', failure: 'notFound' };
    return {
        kind: 'collection',
        collection: { url: url, title: playlist.name ?? '', thumbnail: thumbnail, entries: collected.entries },
    };
}

/** The module's only entry point. Everything above it is an implementation detail. */
export async function fetchSpotify(link: string): Promise<SpotifyResult> {
    if (!config.spotifyId || !config.spotifySecret) return { kind: 'failure', failure: 'unconfigured' };
    const target = parseSpotifyLink(link);
    if (target === 'unsupported') return { kind: 'failure', failure: 'unsupported' };
    if (target.type === 'track') return fetchTrack(target.id);
    if (target.type === 'album') return fetchAlbum(target.id);
    return fetchPlaylist(target.id);
}
