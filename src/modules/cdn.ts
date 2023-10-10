import config from '@config';
const headers = new Headers();
headers.append('Authorization', config.secret);
export async function uploadToCDN(form: FormData): Promise<string[]> {
    const { urls } = await fetch(`${config.origin}/api/upload`, {
        method: 'POST',
        body: form,
        headers
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
