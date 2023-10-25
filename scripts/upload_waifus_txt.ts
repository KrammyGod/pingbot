/**
 * This script is more computationally intensive in exchange for being less
 * intensive on the database (don't have to copy all waifus)
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as rl from 'readline';
import { Pool, QueryResultRow } from 'pg';

// The shared file path between upload_waius_txt.ts and download_waifus_txt.ts
const filePath = './files/waifus.txt';

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
    img: string[];
    nimg: string[];

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
        this.img = row.img.map(i => {
            // reverse of download_waifus_txt.ts
            // We want to keep IDs of images to upload to database
            if (i.startsWith(process.env.CDN_URL!)) {
                return i.replace(`${process.env.CDN_URL}/images/`, '');
            }
            return i;
        });
        this.nimg = row.nimg.map(i => {
            // reverse of download_waifus_txt.ts
            // We want to keep IDs of images to upload to database
            if (i.startsWith(process.env.CDN_URL!)) {
                return i.replace(`${process.env.CDN_URL}/images/`, '');
            }
            return i;
        });
    }

    equal(other: Waifu) {
        return this.name === other.name && this.gender === other.gender &&
            this.origin === other.origin && this.img.join() === other.img.join() &&
            this.nimg.join() === other.nimg.join();
    }
}

// Not const because we upload to test database first, and then confirm for production
let pool = new Pool();
function query<R extends QueryResultRow = QueryResultRow, I = unknown>(query: string, values?: I[]) {
    return pool.query<R, I[]>(query, values).then(res => res.rows);
}

function loadFromFile() {
    // Header takes up 3 lines, footer takes up 1 line.
    const toParse = fs.readFileSync(filePath, 'utf8').split('\n').slice(3, -2);
    const backupWaifus: Waifu[] = [];
    for (const line of toParse) {
        // Remove first and last connector
        const [iid, name, _gender, origin, _img, _nimg] = line.split('|').map(x => x.trim()).slice(1, -1);
        const img = _img.replace('[', '').replace(']', '').split(', ');
        const nimg = _nimg.replace('[', '').replace(']', '').split(', ');
        const gender = _gender === 'Female' ? _gender : (_gender === 'Male' ? _gender : 'Unknown');
        backupWaifus.push(new Waifu({ iid, name, gender, origin, img, nimg }));
    }
    return backupWaifus;
}

function findDiff(old: Waifu, updated: Waifu) {
    let diff = `\x1b[96mID: ${old.iid}\x1b[0m\n`;
    if (old.name !== updated.name) {
        diff += `\x1b[96mName:\x1b[0m \x1b[31m${old.name}\x1b[0m -> \x1b[92m${updated.name}\x1b[0m\n`;
    } else {
        diff += `\x1b[96mOld name: ${old.name}\x1b[0m\n`;
    }
    if (old.gender !== updated.gender) {
        diff += `\x1b[96mGender:\x1b[0m \x1b[31m${old.gender}\x1b[0m -> \x1b[92m${updated.gender}\x1b[0m\n`;
    }
    if (old.origin !== updated.origin) {
        diff += `\x1b[96mOrigin\x1b[0m: \x1b[31m${old.origin}\x1b[0m -> \x1b[92m${updated.origin}\x1b[0m\n`;
    }
    if (old.img.join() !== updated.img.join()) {
        diff += `\x1b[96mNormal Images:\x1b[0m \x1b[31m[${old.img.join(', ')}] (${old.img.length})\x1b[0m -> ` +
            `\x1b[92m[${updated.img.join(', ')}] (${updated.img.length})\x1b[0m\n`;
    }
    if (old.nimg.join() !== updated.nimg.join()) {
        diff += `\x1b[96mLewd Images:\x1b[0m \x1b[31m[${old.nimg.join(', ')}] (${old.nimg.length})\x1b[0m -> ` +
            `\x1b[92m[${updated.nimg.join(', ')}] (${updated.nimg.length})\x1b[0m\n`;
    }
    return diff;
}

async function upload() {
    const database_waifus = await query('SELECT * FROM waifus ORDER BY iid').then(Waifu.fromRows);
    const file_waifus = loadFromFile();
    const modified: { old: Waifu, updated: Waifu }[] = [];
    for (const waifu of database_waifus) {
        const match = file_waifus.find(w => w.iid === waifu.iid);
        if (match && !waifu.equal(match)) {
            modified.push({ old: waifu, updated: match });
        }
    }
    console.log(`Modifying ${modified.length} waifus...`);
    for (const modify of modified) {
        console.log(findDiff(modify.old, modify.updated));
        await query(`
            UPDATE waifus SET name = $1, gender = $2, origin = $3, img = $4, nimg = $5
            WHERE iid = $6
        `, [
            modify.updated.name, modify.updated.gender, modify.updated.origin,
            modify.updated.img, modify.updated.nimg, modify.old.iid
        ]);
    }
    return query('REFRESH MATERIALIZED VIEW chars');
}

if (require.main === module) {
    upload().then(() => {
        const confirm = rl.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        // This is why you use promises, kids.
        confirm.question('Confirm upload to production database? (y/n) ', ans => {
            confirm.close();
            if (ans === 'y') {
                console.log('Confirmed, uploading...');
                pool.end().then(() => {
                    pool = new Pool({
                        host: process.env.PRODHOST // Not included in .env.example, since for personal use only.
                    });
                    upload().then(() => {
                        pool.end();
                    });
                });
            } else {
                console.log('Cancelled. Exiting...');
                pool.end();
            }
        });
    });
}