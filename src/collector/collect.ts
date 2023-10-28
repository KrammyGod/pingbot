import config from '@config';
import { getUID } from '@modules/hoyolab';
import { Client } from 'pg';
import { inspect } from 'util';

const client = new Client({ connectionTimeoutMillis: 2000 });

const LOGGER = {
    today: new Date().toLocaleDateString(),
    start() {
        console.log(
            '\x1b[92m%s\x1b[0m',
            `BGN [${LOGGER.today}]: BEGIN ${process.env.name} ON ${new Date().toLocaleTimeString()} UTC`
        );
    },
    log(msg?: unknown) {
        if (!msg) return console.log('\x1b[96m%s\x1b[0m', `LOG [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : inspect(msg, {
            colors: true,
            depth: null,
            compact: false
        });
        for (const line of lines.split('\n')) {
            console.log('\x1b[96m%s\x1b[0m%s', `LOG [${LOGGER.today}]: `, line);
        }
    },
    error(msg?: unknown) {
        if (!msg) return console.log('\x1b[31m%s\x1b[0m', `ERR [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : inspect(msg, {
            colors: true,
            depth: null,
            compact: false
        });
        for (const line of lines.split('\n')) {
            console.log('\x1b[31m%s\x1b[0m%s', `ERR [${LOGGER.today}]: `, line);
        }
    },
    end() {
        console.log(
            '\x1b[95m%s\x1b[0m',
            `END [${LOGGER.today}]: END ${process.env.name} ON ${new Date().toLocaleTimeString()} UTC\n`
        );
    }
};

const ret = [''];
function add(msg: string) {
    if (msg.length >= 2000) throw new Error(`Message too big!\n${msg}`);
    // Discord message limitation
    if (ret[ret.length - 1].length + msg.length > 2000) {
        ret.push('');
    }
    ret[ret.length - 1] += msg;
}
function on_account_error(err: object, aid: string, uid: string) {
    let msg = `\nAccount ID: ${aid}`;
    msg += `\nUser ID: ${uid}`;
    LOGGER.error(msg);
    LOGGER.error();
    LOGGER.error(err);
    msg += '\n```\n' + inspect(err) + '```';
    add(msg + '\n\n');
}

const CONFIG = {
    actID: process.env.actID!,
    rewardURL: process.env.rewardURL!,
    roleURL: process.env.roleURL!,
    infoURL: process.env.infoURL!,
    signURL: process.env.signURL!,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/114.0.0.0 Safari/537.36',
    origin: 'https://act.hoyolab.com'
};
type RewardAPIResponse = {
    readonly retcode: number;
    readonly message: string;
    readonly data: {
        readonly month: number;
        readonly awards: readonly {
            readonly icon: string;
            readonly name: string;
            readonly cnt: string;
        }[]
        readonly resign: boolean;
        readonly now: string; // Epoch format
    };
};
type InfoAPIResponse = {
    readonly retcode: number;
    readonly message: string;
    readonly data: {
        readonly total_sign_day: number;
        readonly today: string;
        readonly is_sign: boolean;
        readonly first_bind: boolean;
        readonly is_sub: boolean;
        readonly region: string;
        readonly month_last_day: boolean;
    } | null;
};
type RoleAPIResponse = {
    readonly retcode: number;
    readonly message: string;
    readonly data: {
        readonly list: readonly [{
            readonly game_biz: string;
            readonly region: string;
            readonly game_uid: string;
            readonly nickname: string;
            readonly level: number;
            readonly is_chosen: boolean;
            readonly region_name: string;
            readonly is_official: boolean;
        }]
    } | null;
};
type SignAPIResponse = {
    readonly retcode: number;
    readonly message: string;
    readonly data: {
        readonly code: string;
        readonly first_bind?: boolean;
        // This was added by Hoyoverse to combat bots signing in.
        // Currently only seems to exist in Genshin Impact.
        readonly gt_result?: {
            readonly risk_code: number;
            readonly gt: string;
            readonly challenge: string;
            readonly success: number;
            readonly is_risk: boolean;
        }
    } | null;
};

// Custom result to allow parsing once message is sent.
type CollectResult = {
    readonly uid: string;
    readonly error: false;
    readonly region_name: string;
    readonly nickname: string;
    award: {
        readonly icon: string;
        readonly name: string;
        readonly cnt: string;
    };
    readonly today: string;
    readonly total_sign_day: number;
    check_in_result: string;
} | {
    readonly uid: string;
    readonly error: true;
};

// The actual full message as a JSON object.
export type SendMessage = {
    readonly accounts: CollectResult[];
    readonly name: string; // Name of the game
    // Split into sections to send per message
    err?: readonly string[];
};

class Sign {
    constructor(private readonly cookie: string, private readonly notify: boolean, private readonly uid: string) {}
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
        return fetch(CONFIG.rewardURL, { headers: this.header })
            .then(res => res.json())
            .then((data: RewardAPIResponse) => data.data)
            .catch(err => {
                LOGGER.error('failure in getter awards');
                throw err;
            });
    }
    async getInfo() {
        const res = await fetch(CONFIG.infoURL, { headers: this.header })
            .then(res => res.json() as Promise<InfoAPIResponse>)
            .catch(err => {
                LOGGER.error('failure in getter info');
                throw err;
            });
        if (res.retcode !== 0) {
            LOGGER.error('failure in getter info - likely invalid cookie');
            throw res;
        }
        return res.data!;
    }
    async getRegion(): Promise<[string, string]> {
        const res = await fetch(CONFIG.roleURL, { headers: this.header })
            .then(res => res.json() as Promise<RoleAPIResponse>)
            .catch(err => {
                LOGGER.error('failure in getter region');
                throw err;
            });
        if (res.retcode !== 0) {
            LOGGER.error('failure in getter region - likely invalid cookie');
            throw res;
        }
        const characterList = res.data!.list[0];
        return [characterList.region_name, characterList.nickname];
    }
    async run(): Promise<CollectResult | undefined> {
        LOGGER.log('Running sign in...');
        if (!this.notify) {
            return fetch(CONFIG.signURL, {
                method: 'POST',
                headers: { ...this.header, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 'act_id': CONFIG.actID })
            }).then(res => res.json()).then((data: SignAPIResponse) => {
                const risk_code = data.data?.gt_result?.risk_code;
                if (risk_code && risk_code !== 0) {
                    // Captcha verification required if risk_code is not 0.
                    LOGGER.error('Captcha verification required.');
                } else {
                    LOGGER.log('Sign in complete, did not notify user. This can mean failure or success.');
                }
                return undefined;
            });
        }

        const info = await this.getInfo();
        const rewards = await this.getAwards();
        const [region_name, nickname] = await this.getRegion();
        const total_sign_day = info.is_sign ? info.total_sign_day : info.total_sign_day + 1;
        const result: CollectResult = {
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
        } else if (info.first_bind) {
            result.check_in_result = '> Please check in manually once ❎';
            return result;
        }

        const res = await fetch(CONFIG.signURL, {
            method: 'POST',
            headers: { ...this.header, 'Content-Type': 'application/json' },
            body: JSON.stringify({ 'act_id': CONFIG.actID })
        }).then(res => res.json() as Promise<SignAPIResponse>);

        // Checking for last minute failures/anti-bot
        const risk_code = res.data?.gt_result?.risk_code;
        if (res.retcode !== 0) {
            // Usually cookie error or something similar
            LOGGER.error('Error in check-in.');
            on_account_error(res, getUID(this.cookie), this.cookie);
            return { uid: this.uid, error: true };
        } else if (risk_code && risk_code !== 0) {
            // Captcha verification required if risk_code is not 0.
            LOGGER.error('Captcha verification required.');
            result.check_in_result = 'Anti-bot detected. Please check-in manually until the captcha is gone ❎';
        }
        return result;
    }
}

type CheckinType = 'none' | 'checkin' | 'notify';
type HoyolabAccount = {
    readonly id: string;
    readonly cookie: string;
    readonly genshin: CheckinType;
    readonly honkai: CheckinType;
    readonly star_rail: CheckinType;
};
async function collect() {
    const accounts = await client.query<HoyolabAccount>(
        `SELECT * FROM hoyolab_cookies_list WHERE ${process.env.type} <> $1`,
        ['none']
    ).then(res => res.rows);
    const message: SendMessage = {
        accounts: [],
        name: process.env.displayName!
    };
    for (const account of accounts) {
        const aid = getUID(account.cookie);
        LOGGER.log(`Checking into account ${aid}`);
        const gameType = process.env.type as 'genshin' | 'honkai' | 'star_rail';
        const sign = new Sign(account.cookie, account[gameType] === 'notify', account.id);
        const result = await sign.run().catch(error => {
            LOGGER.error('Error in sign-in.');
            on_account_error(error, aid, account.id);
            return { uid: account.id, error: true } as CollectResult;
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
    return fetch(`http://localhost:${config.port}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(message)
    });
}

(async () => {
    try {
        LOGGER.start();
        await client.connect();
        await collect();
    } catch (e) {
        LOGGER.error(e);
        add('I encountered a really bad error... save me...\n```\n' + inspect(e) + '```');
    } finally {
        await client.end().catch(() => { });
        LOGGER.end();
    }
})();
