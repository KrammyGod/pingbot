"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.deleteFromCDN = exports.updateCDN = exports.uploadToCDN = void 0;
const _config_1 = __importDefault(require("../classes/config.js"));
const headers = new Headers();
headers.append('Authorization', _config_1.default.secret);
async function uploadToCDN(form) {
    const { urls } = await fetch(`${_config_1.default.origin}/api/upload`, {
        method: 'POST',
        body: form,
        headers
    }).then(res => {
        if (res.status === 200)
            return res.json();
        return { urls: [] };
    }).catch(e => {
        console.error(e);
        return { urls: [] };
    });
    return urls;
}
exports.uploadToCDN = uploadToCDN;
async function updateCDN(filenames, newSources) {
    headers.append('Content-Type', 'application/json');
    // Update to actual null to tell server to remove source
    const sources = newSources.map(s => s === 'null' ? null : s);
    const res = await fetch(`${_config_1.default.origin}/api/update`, {
        method: 'PUT',
        headers,
        body: JSON.stringify({ filenames, sources })
    }).then(res => res.json()).catch(e => console.error(e));
    headers.delete('Content-Type');
    return res?.message ?? 'Error updating files';
}
exports.updateCDN = updateCDN;
async function deleteFromCDN(filenames) {
    headers.append('Content-Type', 'application/json');
    const res = await fetch(`${_config_1.default.origin}/api/delete`, {
        method: 'DELETE',
        headers,
        body: JSON.stringify({ filenames })
    }).then(res => res.json()).catch(e => console.error(e));
    headers.delete('Content-Type');
    return res?.message ?? 'Error deleting files';
}
exports.deleteFromCDN = deleteFromCDN;
//# sourceMappingURL=cdn.js.map