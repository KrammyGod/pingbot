import crypto from 'crypto';
import { parse } from 'cookie';

import type { CollectBase, CollectResult, Logger } from './collect';

type AwardCalendar = {
    readonly awardId: string; // ID is linked to resourceInfoMap
    readonly available: boolean;
    readonly done: boolean;
};

type AwardResource = {
    readonly id: string; // ID is linked to awardId
    readonly count: number;
    readonly name: string;
    readonly icon: string;
};

type RefreshAPIResponse = {
    readonly code: number;
    readonly message: string;
    readonly timestamp: string;
    readonly data: {
        readonly token: string;
    };
};

type RewardAPIResponse = {
    readonly code: number;
    readonly message: string;
    readonly timestamp: string;
    readonly data: {
        readonly currentTs: string;
        readonly calendar: readonly AwardCalendar[];
        readonly resourceInfoMap: {
            readonly [key: string]: AwardResource;
        };
        readonly hasToday: boolean;
    };
};
type RoleAPIResponse = {
    readonly code: number;
    readonly message: string;
    readonly timestamp: string;
    readonly data: {
        readonly list: readonly {
            readonly appCode: string;
            readonly appName: string;
            readonly bindingList: readonly {
                readonly uid: string; // Skport ID
                readonly defaultRole: {
                    readonly roleId: string; // In game UID
                    readonly nickname: string;
                    readonly serverName: string;
                };
            }[];
        }[];
    } | null;
};
type SignAPIResponse = {
    readonly code: number;
    readonly message: string;
    readonly timestamp: string;
    readonly data: {
        readonly ts: string;
        readonly awardIds: readonly {
            readonly id: string;
            readonly type: number;
        }[];
        // This doesn't contain EVERYTHING, but only what's required
        readonly resourceInfoMap: {
            readonly [key: string]: AwardResource;
        };
        // Not used by us, but useful to know
        readonly tomorrowAwardIds: readonly {
            readonly id: string;
            readonly type: number;
        }[];
    } | null;
};

const CONFIG = {
    rewardURL: process.env.rewardURL!,
    roleURL: process.env.roleURL!,
    signURL: process.env.signURL!,
    refreshURL: process.env.refreshURL!,
    platform: process.env.platform!,
    vName: process.env.vName!,
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/114.0.0.0 Safari/537.36',
};

export class SkportCollector implements CollectBase {
    private readonly extraHeaders: Record<string, string> = {};
    private token: string = '';
    constructor(
        private readonly cookie: string,
        private readonly notify: boolean,
        private readonly uid: string,
        private readonly LOGGER: Logger,
    ) {
        // Extract the required values from our custom made cookie.
        const vals = parse(this.cookie ?? '');
        // The actual credential for signing in.
        this.extraHeaders.cred = vals.cred as string;
        // The user's private game ID
        this.extraHeaders['Sk-Game-Role'] = vals['sk-game-role'] as string;
    }

    /**
     * Credits to this comment for finding how to sign:
     * https://gist.github.com/cptmacp/1e9a9f20f69c113a0828fea8d13cb34c?permalink_comment_id=5967252#gistcomment-5967252
     */
    generateSign(
        path: string,
        body: string,
        timestamp: string,
        token: string,
    ) {
        let str = path + body + timestamp;
        // eslint-disable-next-line @stylistic/js/max-len
        const headerJson = `{"platform":"${CONFIG.platform}","timestamp":"${timestamp}","dId":"","vName":"${CONFIG.vName}"}`;
        str += headerJson;

        // Sign using the token obtained from refresh
        const hmacBytes = crypto.createHmac('sha256', token).update(str).digest();

        // MD5 the SHA256 HMAC result
        const md5Bytes = crypto.createHash('md5').update(hmacBytes.toString('hex')).digest();
        return md5Bytes.toString('hex');
    }

    /**
     * Base headers required for every request.
     * Refresh token must use only these headers to avoid infinite recursion.
     */
    get baseHeaders() {
        return {
            'Accept': 'application/json, text/plain, */*',
            'Connection': 'keep-alive',
            'User-Agent': CONFIG.userAgent,
            'platform': CONFIG.platform,
            'vName': CONFIG.vName,
            'Origin': 'https://game.skport.com',
            'Referer': 'https://game.skport.com/',
            ...this.extraHeaders,
        };
    }

    /**
     * Get headers for every request other than refresh tokens.
     * This signs the request using the request token retrieved at the time of signing.
     */
    async getHeaders(path: string, body: string) {
        await this.refreshToken();
        const timestamp = Math.floor(Date.now() / 1000).toString();
        const sign = this.generateSign(path, body, timestamp, this.token);
        return {
            'sign': sign,
            'timestamp': timestamp,
            ...this.baseHeaders,
            ...this.extraHeaders,
        };
    }

    async getAid() {
        return this.getInfo().then(info => info.uid);
    }

    findLastDoneAward(awards: readonly AwardCalendar[]) {
        for (let i = awards.length - 1; i >= 0; i--) {
            if (awards[i].done) {
                return awards[i];
            }
        }
        // This should never happen, because if none of the awards are done
        // then the first award is available, and we shouldn't call this function
        // under that scenario.
        return awards[0];
    }

    convertAward(award: AwardCalendar, resourceMap: { [key: string]: AwardResource }) {
        const resource = resourceMap[award.awardId];
        return {
            icon: resource.icon,
            name: resource.name,
            cnt: resource.count.toString(),
        };
    }

    async refreshToken() {
        return fetch(CONFIG.refreshURL, { headers: this.baseHeaders })
            .then(res => res.json())
            .then((data: RefreshAPIResponse) => {
                this.token = data.data?.token;
            })
            .catch(err => {
                this.LOGGER.error('failure in token refresh');
                throw err;
            });
    }

    async getAwards() {
        const path = URL.parse(CONFIG.rewardURL)?.pathname ?? '/';
        const headers = await this.getHeaders(path, '');
        return fetch(CONFIG.rewardURL, { headers })
            .then(res => res.json())
            .then((data: RewardAPIResponse) => {
                if (data.code !== 0) {
                    this.LOGGER.error('failure in getter awards - likely invalid cookie');
                    throw data;
                }
                return data.data;
            })
            .catch(err => {
                this.LOGGER.error('failure in getter awards');
                throw err;
            });
    }

    async getInfo(): Promise<{uid: string, serverName: string, nickname: string}> {
        const path = URL.parse(CONFIG.roleURL)?.pathname ?? '/';
        const headers = await this.getHeaders(path, '');
        const res = await fetch(CONFIG.roleURL, { headers })
            .then(res => res.json() as Promise<RoleAPIResponse>)
            .catch(err => {
                this.LOGGER.error('failure in get role response');
                throw err;
            });
        if (res.code !== 0) {
            this.LOGGER.error('failure in get role response - likely invalid cookie');
            throw res;
        }
        // We hardcoded endfield. To support different types of accounts, we will have to pass in the app code.
        const endfieldApp = res.data!.list.find(app => app.appCode === 'endfield');
        if (!endfieldApp) {
            this.LOGGER.error('endfield not bound to account');
            throw new Error('endfield not bound to account');
        }
        const characterList = endfieldApp.bindingList;
        if (characterList.length === 0) {
            this.LOGGER.error('no characters bound to endfield account');
            throw new Error('no characters bound to endfield account');
        }
        const character = characterList[0].defaultRole;
        return {
            uid: character.roleId,
            serverName: character.serverName,
            nickname: character.nickname,
        };
    }

    async run(): Promise<CollectResult | undefined> {
        this.LOGGER.log('Running sign in...');
        if (!this.notify) {
            const path = URL.parse(CONFIG.signURL)?.pathname ?? '/';
            const headers = await this.getHeaders(path, '');
            return fetch(CONFIG.signURL, {
                method: 'POST',
                headers: { ...headers, 'Content-Type': 'application/json' },
            }).then(res => res.json()).then((data: SignAPIResponse) => {
                const code = data.code;
                if (code || code !== 0) {
                    this.LOGGER.error('Already signed in today.');
                } else {
                    this.LOGGER.log('Sign in complete, did not notify user. This can mean failure or success.');
                }
                return undefined;
            });
        }

        const info = await this.getInfo();
        const awards = await this.getAwards();
        const total_sign_day = awards.calendar.filter(day => day.done).length;
        const todaysAward = awards.calendar.find(day => day.available)
            ?? this.findLastDoneAward(awards.calendar);
        // A timestamp is returned on every single API request
        // We are going to use that as the "today" indicator.
        // We only care about the YYYY-MM-DD part.
        const today = new Date(parseInt(awards.currentTs) * 1000).toISOString().split('T')[0];
        const result: CollectResult = {
            uid: this.uid,
            error: false,
            region_name: info.serverName,
            nickname: info.nickname,
            award: this.convertAward(todaysAward, awards.resourceInfoMap),
            today: today,
            total_sign_day,
            check_in_result: '✅',
        };
        // Skip sign in if today isn't available.
        if (!todaysAward.available) {
            result.check_in_result = '❎ Already checked in today';
            return result;
        }

        const path = URL.parse(CONFIG.signURL)?.pathname ?? '/';
        const headers = await this.getHeaders(path, '');
        const res = await fetch(CONFIG.signURL, {
            method: 'POST',
            headers: { ...headers, 'Content-Type': 'application/json' },
        }).then(res => res.json() as Promise<SignAPIResponse>);

        // Checking for last minute failures
        if (res.code !== 0) {
            // Usually cookie error or something similar
            this.LOGGER.error('Error in check-in.');
            return { uid: this.uid, error: true, data: res };
        }
        return result;
    }
}
