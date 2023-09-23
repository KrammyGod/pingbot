"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pg_1 = require("pg");
const pg_copy_streams_1 = require("pg-copy-streams");
const LOGGER = {
    today: new Date().toLocaleDateString(),
    start: () => {
        console.log(`START RESET [${LOGGER.today}]: ${new Date().toLocaleTimeString()} UTC`);
    },
    log: (msg) => {
        for (const line of msg.split('\n')) {
            console.log(`LOG [${LOGGER.today}]: ${line}`);
        }
    },
    error: (msg) => {
        for (const line of msg.split('\n')) {
            console.log(`ERROR [${LOGGER.today}]: ${line}`);
        }
    },
    end: () => {
        console.log(`END [${LOGGER.today}]: ${new Date().toLocaleTimeString()} UTC\n\n`);
    }
};
const pool = new pg_1.Pool({
    connectionTimeoutMillis: 2000
});
async function query(query, values) {
    const client = await pool.connect();
    let res = [];
    try {
        res = await client.query(query, values).then(res => res.rows);
    }
    finally {
        client.release();
    }
    return res;
}
async function reset() {
    await query('UPDATE user_info SET collected = $1', [false]);
    await query('UPDATE user_info SET whales = $1', [false]);
    LOGGER.log('Set collected and whales to false!');
}
exports.default = reset;
async function copy() {
    const API_URL = 'https://www.animecharactersdatabase.com/api_series_characters.php';
    // eslint-disable-next-line max-len
    const _USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36 Edg/91.0.864.59';
    const HEADERS = { 'User-Agent': _USER_AGENT };
    let i = await query('SELECT MAX(iid) AS id FROM commons').then(r => ++r[0].id);
    let chars = 0;
    let s = '';
    LOGGER.log(`Retrieving from id ${i}`);
    // Add constant to prevent true infinite loop
    while (chars <= 100000000) {
        let res = await fetch(`${API_URL}?character_id=${i}`, { headers: HEADERS })
            .then(res => res.json())
            .catch(() => { });
        // Rate limits/maintenance.
        if (!res)
            continue;
        // Bad unicode
        if (typeof res === 'string') {
            const bad = res;
            try {
                res = JSON.parse(bad.replaceAll('	', '').replaceAll('\\', '\\\\'));
            }
            catch (e) {
                throw `Bad response at ${i}\n${e}`;
            }
        }
        if (res === -1)
            break;
        if (!res.name || !res.origin || !res.gender || !res.character_image) {
            throw `Bad response at ${i}\n${res}`;
        }
        if (res.gender !== 'Female' && res.gender !== 'Male')
            res.gender = 'Unknown';
        LOGGER.log(`Added common: id: ${i} name: ${res.name}`);
        s += `${i}\t${res.name}\t${res.gender}\t${res.origin}\t${res.character_image.replace(' ', '_')}\n`;
        ++i;
        ++chars;
        // Do a call within rate limits
        await new Promise(resolve => setTimeout(resolve, 200));
    }
    const dumpFile = path_1.default.resolve(__dirname, '../../files/update.dump');
    fs_1.default.writeFile(dumpFile, s, () => { });
    LOGGER.log(`Retrieved up to id ${i}`);
    LOGGER.log('Starting file dump...');
    const client = await pool.connect();
    try {
        await client.query('BEGIN');
        const stream = client.query((0, pg_copy_streams_1.from)('COPY commons (id, name, gender, origin, img) FROM STDIN'));
        const fileStream = fs_1.default.createReadStream(dumpFile);
        stream.on('finish', () => {
            fs_1.default.unlinkSync(dumpFile);
            LOGGER.log('Finished dump!');
        });
        fileStream.pipe(stream);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err.stack;
    }
    finally {
        client.release();
    }
    return chars;
}
if (require.main === module) {
    (async () => {
        LOGGER.start();
        await reset();
        const result = await copy().catch(ret => ret);
        if (typeof result === 'number') {
            LOGGER.log(`Added ${result} commons.`);
        }
        else {
            LOGGER.log(`Exited with error: ${result}`);
        }
        LOGGER.log('Done!');
        LOGGER.end();
        await pool.end();
    })();
}
//# sourceMappingURL=reset_db.js.map