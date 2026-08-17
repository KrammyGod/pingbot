import config from '@config';
import path from 'path';
import { VOID } from '@modules/utils';

/**
 * Built per request. A shared Headers object let concurrent calls append a second
 * Content-Type onto each other and delete it out from under one another.
 */
function authHeaders(extra?: Record<string, string>) {
    return { 'Authorization': `Bearer ${config.secret}`, ...extra };
}

const JSON_HEADERS = { 'Content-Type': 'application/json' };

export async function uploadToCDN(body: FormData): Promise<string[]> {
    const { urls } = await fetch(`${config.origin}/api/upload`, {
        method: 'POST',
        headers: authHeaders(),
        body,
    }).then(res => {
        if (res.status === 200) return res.json();
        // Try to log error message
        res.json().then(e => console.error(`POST JSON: ${JSON.stringify(e)}`), VOID);
        return { urls: [] };
    }).catch(e => {
        console.error(`POST: ${e}`);
        return { urls: [] };
    });
    return urls;
}

export async function updateCDN(filenames: string[], newSources: string[]) {
    // Update to actual null to tell server to remove source
    const sources = newSources.map(s => s === 'null' ? null : s);
    const res = await fetch(`${config.origin}/api/update`, {
        method: 'PUT',
        headers: authHeaders(JSON_HEADERS),
        body: JSON.stringify({ filenames, sources }),
    }).then(res => res.json()).catch(e => console.error(`PUT: ${e}`));
    return res?.message ?? 'Error updating files';
}

export async function deleteFromCDN(filenames: string[]): Promise<string> {
    const res = await fetch(`${config.origin}/api/delete`, {
        method: 'DELETE',
        headers: authHeaders(JSON_HEADERS),
        body: JSON.stringify({ filenames }),
    }).then(res => res.json()).catch(e => console.error(`DELETE: ${e}`));
    return res?.message ?? 'Error deleting files';
}

export async function getImage(url: string) {
    let opts = undefined;
    if (url.startsWith('https://i.pximg.net/')) {
        // To avoid 403
        opts = { headers: { Referer: 'https://www.pixiv.net/' } };
    }
    return fetch(url, opts).then(res => {
        // Try to extract extension from content-type
        let ext = res.headers.get('Content-Type')?.split('/').at(1) ?? path.extname(url).slice(1);
        if (ext === 'jpeg') ext = 'jpg';
        return res.blob().then(blob => ({ ext, blob }));
    }).catch(() => ({ ext: '', blob: new Blob([]) }));
}

/**
 * Helper to get the ID from a CDN link.
 * Returns the same thing back if link is invalid
 */
export async function getCDNId(url: string) {
    if (!url.startsWith(config.cdn)) {
        return url;
    }
    const res = await fetch(url);
    if (!res.headers.get('Content-Type')?.startsWith('image')) {
        return url;
    }
    // Confirmed valid image
    return url.replace(`${config.cdn}/images/`, '');
}
