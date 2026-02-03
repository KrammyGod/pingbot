import config from '@config';
import { Client } from 'pg';
import { inspect } from 'util';

// Collector types
import { HoyolabCollector } from './hoyolab';
import { SkportCollector } from './skport';

const client = new Client({ connectionTimeoutMillis: 2000 });

export interface Logger {
    readonly today: string;
    start(): void;
    log(msg?: unknown): void;
    error(msg?: unknown): void;
    end(): void;
};

const LOGGER = {
    today: new Date().toLocaleDateString(),
    start() {
        console.log(
            '\x1b[92m%s\x1b[0m',
            `BGN [${LOGGER.today}]: BEGIN ${process.env.name} ON ${new Date().toLocaleTimeString()} UTC`,
        );
    },
    log(msg?: unknown) {
        if (!msg) return console.log('\x1b[96m%s\x1b[0m', `LOG [${LOGGER.today}]:`);
        const lines = typeof msg === 'string' ? msg : inspect(msg, {
            colors: true,
            depth: null,
            compact: false,
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
            compact: false,
        });
        for (const line of lines.split('\n')) {
            console.log('\x1b[31m%s\x1b[0m%s', `ERR [${LOGGER.today}]: `, line);
        }
    },
    end() {
        console.log(
            '\x1b[95m%s\x1b[0m',
            `END [${LOGGER.today}]: END ${process.env.name} ON ${new Date().toLocaleTimeString()} UTC\n`,
        );
    },
} as Logger;

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

// Custom result to allow parsing once message is sent.
export type CollectResult = {
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
    readonly data: unknown;
};

// The actual full message as a JSON object.
export type SendMessage = {
    readonly accounts: CollectResult[];
    readonly name: string; // Name of the game
    // Split into sections to send per message
    err?: readonly string[];
};

export interface CollectBase {
    getAid(): Promise<string>;
    run(): Promise<CollectResult | undefined>;
}

type CheckinType = 'none' | 'checkin' | 'notify';
type CollectorType = 'honkai' | 'genshin' | 'star_rail' | 'endfield';
type DatabaseAccount = {
    readonly id: string;
    readonly cookie: string;
    readonly genshin: CheckinType;
    readonly honkai: CheckinType;
    readonly star_rail: CheckinType;
    readonly endfield: CheckinType;
};

function getCollector(type: CollectorType, account: DatabaseAccount): CollectBase {
    if (type === 'endfield') {
        return new SkportCollector(account.cookie, account.endfield === 'notify', account.id, LOGGER);
    }
    return new HoyolabCollector(account.cookie, account[type] === 'notify', account.id, LOGGER);
}

async function collect() {
    const accounts = await client.query<DatabaseAccount>(
        `SELECT *
         FROM hoyolab_cookies_list
         WHERE ${process.env.type} <> $1`,
        ['none'],
    ).then(res => res.rows);
    const message: SendMessage = {
        accounts: [],
        name: process.env.displayName!,
    };
    for (const account of accounts) {
        const collector = getCollector(process.env.type as CollectorType, account);
        const aid = await collector.getAid();
        LOGGER.log(`Checking into account ${aid}`);
        const result = await collector.run().catch(error => {
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
        body: JSON.stringify(message),
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
