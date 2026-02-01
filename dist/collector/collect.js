"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const _config_1 = __importDefault(require("../classes/config.js"));
const pg_1 = require("pg");
const util_1 = require("util");
// Collector types
const hoyolab_1 = require("./hoyolab");
const skport_1 = require("./skport");
const client = new pg_1.Client({ connectionTimeoutMillis: 2000 });
;
const LOGGER = {
    today: new Date().toLocaleDateString(),
    start() {
        console.log('\x1b[92m%s\x1b[0m', `BGN [${LOGGER.today}]: BEGIN ${process.env.name} ON ${new Date().toLocaleTimeString()} UTC`);
    },
    log(msg) {
        if (!msg)
            return console.log('\x1b[96m%s\x1b[0m', `LOG [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : (0, util_1.inspect)(msg, {
            colors: true,
            depth: null,
            compact: false,
        });
        for (const line of lines.split('\n')) {
            console.log('\x1b[96m%s\x1b[0m%s', `LOG [${LOGGER.today}]: `, line);
        }
    },
    error(msg) {
        if (!msg)
            return console.log('\x1b[31m%s\x1b[0m', `ERR [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : (0, util_1.inspect)(msg, {
            colors: true,
            depth: null,
            compact: false,
        });
        for (const line of lines.split('\n')) {
            console.log('\x1b[31m%s\x1b[0m%s', `ERR [${LOGGER.today}]: `, line);
        }
    },
    end() {
        console.log('\x1b[95m%s\x1b[0m', `END [${LOGGER.today}]: END ${process.env.name} ON ${new Date().toLocaleTimeString()} UTC\n`);
    },
};
const ret = [''];
function add(msg) {
    if (msg.length >= 2000)
        throw new Error(`Message too big!\n${msg}`);
    // Discord message limitation
    if (ret[ret.length - 1].length + msg.length > 2000) {
        ret.push('');
    }
    ret[ret.length - 1] += msg;
}
function on_account_error(err, aid, uid) {
    let msg = `\nAccount ID: ${aid}`;
    msg += `\nUser ID: ${uid}`;
    LOGGER.error(msg);
    LOGGER.error();
    LOGGER.error(err);
    msg += '\n```\n' + (0, util_1.inspect)(err) + '```';
    add(msg + '\n\n');
}
function getCollector(type, account) {
    if (type === 'endfield') {
        return new skport_1.SkportCollector(account.cookie, account.endfield === 'notify', account.id, LOGGER);
    }
    return new hoyolab_1.HoyolabCollector(account.cookie, account.endfield === 'notify', account.id, LOGGER);
}
async function collect() {
    const accounts = await client.query(`SELECT *
         FROM hoyolab_cookies_list
         WHERE ${process.env.type} <> $1`, ['none']).then(res => res.rows);
    const message = {
        accounts: [],
        name: process.env.displayName,
    };
    for (const account of accounts) {
        const collector = getCollector(process.env.type, account);
        const aid = await collector.getAid();
        LOGGER.log(`Checking into account ${aid}`);
        const result = await collector.run().catch(error => {
            LOGGER.error('Error in sign-in.');
            on_account_error(error, aid, account.id);
            return { uid: account.id, error: true };
        });
        if (result) {
            message.accounts.push(result);
        }
    }
    LOGGER.log('Completed collection!');
    if (ret.length > 1 || ret[0] !== '') {
        message.err = ret;
        LOGGER.error('With errors...');
    }
    // Send message to be received by index.ts
    return fetch(`http://localhost:${_config_1.default.port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message),
    });
}
(async () => {
    try {
        LOGGER.start();
        await client.connect();
        await collect();
    }
    catch (e) {
        LOGGER.error(e);
        add('I encountered a really bad error... save me...\n```\n' + (0, util_1.inspect)(e) + '```');
    }
    finally {
        await client.end().catch(() => { });
        LOGGER.end();
    }
})();
//# sourceMappingURL=collect.js.map