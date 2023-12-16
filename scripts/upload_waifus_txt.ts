/**
 * This script is more computationally intensive in exchange for being less
 * intensive on the database (don't have to copy all waifus)
 */
import 'dotenv/config';
import * as fs from 'fs';
import * as rl from 'readline/promises';
import { Pool, PoolClient, QueryResultRow } from 'pg';

// The shared file path between upload_waius_txt.ts and download_waifus_txt.ts
const filePath = './files/waifus.txt';
const CDN_URL = 'https://d1irvsiobt1r8d.cloudfront.net';
// Change this to change input
const imgReplacer = (i: string) => {
    // reverse of download_waifus_txt.ts
    // We want to keep IDs of images to upload to database
    if (i.startsWith(CDN_URL)) {
        return i.replace(`${CDN_URL}/images/`, '');
    }
    return i;
};

// Copied necessary stuff from database.ts
type WaifuDetails = {
    wid: string;
    iid: string;
    name: string;
    gender: 'Female' | 'Male' | 'Unknown';
    origin: string;
    img: string[];
    nimg: string[];
};
class Waifu {
    wid: string;
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
        this.wid = row.wid;
        this.iid = row.iid;
        this.name = row.name;
        this.gender = row.gender;
        this.origin = row.origin;
        this.img = row.img.map(imgReplacer);
        this.nimg = row.nimg.map(imgReplacer);
    }

    equal(other: Waifu) {
        return this.name === other.name && this.gender === other.gender &&
            this.origin === other.origin && this.img.join() === other.img.join() &&
            this.nimg.join() === other.nimg.join();
    }
}

const pool = new Pool({
    host: process.env.PRODHOST // Not included in .env.example, since for personal use only.
});
function getClient() {
    return pool.connect().then(client => {
        return client.query('BEGIN').then(() => client);
    });
}
function releaseClient(client: PoolClient, revert: boolean) {
    const releaseClient = () => client.release();
    if (revert) {
        return client.query('ROLLBACK').then(releaseClient, releaseClient);
    }
    return client.query('COMMIT').then(releaseClient, releaseClient);
}
function query<R extends QueryResultRow = QueryResultRow, I = unknown>(
    client: PoolClient,
    query: string,
    values?: I[]
) {
    return client.query<R, I[]>(query, values).then(res => res.rows);
}

function loadFromFile() {
    // Header takes up 3 lines, footer takes up 1 line.
    const toParse = fs.readFileSync(filePath, 'utf8').split('\n').slice(3, -2);
    const backupWaifus: Waifu[] = [];
    for (const line of toParse) {
        // Remove first and last connector
        const [iid, name, _gender, origin, _img, _nimg] = line.split('|').map(x => x.trim()).slice(1, -1);
        const img = _img.replace('[', '').replace(']', '').split(', ').filter(i => i !== '');
        const nimg = _nimg.replace('[', '').replace(']', '').split(', ').filter(i => i !== '');
        const gender = _gender === 'Female' ? _gender : (_gender === 'Male' ? _gender : 'Unknown');
        backupWaifus.push(new Waifu({ wid: '', iid, name, gender, origin, img, nimg }));
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

function imgDiff(rows: QueryResultRow[], img_type: string) {
    return `\x1b[96m${rows.map(row => row.uid).join(', ')} ${img_type}.\x1b[0m\n`;
}

async function upload() {
    const client = await getClient();

    const database_waifus = await query(client, `
        SELECT * FROM
            waifus
            NATURAL JOIN
            char_mapping
        WHERE fc = TRUE ORDER BY waifus.iid
    `).then(Waifu.fromRows);
    const file_waifus = loadFromFile();
    const modified: { old: Waifu, updated: Waifu }[] = [];
    for (const waifu of database_waifus) {
        const match = file_waifus.find(w => w.iid === waifu.iid);
        if (match && !waifu.equal(match)) {
            modified.push({ old: waifu, updated: match });
        }
    }
    console.log(`Modifying ${modified.length} waifus...`);
    for (const { old, updated } of modified) {
        console.log(findDiff(old, updated));
        await query(client, `
            UPDATE waifus SET name = $1, gender = $2, origin = $3, img = $4, nimg = $5
            WHERE iid = $6
        `, [
            updated.name, updated.gender, updated.origin,
            updated.img, updated.nimg, old.iid
        ]);
        // Deleting imgs
        if (old.img.length > updated.img.length) {
            const res = await query(
                client,
                'UPDATE user_chars SET _img = $1 WHERE _img > $1 AND wid = $2 RETURNING *',
                [updated.img.length, old.wid]
            );
            if (res.length) {
                console.log(imgDiff(res, 'normal image changed'));
            }
        }
        // Deleting nimgs
        if (old.nimg.length > updated.nimg.length) {
            const res = await query(
                client,
                'UPDATE user_chars SET _nimg = $1 WHERE _nimg > $1 AND wid = $2 RETURNING *',
                [updated.nimg.length, old.wid]
            );
            if (res.length) {
                console.log(imgDiff(res, 'lewd image changed'));
            }
        } else if (old.nimg.length !== 0 && updated.nimg.length === 0) {
            // All nimg deleted, remove nsfw from everyone
            const res = await query(
                client,
                `UPDATE user_chars
                SET _nimg = 1, nsfw = FALSE
                WHERE wid = $1 AND
                (nsfw OR _nimg > 1) RETURNING *`,
                [old.wid]
            );
            if (res.length) {
                console.log(imgDiff(res, 'lewd image reset'));
            }
        }
    }
    await query(client, 'REFRESH MATERIALIZED VIEW chars');

    const confirm = rl.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const confirmed = await confirm.question('Confirm upload? (y/n) ').then(ans => ans === 'y', () => false);
    confirm.close();
    if (!confirmed) {
        console.log('Cancelled. Exiting...');
    } else {
        console.log('Confirmed, uploading...\n');
    }

    await releaseClient(client, !confirmed);
    return pool.end().then(() => confirmed);
}

if (require.main === module) {
    upload();
}
