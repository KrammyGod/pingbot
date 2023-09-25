import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { from } from 'pg-copy-streams';
import { inspect } from 'util';
import { Pool, QueryResultRow } from 'pg';

const LOGGER = {
    today: new Date().toLocaleDateString(),
    start() {
        console.log(`START RESET [${LOGGER.today}]: ${new Date().toLocaleTimeString()} UTC`);
    },
    log(msg?: unknown) {
        if (!msg) return console.log(`LOG [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : inspect(msg, {
            colors: true,
            depth: null,
            compact: false
        });
        for (const line of lines.split('\n')) {
            console.log(`LOG [${LOGGER.today}]: ${line}`);
        }
    },
    error(msg?: unknown) {
        if (!msg) return console.log(`ERROR [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : inspect(msg, {
            colors: true,
            depth: null,
            compact: false
        });
        for (const line of lines.split('\n')) {
            console.log(`ERROR [${LOGGER.today}]: ${line}`);
        }
    },
    end() {
        console.log(`END [${LOGGER.today}]: ${new Date().toLocaleTimeString()} UTC\n\n`);
    }
};

const pool = new Pool({
    connectionTimeoutMillis: 2000
});
async function query<R extends QueryResultRow = object, I = unknown>(query: string, values?: I[]) {
    const client = await pool.connect();
    let res: R[] = [];
    try {
        res = await client.query<R, I[]>(query, values).then(res => res.rows);
    } finally {
        client.release();
    }
    return res;
}

export default async function reset() {
    await query(
        'UPDATE user_info SET collected = $1',
        [false]
    );
    await query(
        'UPDATE user_info SET whales = $1',
        [false]
    );
    LOGGER.log('Set collected and whales to false!');
}

// -1 is returned when the id is invalid
type CommonData = {
    id: number;
    anime_id: number;
    anime_image: string;
    character_image: string;
    origin: string;
    gender: string;
    name: string;
    desc: string;
} | -1 | string;

async function copy() {
    const API_URL = 'https://www.animecharactersdatabase.com/api_series_characters.php';
    const _USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36 Edg/91.0.864.59';
    const HEADERS = { 'User-Agent': _USER_AGENT };
    let i = await query<{ id: number }>('SELECT MAX(iid) AS id FROM commons').then(r => ++r[0].id);
    let chars = 0;
    let s = '';
    LOGGER.log(`Retrieving from id ${i}`);
    // Add constant to prevent true infinite loop
    while (chars <= 100_000_000) {
        let res: CommonData | void = await fetch(`${API_URL}?character_id=${i}`, { headers: HEADERS })
            .then(res => res.json())
            .catch(() => { });
        // Rate limits/maintenance.
        if (!res) continue;
        // Bad unicode
        if (typeof res === 'string') {
            const bad: string = res;
            try {
                res = JSON.parse(bad.replaceAll('	', '').replaceAll('\\', '\\\\')) as Exclude<CommonData, string>;
            } catch (e) {
                throw new Error(`Bad response at ${i}\n${e}`);
            }
        }
        if (res === -1) break;
        if (!res.name || !res.origin || !res.gender || !res.character_image) {
            throw new Error(`Bad response at ${i}\n${inspect(res)}`);
        }
        if (res.gender !== 'Female' && res.gender !== 'Male') res.gender = 'Unknown';
        LOGGER.log(`Added common: id: ${i} name: ${res.name}`);
        s += `${i}\t${res.name}\t${res.gender}\t${res.origin}\t${res.character_image.replace(' ', '_')}\n`;
        ++i;
        ++chars;
        // Do a call within rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    const dumpFile = path.resolve(__dirname, '../../files/update.dump');
    fs.writeFile(dumpFile, s, () => { });
    LOGGER.log(`Retrieved up to id ${i}`);

    LOGGER.log('Starting file dump...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const stream = client.query(from('COPY commons (iid, name, gender, origin, img) FROM STDIN'));
        const fileStream = fs.createReadStream(dumpFile);
        stream.on('finish', () => {
            LOGGER.log('Finished dump!');
        });
        fileStream.pipe(stream);
        await client.query('COMMIT');
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
        await fs.promises.unlink(dumpFile).catch(() => { });
    }
    return chars;
}

if (require.main === module) {
    (async () => {
        LOGGER.start();
        await reset();
        const result = await copy().catch(ret => {
            LOGGER.error(ret);
        });
        if (result) {
            LOGGER.log(`Added ${result} commons.`);
        }
        LOGGER.log('Done!');
        LOGGER.end();
        await pool.end();
    })();
}
