"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const axios_1 = __importDefault(require("axios"));
const _config_1 = __importDefault(require("../classes/config.js"));
const hoyolab_1 = require("./hoyolab");
const pg_1 = require("pg");
const util_1 = require("util");
const client = new pg_1.Client({ connectionTimeoutMillis: 2000 });
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
            compact: false
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
            compact: false
        });
        for (const line of lines.split('\n')) {
            console.log('\x1b[31m%s\x1b[0m%s', `ERR [${LOGGER.today}]: `, line);
        }
    },
    end() {
        console.log('\x1b[95m%s\x1b[0m', `END [${LOGGER.today}]: END ${process.env.name} ON ${new Date().toLocaleTimeString()} UTC\n`);
    }
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
    msg += '\n```' + (0, util_1.inspect)(err) + '```';
    add(msg + '\n\n');
}
const CONFIG = {
    actID: process.env.actID,
    rewardURL: process.env.rewardURL,
    roleURL: process.env.roleURL,
    infoURL: process.env.infoURL,
    signURL: process.env.signURL,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/114.0.0.0 Safari/537.36',
    origin: 'https://act.hoyolab.com'
};
class Sign {
    constructor(cookie, notify, uid) {
        this.cookie = cookie;
        this.notify = notify;
        this.uid = uid;
    }
    get header() {
        return {
            'Accept': 'application/json, text/plain, */*',
            'Accept-Encoding': 'gzip, deflate, br',
            'Connection': 'keep-alive',
            'User-Agent': CONFIG.userAgent,
            'Origin': CONFIG.origin,
            'Referer': `${CONFIG.origin}/`,
            'x-rpc-app_version': '2.34.1',
            'x-rpc-client_type': '4',
            'Cookie': this.cookie
        };
    }
    async getAwards() {
        return axios_1.default.get(CONFIG.rewardURL, { headers: this.header })
            .then(res => res.data.data)
            .catch(err => {
            LOGGER.error('failure in getter awards');
            throw err;
        });
    }
    async getInfo() {
        const res = await axios_1.default.get(CONFIG.infoURL, { headers: this.header })
            .then(res => res.data)
            .catch(err => {
            LOGGER.error('failure in getter info');
            throw err;
        });
        if (res.retcode !== 0) {
            LOGGER.error('failure in getter info - likely invalid cookie');
            throw res;
        }
        return res.data;
    }
    async getRegion() {
        const res = await axios_1.default.get(CONFIG.roleURL, { headers: this.header })
            .then(res => res.data)
            .catch(err => {
            LOGGER.error('failure in getter region');
            throw err;
        });
        if (res.retcode !== 0) {
            LOGGER.error('failure in getter region - likely invalid cookie');
            throw res;
        }
        const characterList = res.data.list[0];
        return [characterList.region_name, characterList.nickname];
    }
    async run() {
        LOGGER.log('Running sign in...');
        if (!this.notify) {
            return (0, axios_1.default)({
                method: 'POST',
                url: CONFIG.signURL,
                headers: this.header,
                data: { 'act_id': CONFIG.actID }
            }).then(res => {
                const risk_code = res.data.data?.gt_result?.risk_code;
                if (risk_code && risk_code !== 0) {
                    // Captcha verification required if risk_code is not 0.
                    LOGGER.error('Captcha verification required.');
                }
                else {
                    LOGGER.log('Sign in complete, did not notify user. This can mean failure or success.');
                }
                return undefined;
            });
        }
        const info = await this.getInfo();
        const rewards = await this.getAwards();
        const [region_name, nickname] = await this.getRegion();
        const total_sign_day = info.is_sign ? info.total_sign_day : info.total_sign_day + 1;
        const result = {
            uid: this.uid,
            error: false,
            region_name,
            nickname,
            award: rewards.awards[info.total_sign_day],
            today: info.today,
            total_sign_day,
            check_in_result: '✅'
        };
        // Skip sign in if any of these are true.
        if (info.is_sign) {
            result.check_in_result = '❎ Already checked in today';
            result.award = rewards.awards[info.total_sign_day - 1];
            return result;
        }
        else if (info.first_bind) {
            result.check_in_result = '> Please check in manually once ❎';
            return result;
        }
        const res = await (0, axios_1.default)({
            method: 'POST',
            url: CONFIG.signURL,
            headers: this.header,
            data: { 'act_id': CONFIG.actID }
        }).then(res => res.data);
        // Checking for last minute failures/anti-bot
        const risk_code = res.data?.gt_result?.risk_code;
        if (res.retcode !== 0) {
            // Usually cookie error or something similar
            LOGGER.error('Error in check-in.');
            on_account_error(res, (0, hoyolab_1.getUID)(this.cookie), this.cookie);
            return { uid: this.uid, error: true };
        }
        else if (risk_code && risk_code !== 0) {
            // Captcha verification required if risk_code is not 0.
            LOGGER.error('Captcha verification required.');
            result.check_in_result = 'Anti-bot detected. Please check-in manually until the captcha is gone ❎';
        }
        return result;
    }
}
async function collect() {
    const accounts = await client.query(`SELECT * FROM hoyolab_cookies_list WHERE ${process.env.type} <> $1`, ['none']).then(res => res.rows);
    const message = {
        accounts: [],
        name: process.env.displayName
    };
    for (const account of accounts) {
        const aid = (0, hoyolab_1.getUID)(account.cookie);
        LOGGER.log(`Checking into account ${aid}`);
        const gameType = process.env.type;
        const sign = new Sign(account.cookie, account[gameType] === 'notify', account.id);
        const result = await sign.run().catch(error => {
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
    return (0, axios_1.default)({
        method: 'POST',
        url: `http://localhost:${_config_1.default.port}`,
        data: message
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
        add('I encountered a really bad error... save me...\n```' + (0, util_1.inspect)(e) + '```');
    }
    finally {
        await client.end().catch(() => { });
        LOGGER.end();
    }
})();
//# sourceMappingURL=collector.js.map