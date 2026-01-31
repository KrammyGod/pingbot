import { parse } from 'cookie';

import type { CollectBase, CollectResult, Logger } from './collect';

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
        readonly list: readonly [
            {
                readonly game_biz: string;
                readonly region: string;
                readonly game_uid: string;
                readonly nickname: string;
                readonly level: number;
                readonly is_chosen: boolean;
                readonly region_name: string;
                readonly is_official: boolean;
            },
        ]
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

const CONFIG = {
    actID: process.env.actID!,
    rewardURL: process.env.rewardURL!,
    roleURL: process.env.roleURL!,
    infoURL: process.env.infoURL!,
    signURL: process.env.signURL!,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/114.0.0.0 Safari/537.36',
    origin: 'https://act.hoyolab.com',
};

export class HoyolabCollector implements CollectBase {
    constructor(
        private readonly cookie: string,
        private readonly notify: boolean,
        private readonly uid: string,
        private readonly LOGGER: Logger,
    ) {}

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
            'Cookie': this.cookie,
        };
    }

    async getAid() {
        const cookieObj = parse(this.cookie);
        return cookieObj?.account_id
            ?? cookieObj?.ltuid
            ?? cookieObj?.account_id_v2
            ?? cookieObj?.ltuid_v2
            ?? '';
    }

    async getAwards() {
        return fetch(CONFIG.rewardURL, { headers: this.header })
            .then(res => res.json())
            .then((data: RewardAPIResponse) => data.data)
            .catch(err => {
                this.LOGGER.error('failure in getter awards');
                throw err;
            });
    }

    async getInfo() {
        const res = await fetch(CONFIG.infoURL, { headers: this.header })
            .then(res => res.json() as Promise<InfoAPIResponse>)
            .catch(err => {
                this.LOGGER.error('failure in getter info');
                throw err;
            });
        if (res.retcode !== 0) {
            this.LOGGER.error('failure in getter info - likely invalid cookie');
            throw res;
        }
        return res.data!;
    }

    async getRegion(): Promise<[string, string]> {
        const res = await fetch(CONFIG.roleURL, { headers: this.header })
            .then(res => res.json() as Promise<RoleAPIResponse>)
            .catch(err => {
                this.LOGGER.error('failure in getter region');
                throw err;
            });
        if (res.retcode !== 0) {
            this.LOGGER.error('failure in getter region - likely invalid cookie');
            throw res;
        }
        const characterList = res.data!.list[0];
        return [characterList.region_name, characterList.nickname];
    }

    async run(): Promise<CollectResult | undefined> {
        this.LOGGER.log('Running sign in...');
        if (!this.notify) {
            return fetch(CONFIG.signURL, {
                method: 'POST',
                headers: { ...this.header, 'Content-Type': 'application/json' },
                body: JSON.stringify({ 'act_id': CONFIG.actID }),
            }).then(res => res.json()).then((data: SignAPIResponse) => {
                const risk_code = data.data?.gt_result?.risk_code;
                if (risk_code && risk_code !== 0) {
                    // Captcha verification required if risk_code is not 0.
                    this.LOGGER.error('Captcha verification required.');
                } else {
                    this.LOGGER.log('Sign in complete, did not notify user. This can mean failure or success.');
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
            check_in_result: '✅',
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
            body: JSON.stringify({ 'act_id': CONFIG.actID }),
        }).then(res => res.json() as Promise<SignAPIResponse>);

        // Checking for last minute failures/anti-bot
        const risk_code = res.data?.gt_result?.risk_code;
        if (res.retcode !== 0) {
            // Usually cookie error or something similar
            this.LOGGER.error('Error in check-in.');
            return { uid: this.uid, error: true, data: res };
        } else if (risk_code && risk_code !== 0) {
            // Captcha verification required if risk_code is not 0.
            this.LOGGER.error('Captcha verification required.');
            result.check_in_result = 'Anti-bot detected. Please check-in manually until the captcha is gone ❎';
        }
        return result;
    }
}
