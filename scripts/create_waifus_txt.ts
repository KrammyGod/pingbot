import 'dotenv/config';
import * as fs from 'fs';
import { Pool, QueryResultRow } from 'pg';

const pool = new Pool({
    host: process.env.PRODHOST // Not included in .env.example, since for personal use only.
});
function query<R extends QueryResultRow = object, I = unknown>(query: string, values?: I[]) {
    return pool.query<R, I[]>(query, values).then(res => res.rows);
}

// Copied necessary stuff from database.ts
type WaifuDetails = {
    name: string;
    gender: 'Female' | 'Male' | 'Unknown';
    origin: string;
    img: string[];
    nimg: string[];
};
class Waifu {
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
        this.name = row.name;
        this.gender = row.gender;
        this.origin = row.origin;
        this.img = `[${row.img.map(i => {
            if (i.startsWith('https://i.imgur')) return i;
            // Just to make it look prettier, include full link
            return `${process.env.CDN_URL}/images/${i}`;
        }).join(', ')}]`;
        this.nimg = `[${row.nimg.map(i => {
            if (i.startsWith('https://i.imgur')) return i;
            // Just to make it look prettier, include full link
            return `${process.env.CDN_URL}/images/${i}`;
        }).join(', ')}]`;
    }
}

const connector = '+';
const horizontalLine = '―';
const verticalLine = '|';
const writer = fs.createWriteStream('./files/waifus.txt');
function center(str: string, size: number) {
    // Not asserted, but assuming size >= str.length
    const len = size - str.length;
    const start = Math.ceil(len / 2);
    const end = len - start;
    return `${' '.repeat(start)}${str}${' '.repeat(end)}`;
}
if (require.main === module) {
    (async () => {
        const waifus = await query<WaifuDetails>('SELECT * FROM waifus ORDER BY iid').then(Waifu.fromRows);
        const headers = ['name', 'gender', 'origin', 'img', 'nimg'];
        const maxNameLength = Math.max(...waifus.map(w => w.name.length)) + 2;
        const maxOriginLength = Math.max(...waifus.map(w => w.origin.length)) + 2;
        const maxGenderLength = 7 + 2; // 'Unknown'.length
        const maxImgLength = Math.max(...waifus.map(w => w.img.length)) + 2;
        const maxNimgLength = Math.max(...waifus.map(w => w.nimg.length)) + 2;
        const headerLengths = [maxNameLength, maxGenderLength, maxOriginLength, maxImgLength, maxNimgLength];
        let headerStr = '';
        for (let i = 0; i < headers.length; ++i) {
            headerStr += `${verticalLine}${center(headers[i], headerLengths[i])}`;
        }
        // Header
        writer.write(
            `${connector}${horizontalLine.repeat(maxNameLength)}${connector}${horizontalLine.repeat(maxGenderLength)}` +
            `${connector}${horizontalLine.repeat(maxOriginLength)}${connector}${horizontalLine.repeat(maxImgLength)}` +
            `${connector}${horizontalLine.repeat(maxNimgLength)}${connector}\n` +
            `${headerStr}${verticalLine}\n` +
            `${connector}${horizontalLine.repeat(maxNameLength)}${connector}${horizontalLine.repeat(maxGenderLength)}` +
            `${connector}${horizontalLine.repeat(maxOriginLength)}${connector}${horizontalLine.repeat(maxImgLength)}` +
            `${connector}${horizontalLine.repeat(maxNimgLength)}${connector}\n`
        );

        // Body
        for (const waifu of waifus) {
            writer.write(
                `${verticalLine} ${waifu.name.padEnd(maxNameLength - 1)}` +
                `${verticalLine} ${waifu.gender.padEnd(maxGenderLength - 1)}` +
                `${verticalLine} ${waifu.origin.padEnd(maxOriginLength - 1)}` +
                `${verticalLine} ${waifu.img.padEnd(maxImgLength - 1)}` +
                `${verticalLine} ${waifu.nimg.padEnd(maxNimgLength - 1)}${verticalLine}\n`
            );
        }

        // Footer
        writer.write(
            `${connector}${horizontalLine.repeat(maxNameLength)}${connector}${horizontalLine.repeat(maxGenderLength)}` +
            `${connector}${horizontalLine.repeat(maxOriginLength)}${connector}${horizontalLine.repeat(maxImgLength)}` +
            `${connector}${horizontalLine.repeat(maxNimgLength)}${connector}\n`
        );
        writer.end(() => pool.end());
    })();
}
