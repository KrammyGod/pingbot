import config from '@config';
import path from 'path';
const headers = new Headers();
headers.append('Authorization', config.secret);
export async function uploadToCDN(body: FormData): Promise<string[]> {
    const { urls } = await fetch(`${config.origin}/api/upload`, {
        method: 'POST',
        headers,
        body
    }).then(res => {
        if (res.status === 200) return res.json();
        return { urls: [] };
    }).catch(e => {
        console.error(e);
        return { urls: [] };
    });
    return urls;
}

export async function updateCDN(filenames: string[], newSources: string[]) {
    headers.append('Content-Type', 'application/json');
    // Update to actual null to tell server to remove source
    const sources = newSources.map(s => s === 'null' ? null : s);
    const res = await fetch(`${config.origin}/api/update`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ filenames, sources })
    }).then(res => res.json()).catch(e => console.error(e));
    headers.delete('Content-Type');
    return res?.message ?? 'Error updating files';
}

export async function deleteFromCDN(filenames: string[]): Promise<string> {
    headers.append('Content-Type', 'application/json');
    const res = await fetch(`${config.origin}/api/delete`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ filenames })
    }).then(res => res.json()).catch(e => console.error(e));
    headers.delete('Content-Type');
    return res?.message ?? 'Error deleting files';
}

type Image = { ext: string, blob: Blob };
export async function getImage(url: string): Promise<Image> {
    let opts = undefined;
    if (url.startsWith('https://i.pximg.net/')) {
        // To avoid 403
        opts = { headers: { Referer: 'https://www.pixiv.net/' } };
    }
    return fetch(url, opts).then(res => {
        // Try to extract extension from content-type
        let ext = res.headers.get('Content-Type')?.split('/')[1] ?? path.extname(url).slice(1);
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