import * as fs from 'fs';
import * as rl from 'readline/promises';
import { Pool, QueryResultRow } from 'pg';

const CDN_URL = 'https://d1irvsiobt1r8d.cloudfront.net';
// The shared file path between upload_waifus_txt.ts and download_waifus_txt.ts
const filePath = './files/waifus.txt';
const imgReplacer = (i: string) => {
    if (i.startsWith('https://i.imgur')) return i;
    // Just to make it look prettier, include full link
    // Change this to change output
    return `${CDN_URL}/images/${i}`;
};

const pool = new Pool({
    host: process.env.PRODHOST, // Not included in .env.example, since for personal use only.
});
function query<R extends QueryResultRow = QueryResultRow, I = unknown>(query: string, values?: I[]) {
    return pool.query<R>(query, values).then(res => res.rows);
}

// Copied necessary stuff from database.ts
type WaifuDetails = {
    iid: string;
    name: string;
    gender: 'Female' | 'Male' | 'Unknown';
    origin: string;
    img: string[] | string;
    nimg: string[] | string;
};
class Waifu {
    iid: string;
    name: string;
    gender: 'Female' | 'Male' | 'Unknown';
    origin: string;
    img: string;
    _img: string | string[];
    nimg: string;
    _nimg: string | string[];

    static fromRows(rows: unknown[]) {
        const rets: Waifu[] = [];
        for (const row of rows) {
            rets.push(new Waifu(row as WaifuDetails));
        }
        return rets;
    }

    constructor(row: WaifuDetails) {
        if (!row) throw new Error('Waifu details partial');
        this.iid = row.iid;
        this.name = row.name;
        this.gender = row.gender;
        this.origin = row.origin;
        this.img = Array.isArray(row.img) ? `[${row.img.map(imgReplacer).join(', ')}]` : row.img;
        this.nimg = Array.isArray(row.nimg) ? `[${row.nimg.map(imgReplacer).join(', ')}]` : row.nimg;
        // Raw values are useful for calculations
        this._img = row.img;
        this._nimg = row.nimg;
    }

    equal(other: Waifu) {
        return this.name === other.name && this.gender === other.gender &&
            this.origin === other.origin && this.img === other.img &&
            this.nimg === other.nimg;
    }
}

function loadFromFile() {
    // Header takes up 3 lines, footer takes up 1 line.
    const toParse = fs.readFileSync(filePath, 'utf8').split('\n').slice(3, -2);
    const backupWaifus: Waifu[] = [];
    for (const line of toParse) {
        // Remove first and last connector
        const [iid, name, _gender, origin, img, nimg] = line.split('|').map(x => x.trim()).slice(1, -1);
        const gender = _gender === 'Female' ? _gender : (_gender === 'Male' ? _gender : 'Unknown');
        backupWaifus.push(new Waifu({ iid, name, gender, origin, img, nimg }));
    }
    return backupWaifus;
}

async function confirm(prompt: string) {
    const confirm = rl.createInterface({
        input: process.stdin,
        output: process.stdout,
    });
    const confirmed = await confirm.question(prompt).then(ans => ans === 'y', () => false);
    confirm.close();
    return confirmed;
}

const connector = '+';
const horizontalLine = '―';
const verticalLine = '|';
function center(str: string, size: number) {
    // Not asserted, but assuming size >= str.length
    const len = size - str.length;
    const start = Math.ceil(len / 2);
    const end = len - start;
    return `${' '.repeat(start)}${str}${' '.repeat(end)}`;
}
if (require.main === module) {
    (async () => {
        const waifus = await query<WaifuDetails>('SELECT * FROM waifus ORDER BY name, iid').then(Waifu.fromRows);

        /* Used for imgur uploading purposes */
        // console.log([...waifus].sort((a, b) => {
        //     const ac = (a._img as string[]).filter(img => {
        //         if (img.startsWith('https://i.imgur')) return true;
        //         return false;
        //     }).length;
        //     const bc = (b._img as string[]).filter(img => {
        //         if (img.startsWith('https://i.imgur')) return true;
        //         return false;
        //     }).length;
        //     return bc - ac;
        // }).slice(0, 10).map(w => `${w.name} - ${w._img.length}`).join('\n'));
        // return pool.end();

        let loadedWaifus: Waifu[];
        try {
            loadedWaifus = loadFromFile();
        } catch (e) {
            // File doesn't exist, ignore
            loadedWaifus = [];
        }
        if (loadedWaifus.length) {
            let confirmed = true;
            for (const w of loadedWaifus) {
                const found = waifus.find(waifu => waifu.iid === w.iid);
                if (!found || !found.equal(w)) {
                    confirmed = await confirm('Local differs from remote, continue? (y/n) ');
                    break;
                }
            }
            if (!confirmed) {
                console.log('Aborting...');
                return;
            }
        }
        const writer = fs.createWriteStream(filePath);
        const headers = ['iid', 'name', 'gender', 'origin', 'img', 'nimg'];
        const maxIIDLength = Math.max(...waifus.map(w => w.iid.length)) + 2;
        const maxNameLength = Math.max(...waifus.map(w => w.name.length)) + 2;
        const maxOriginLength = Math.max(...waifus.map(w => w.origin.length)) + 2;
        const maxGenderLength = 7 + 2; // 'Unknown'.length + 2
        const maxImgLength = Math.max(...waifus.map(w => w.img.length)) + 2;
        const maxNimgLength = Math.max(...waifus.map(w => w.nimg.length)) + 2;
        const headerLengths = [
            maxIIDLength, maxNameLength, maxGenderLength, maxOriginLength, maxImgLength, maxNimgLength,
        ];
        let headerStr = '';
        for (let i = 0; i < headers.length; ++i) {
            headerStr += `${verticalLine}${center(headers[i], headerLengths[i])}`;
        }
        // Header
        writer.write(
            `${connector}${horizontalLine.repeat(maxIIDLength)}${connector}${horizontalLine.repeat(maxNameLength)}` +
            `${connector}${horizontalLine.repeat(maxGenderLength)}` +
            `${connector}${horizontalLine.repeat(maxOriginLength)}${connector}${horizontalLine.repeat(maxImgLength)}` +
            `${connector}${horizontalLine.repeat(maxNimgLength)}${connector}\n` +
            `${headerStr}${verticalLine}\n` +
            `${connector}${horizontalLine.repeat(maxIIDLength)}${connector}${horizontalLine.repeat(maxNameLength)}` +
            `${connector}${horizontalLine.repeat(maxGenderLength)}` +
            `${connector}${horizontalLine.repeat(maxOriginLength)}${connector}${horizontalLine.repeat(maxImgLength)}` +
            `${connector}${horizontalLine.repeat(maxNimgLength)}${connector}\n`,
        );

        // Body
        for (const waifu of waifus) {
            writer.write(
                `${verticalLine} ${waifu.iid.padEnd(maxIIDLength - 1)}` +
                `${verticalLine} ${waifu.name.padEnd(maxNameLength - 1)}` +
                `${verticalLine} ${waifu.gender.padEnd(maxGenderLength - 1)}` +
                `${verticalLine} ${waifu.origin.padEnd(maxOriginLength - 1)}` +
                `${verticalLine} ${waifu.img.padEnd(maxImgLength - 1)}` +
                `${verticalLine} ${waifu.nimg.padEnd(maxNimgLength - 1)}${verticalLine}\n`,
            );
        }

        // Footer
        writer.write(
            `${connector}${horizontalLine.repeat(maxIIDLength)}${connector}${horizontalLine.repeat(maxNameLength)}` +
            `${connector}${horizontalLine.repeat(maxGenderLength)}` +
            `${connector}${horizontalLine.repeat(maxOriginLength)}${connector}${horizontalLine.repeat(maxImgLength)}` +
            `${connector}${horizontalLine.repeat(maxNimgLength)}${connector}\n`,
        );
        writer.end(() => pool.end());
    })();
}
