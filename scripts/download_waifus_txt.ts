import 'dotenv/config';
import * as fs from 'fs';
import { Pool, QueryResultRow } from 'pg';

// The shared file path between upload_waius_txt.ts and download_waifus_txt.ts
const filePath = './files/waifus.txt';
const imgReplacer = (i: string) => {
    if (i.startsWith('https://i.imgur')) return i;
    // Just to make it look prettier, include full link
    // Change this to change output
    return `${process.env.CDN_URL}/images/${i}`;
};

const pool = new Pool({
    host: process.env.PRODHOST // Not included in .env.example, since for personal use only.
});
function query<R extends QueryResultRow = QueryResultRow, I = unknown>(query: string, values?: I[]) {
    return pool.query<R, I[]>(query, values).then(res => res.rows);
}

// Copied necessary stuff from database.ts
type WaifuDetails = {
    iid: string;
    name: string;
    gender: 'Female' | 'Male' | 'Unknown';
    origin: string;
    img: string[];
    nimg: string[];
};
class Waifu {
    iid: string;
    name: string;
    gender: 'Female' | 'Male' | 'Unknown';
    origin: string;
    img: string;
    nimg: string;

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
        this.img = `[${row.img.map(imgReplacer).join(', ')}]`;
        this.nimg = `[${row.nimg.map(imgReplacer).join(', ')}]`;
    }
}

const connector = '+';
const horizontalLine = '―';
const verticalLine = '|';
const writer = fs.createWriteStream(filePath);
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
        const headers = ['iid', 'name', 'gender', 'origin', 'img', 'nimg'];
        const maxIIDLength = Math.max(...waifus.map(w => w.iid.length)) + 2;
        const maxNameLength = Math.max(...waifus.map(w => w.name.length)) + 2;
        const maxOriginLength = Math.max(...waifus.map(w => w.origin.length)) + 2;
        const maxGenderLength = 7 + 2; // 'Unknown'.length + 2
        const maxImgLength = Math.max(...waifus.map(w => w.img.length)) + 2;
        const maxNimgLength = Math.max(...waifus.map(w => w.nimg.length)) + 2;
        const headerLengths = [
            maxIIDLength, maxNameLength, maxGenderLength, maxOriginLength, maxImgLength, maxNimgLength
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
            `${connector}${horizontalLine.repeat(maxNimgLength)}${connector}\n`
        );

        // Body
        for (const waifu of waifus) {
            writer.write(
                `${verticalLine} ${waifu.iid.padEnd(maxIIDLength - 1)}` +
                `${verticalLine} ${waifu.name.padEnd(maxNameLength - 1)}` +
                `${verticalLine} ${waifu.gender.padEnd(maxGenderLength - 1)}` +
                `${verticalLine} ${waifu.origin.padEnd(maxOriginLength - 1)}` +
                `${verticalLine} ${waifu.img.padEnd(maxImgLength - 1)}` +
                `${verticalLine} ${waifu.nimg.padEnd(maxNimgLength - 1)}${verticalLine}\n`
            );
        }

        // Footer
        writer.write(
            `${connector}${horizontalLine.repeat(maxIIDLength)}${connector}${horizontalLine.repeat(maxNameLength)}` +
            `${connector}${horizontalLine.repeat(maxGenderLength)}` +
            `${connector}${horizontalLine.repeat(maxOriginLength)}${connector}${horizontalLine.repeat(maxImgLength)}` +
            `${connector}${horizontalLine.repeat(maxNimgLength)}${connector}\n`
        );
        writer.end(() => pool.end());
    })();
}
