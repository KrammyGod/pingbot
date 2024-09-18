"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.getCDNMetrics = getCDNMetrics;
exports.uploadToCDN = uploadToCDN;
exports.updateCDN = updateCDN;
exports.deleteFromCDN = deleteFromCDN;
exports.getImage = getImage;
exports.getCDNId = getCDNId;
const _config_1 = __importDefault(require("../classes/config.js"));
const path_1 = __importDefault(require("path"));
const utils_1 = require("./utils");
const headers = new Headers();
headers.append('Authorization', `Bearer ${_config_1.default.secret}`);
async function getCDNMetrics() {
    const res = await fetch(`${_config_1.default.origin}/api/metrics`, {
        method: 'GET',
        headers,
    }).then(res => res.json()).catch(e => console.error(`GET: ${e}`));
    return res ?? { metrics: [] };
}
async function uploadToCDN(body) {
    const { urls } = await fetch(`${_config_1.default.origin}/api/upload`, {
        method: 'POST',
        headers,
        body,
    }).then(res => {
        if (res.status === 200)
            return res.json();
        // Try to log error message
        res.json().then(e => console.error(`POST JSON: ${JSON.stringify(e)}`), utils_1.VOID);
        return { urls: [] };
    }).catch(e => {
        console.error(`POST: ${e}`);
        return { urls: [] };
    });
    return urls;
}
async function updateCDN(filenames, newSources) {
    headers.append('Content-Type', 'application/json');
    // Update to actual null to tell server to remove source
    const sources = newSources.map(s => s === 'null' ? null : s);
    const res = await fetch(`${_config_1.default.origin}/api/update`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ filenames, sources }),
    }).then(res => res.json()).catch(e => console.error(`PUT: ${e}`));
    headers.delete('Content-Type');
    return res?.message ?? 'Error updating files';
}
async function deleteFromCDN(filenames) {
    headers.append('Content-Type', 'application/json');
    const res = await fetch(`${_config_1.default.origin}/api/delete`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ filenames }),
    }).then(res => res.json()).catch(e => console.error(`DELETE: ${e}`));
    headers.delete('Content-Type');
    return res?.message ?? 'Error deleting files';
}
async function getImage(url) {
    let opts = undefined;
    if (url.startsWith('https://i.pximg.net/')) {
        // To avoid 403
        opts = { headers: { Referer: 'https://www.pixiv.net/' } };
    }
    return fetch(url, opts).then(res => {
        // Try to extract extension from content-type
        let ext = res.headers.get('Content-Type')?.split('/').at(1) ?? path_1.default.extname(url).slice(1);
        if (ext === 'jpeg')
            ext = 'jpg';
        return res.blob().then(blob => ({ ext, blob }));
    }).catch(() => ({ ext: '', blob: new Blob([]) }));
}
/**
 * Helper to get the ID from a CDN link.
 * Returns the same thing back if link is invalid
 */
async function getCDNId(url) {
    if (!url.startsWith(_config_1.default.cdn)) {
        return url;
    }
    const res = await fetch(url);
    if (!res.headers.get('Content-Type')?.startsWith('image')) {
        return url;
    }
    // Confirmed valid image
    return url.replace(`${_config_1.default.cdn}/images/`, '');
}
//# sourceMappingURL=cdn.js.map