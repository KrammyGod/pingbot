"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
require("dotenv/config");
const fs_1 = __importDefault(require("fs"));
const path_1 = __importDefault(require("path"));
const pg_copy_streams_1 = require("pg-copy-streams");
const util_1 = require("util");
const pg_1 = require("pg");
const LOGGER = {
    today: new Date().toLocaleDateString(),
    start() {
        console.log(`START RESET [${LOGGER.today}]: ${new Date().toLocaleTimeString()} UTC`);
    },
    log(msg) {
        if (!msg)
            return console.log(`LOG [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : (0, util_1.inspect)(msg, {
            colors: true,
            depth: null,
            compact: false
        });
        for (const line of lines.split('\n')) {
            console.log(`LOG [${LOGGER.today}]: ${line}`);
        }
    },
    error(msg) {
        if (!msg)
            return console.log(`ERROR [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : (0, util_1.inspect)(msg, {
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
    const _USER_AGENT = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 ' +
        '(KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36 Edg/91.0.864.59';
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
                throw new Error(`Bad response at ${i}\n${e}`);
            }
        }
        if (res === -1)
            break;
        if (!res.name || !res.origin || !res.gender || !res.character_image) {
            throw new Error(`Bad response at ${i}\n${(0, util_1.inspect)(res)}`);
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
        const stream = client.query((0, pg_copy_streams_1.from)('COPY commons (iid, name, gender, origin, img) FROM STDIN'));
        const fileStream = fs_1.default.createReadStream(dumpFile);
        stream.on('finish', () => {
            LOGGER.log('Finished dump!');
        });
        fileStream.pipe(stream);
        await client.query('COMMIT');
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
        await fs_1.default.promises.unlink(dumpFile).catch(() => { });
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
//# sourceMappingURL=reset_db.js.map