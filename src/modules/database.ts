import config from '@classes/config';
import * as Utils from '@modules/utils';
import type { QueryResultRow } from 'pg';
import { Pool } from 'pg';
import type { TextBasedChannel } from 'discord.js';
import { Colors, EmbedBuilder } from 'discord.js';
import { DatabaseMaintenanceError } from '@classes/exceptions';
import { NodePgJsonSerialized, NodePgJsonValue } from '@typings/serialize';

const enum GenderTypes {
    Female = '♀️',
    Male = '♂️',
    Unknown = '❔',
}

export function toGenderTypes(gender: string) {
    switch (gender) {
    case 'Female':
        return GenderTypes.Female;
    case 'Male':
        return GenderTypes.Male;
    case 'Unknown':
        return GenderTypes.Unknown;
    default:
        throw new Error(`Invalid gender string: ${gender}`);
    }
}

export function fromGenderTypes(gender: GenderTypes) {
    switch (gender) {
    case GenderTypes.Female:
        return 'Female';
    case GenderTypes.Male:
        return 'Male';
    case GenderTypes.Unknown:
        return 'Unknown';
    default:
        throw new Error(`Invalid gender type: ${gender}`);
    }
}

// Used to transform any image into a CDN link
function transformImage(img: string) {
    // Better fix in the future; nimg can be undefined.
    if (!img) return img;
    if (img.match(/^https?:\/\//)) {
        // Commons are not uploaded to CDN
        return img;
    }
    return `${config.cdn}/images/${img}`;
}

type WaifuDetails = {
    wid: string;
    name: string;
    gender: string;
    origin: string;
    img: string[];
    nimg: string[];
    fc: boolean;
};

class Waifu {
    wid: string;
    name: string;
    gender: GenderTypes;
    origin: string;
    img: string[];
    nimg: string[];
    fc: boolean;

    constructor(row: WaifuDetails) {
        if (!row) throw new Error('Waifu details partial');
        this.wid = row.wid;
        this.name = row.name;
        this.gender = toGenderTypes(row.gender);
        this.origin = row.origin;
        this.img = row.img.map(transformImage);
        this.nimg = row.nimg.map(transformImage);
        this.fc = row.fc;
    }

    static fromRows(rows: unknown[]) {
        const rets: Waifu[] = [];
        for (const row of rows) {
            rets.push(new Waifu(row as WaifuDetails));
        }
        return rets;
    }

    getGender() {
        return ' ' + this.gender;
    }

    thisIsNToggleable() {
        return this.nimg.length !== 0;
    }

    thisIsNSwitchable() {
        return this.nimg.length > 1;
    }
}

type CharacterDetails = {
    uid: string;
    wid: string;
    idx?: string;
    name: string;
    gender: string;
    origin: string;
    lvl: number;
    fc: boolean;
    _img?: number;
    _nimg?: number;
    img: string;
    nimg: string;
    nsfw: boolean;
};

class Character {
    private static ntoggleThreshold = 5;
    uid: string;
    wid: string;
    idx?: number;
    name: string;
    gender: GenderTypes;
    origin: string;
    lvl: number;
    fc: boolean;
    _img: number;
    _nimg: number;
    max_img: number;
    max_nimg: number;
    img: string;
    nimg: string;
    nsfw: boolean;
    displayLvl: string;
    /**
     * Only available if {@link loadWaifu} is called.
     */
    waifu?: Waifu;
    private loaded: boolean;

    constructor(row: CharacterDetails) {
        // This is sanity check, typescript can only do so much for us.
        if (!row) throw new Error('Character details partial');
        this.loaded = false;
        this.uid = row.uid;
        this.wid = row.wid;
        this.idx = parseInt(row.idx ?? '-1');
        this.name = row.name;
        this.gender = toGenderTypes(row.gender);
        this.origin = row.origin;
        this.lvl = row.lvl;
        this.fc = row.fc;
        // _img and _nimg are used to store the index of the image
        this._img = row._img ?? 1;
        this._nimg = row._nimg ?? 1;
        this.max_img = row.lvl;
        this.max_nimg = row.lvl >= Character.ntoggleThreshold ? row.lvl - 4 : NaN;
        // Transform img and nimg to their actual links
        // In our database, we only store the ID if they are in our CDN
        // Thus, we need to convert it into an available link
        this.img = transformImage(row.img);
        this.nimg = transformImage(row.nimg);
        this.nsfw = row.nsfw;
        // Can be used to do more fun stuff with levels
        this.displayLvl = this.lvl < 0 ? '∞' : this.lvl.toString();
    }

    /**
     * Only available if {@link loadWaifu} is called.
     * @throws {Error} If waifu is not loaded
     */
    get unlockedNMode() {
        return this.lvl === Character.ntoggleThreshold && this.thisIsNToggleable();
    }

    /**
     * Only available if {@link loadWaifu} is called.
     * @throws {Error} If waifu is not loaded
     */
    get isNToggleable() {
        return this.lvl >= Character.ntoggleThreshold && this.thisIsNToggleable();
    }

    static fromRows(rows: unknown[]) {
        const rets: Character[] = [];
        for (const row of rows) {
            rets.push(new Character(row as CharacterDetails));
        }
        return rets;
    }

    async setImg(new_img: number) {
        const { _img, img } = await setUserCharacterImage(this.uid, this.wid, new_img);
        this._img = _img ?? this._img;
        this.img = img;
        return _img !== undefined;
    }

    async setNImg(new_nimg: number) {
        const { _nimg, nimg } = await setUserCharacterNImage(this.uid, this.wid, new_nimg);
        this._nimg = _nimg ?? this._nimg;
        this.nimg = nimg;
        return _nimg !== undefined;
    }

    async toggleNsfw() {
        const retval = await setUserCharacterNsfw(this.uid, this.wid, !this.nsfw);
        this.nsfw = retval[1].nsfw;
        this._nimg = retval[1]._nimg;
        this.nimg = retval[1].nimg;
        return retval[0] === undefined;
    }

    async loadWaifu() {
        this.waifu = await this.getWaifu();
        this.loaded = true;
    }

    /**
     * Only available if {@link loadWaifu} is called.
     * @throws {Error} If waifu is not loaded
     */
    thisIsNToggleable() {
        if (!this.loaded) throw new Error('Getting thisIsNToggleable before waifu is loaded');
        if (!this.fc) return false;
        return this.waifu!.thisIsNToggleable();
    }

    getWFC(channel: TextBasedChannel) {
        if (this.nsfw && Utils.channel_is_nsfw_safe(channel)) return '🔞 ';
        return this.fc ? '⭐ ' : '';
    }

    getImage(channel: TextBasedChannel) {
        if (this.nsfw && Utils.channel_is_nsfw_safe(channel)) return this.nimg;
        return this.img;
    }

    getGender() {
        return ' ' + this.gender;
    }

    /**
     * Only available if {@link loadWaifu} is called.
     * @throws {Error} If waifu is not loaded
     */
    getUStatus(l = '', r = '') {
        if (!this.loaded) throw new Error('Getting uStatus before waifu is loaded');
        if (!this.fc) return '';
        if (this.isNToggleable) {
            return `${l}🔥${r}`;
        }
        return `${l}👑${r}`;
    }

    /**
     * Only available if {@link loadWaifu} is called.
     * @throws {Error} If waifu is not loaded
     */
    getEmbed(channel: TextBasedChannel) {
        if (!this.loaded) throw new Error('Getting embed before waifu is loaded');
        const img = this.getImage(channel);
        return new EmbedBuilder({
            fields: [
                {
                    name: `${this.getWFC(channel)} **${this.name} ${this.getGender()} ` +
                        `(Lvl ${this.displayLvl}${this.getUStatus(' ')})**`,
                    value: `__From:__ ${this.origin}\n[Source](${getSource(img)})\n[Raw Image](${img})`,
                    inline: true,
                },
            ],
            color: this.fc ? Colors.Gold : Colors.LightGrey,
        }).setImage(img);
    }

    // Used to refresh the waifu object (if we need to update it).
    private getWaifu(): Promise<Waifu>;

    private getWaifu<T>(cb: (waifu: Waifu) => T): Promise<T>;

    private getWaifu<T>(cb: (waifu: Waifu) => PromiseLike<T>): Promise<T>;

    private getWaifu<T>(cb?: (waifu: Waifu) => PromiseLike<T> | T) {
        // Get the waifu object of this character.
        return fetchWaifu(this.wid).then(waifu => cb ? cb(waifu) : waifu);
    }
}

// Don't want the class to be public, only the type itself.
export type { Character };

export function getSource(img: string) {
    if (img.startsWith(config.cdn)) {
        // Using our CDN
        return img.replace('/images/', '/source/');
    }
    // Common characters source is the raw image itself.
    return img;
}

/* DATABASE SETUP */
const pool = new Pool({
    connectionTimeoutMillis: 2000,
});

/* DATABASE CONSTANTS */
// By default, all lists will return a max of 10 characters.
const defaultLimit = 10;
// Chances to get specific rarities:
// Can be changed to a sequence to increase chances.
const specialRate = [50];

// Can change brons cost here
export function getCostPerPull(special: boolean) {
    // Special = whale, else multi/roll
    if (special) return 10;
    else return 2;
}

// Still find this to be the most intuitive for the user
// Generates a query string and params to use my shiny custom
// search order
function sortQueryAndParams(colName: string, params: string[], name: string) {
    // Escape percent signs and underscores.
    name = name.replaceAll(/(?<!\\)%/g, '\\%').replaceAll(/(?<!\\)_/g, '\\_');
    // This modifies params to make it all the correct ones
    params.push(
        `${name}`, `${name} %`, `% ${name}`, `% ${name} %`,
        `${name}%`, `%${name}`, `%${name}%`,
    );
    return (
        `WHERE ${colName} ILIKE $${params.length}
        ORDER BY
            CASE
                WHEN ${colName} ILIKE $${params.length - 6} THEN 1
                WHEN ${colName} ILIKE $${params.length - 5} THEN 2
                WHEN ${colName} ILIKE $${params.length - 4} THEN 3
                WHEN ${colName} ILIKE $${params.length - 3} THEN 4
                WHEN ${colName} ILIKE $${params.length - 2} THEN 5
                WHEN ${colName} ILIKE $${params.length - 1} THEN 6
                ELSE 7
            END,
            ${colName}`
    );
}

function getClient() {
    return pool.connect().catch(() => {
        // Wrap so we can throw our own error.
        throw new DatabaseMaintenanceError(
            'Database is currently under maintenance. Please try again later.',
        );
    });
}

// Single queries MUST use this because all single queries are
// automatically wrapped inside a transaction.
async function query<R extends QueryResultRow = QueryResultRow, I = unknown>(query: string, values?: I[]) {
    const client = await getClient();
    try {
        return client.query<R>(query, values).then(res => res.rows);
    } finally {
        client.release();
    }
}

// This makes a bunch of queries atomic.
type IsolationLevels = 'READ COMMITTED' | 'REPEATABLE READ' | 'SERIALIZABLE';

async function multi_query<R extends QueryResultRow = object, I = unknown>(
    queries: string[],
    values: I[][] = [],
    level: IsolationLevels = 'READ COMMITTED',
) {
    const client = await getClient();
    try {
        const res: R[][] = [];
        await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${level}`);
        for (const query of queries) {
            res.push(await client.query<R>(query, values.shift()).then(res => res.rows));
        }
        await client.query('COMMIT');
        return res;
    } catch (err) {
        await client.query('ROLLBACK');
        throw err;
    } finally {
        client.release();
    }
}

export function start() {
    // We want to be able to still live even if database is not available.
    pool.on('error', err => {
        // We don't care if the connection is terminated.
        if (err.message.includes('terminating connection due to administrator command')) return;
        throw err;
    });
    // 2 in 1, we remove all expired local caches, and check if database works at the same time.
    return pool.query('DELETE FROM local_data WHERE CURRENT_DATE >= expiry').then(() => false, () => true);
}

export function end() {
    return pool.end().catch(Utils.VOID);
}

export function getUidsList(shardId: number, totalShards: number) {
    return query<{ uid: string }>(
        `WITH uids AS (SELECT uid
                       FROM (SELECT uid
                             FROM user_info
                             UNION
                             SELECT uid
                             FROM guess_info) A)

         SELECT uid
         FROM uids
         LIMIT (SELECT COUNT(*) FROM uids) / $1 OFFSET (SELECT COUNT(*) FROM uids) / $1 * $2`,
        [totalShards, shardId],
    ).then(res => res.map(row => row.uid));
}

/* END DATABASE SETUP */

/* GETTERS/SETTERS FOR DATABASE */
export function getUserCount() {
    return query<{ count: number }>(
        'SELECT COUNT(*)::int FROM user_info',
    ).then(ret => ret[0].count);
}

export function getBrons(userID: string) {
    return query<{ brons: number }>(
        'SELECT brons FROM user_info WHERE uid = $1',
        [userID],
    ).then(ret => ret.at(0)?.brons);
}

export function addBrons(userID: string, amount: number) {
    return query<{ uid: string }>(
        'UPDATE user_info SET brons = brons + $2 WHERE uid = $1 RETURNING uid',
        [userID, amount],
    ).then(res => res.at(0)?.uid);
}

export function getAndSetDaily(userID: string) {
    // We will use these constants here
    const dailyAmt = 200;
    const firstSignUp = 1000;
    return multi_query<{ collected: boolean }>(
        [
            'SELECT collected FROM user_info WHERE uid = $1',
            `INSERT INTO user_info(uid, brons)
             VALUES ($1, $2)
             ON CONFLICT (uid) DO UPDATE
                 SET brons     = user_info.brons + $3,
                     collected = TRUE
             WHERE user_info.collected = FALSE
             RETURNING collected`,
        ],
        [[userID], [userID, firstSignUp, dailyAmt]],
    ).then(res => {
        const collect_success = res[1].at(0)?.collected ?? false;
        // User would exist if res[0][0] exists
        if (res[0].at(0)) return { collect_success, amt: dailyAmt };
        return { collect_success, amt: firstSignUp };
    });
}

export function getCollected(userID: string) {
    return query<{ collected: boolean }>(
        'SELECT collected FROM user_info WHERE uid = $1',
        [userID],
    ).then(ret => ret.at(0)?.collected);
}

export function getWhales(userID: string) {
    return query<{ whales: number }>(
        'SELECT whales FROM user_info WHERE uid = $1',
        [userID],
    ).then(ret => ret.at(0)?.whales);
}

export function getAllCompleted(userID: string) {
    return query<{ origin: string, count: number }>(
        'SELECT origin, count FROM completed_series WHERE uid = $1',
        [userID],
    ).then(res => new Map(res.map(row => [row.origin, row.count])));
}

export function getCompleted(userID: string, origin: string) {
    return query<{ count: number }>(
        'SELECT count FROM completed_series WHERE uid = $1 AND origin = $2',
        [userID, origin],
    ).then(res => res.at(0)?.count);
}

export function setCompleted(userID: string, origin: string, count: number) {
    return query(
        `INSERT INTO completed_series(uid, origin, count)
         VALUES ($1, $2, $3)
         ON CONFLICT (uid, origin)
             DO UPDATE SET count = EXCLUDED.count`,
        [userID, origin, count],
    ).then(() => true).catch(err => {
        if (err instanceof DatabaseMaintenanceError) throw err;
        return false;
    });
}

export function getUserLBStats(userID: string) {
    return query<{ brons: number, idx: string }>(
        'SELECT brons, idx FROM leaderboard WHERE uid = $1',
        [userID],
    ).then(res =>
        res.at(0)
            ? ({ brons: res[0].brons, idx: parseInt(res[0].idx) })
            : undefined,
    );
}

export function getLeaderboards(start: number) {
    return query<{ uid: string, brons: number, waifus: string, idx: string }>(
        'SELECT * FROM leaderboard LIMIT 10 OFFSET $1',
        [start],
    ).then(res => res.map(row => ({
        uid: row.uid,
        brons: row.brons,
        waifus: parseInt(row.waifus),
        idx: parseInt(row.idx),
    })));
}

export function getUserStarLBStats(userID: string) {
    return query<{ brons: number, stars: string, idx: string }>(
        'SELECT brons, stars, idx FROM starLeaderboard WHERE uid = $1',
        [userID],
    ).then(res =>
        res.at(0) ? ({
            brons: res[0].brons,
            stars: parseInt(res[0].stars),
            idx: parseInt(res[0].idx),
        }) : undefined,
    );
}

export function getStarLeaderboards(start: number) {
    return query<{ uid: string, brons: number, stars: string, idx: string }>(
        'SELECT * FROM starLeaderboard LIMIT 10 OFFSET $1',
        [start],
    ).then(res => res.map(row => ({
        uid: row.uid,
        brons: row.brons,
        stars: parseInt(row.stars),
        idx: parseInt(row.idx),
    })));
}

/* END GETTERS/SETTERS FOR DATABASE */

/* All waifus data */
export type PartialWaifu = {
    name: string,
    gender: 'Male' | 'Female' | 'Unknown',
    origin: string,
    img: string[],
    nimg: string[]
};

/**
 * Ensure the waifu provided does not contain old images, only new images that are to be added
 * @throws {Error} If waifu gets too many images
 */
export function insertWaifu(waifu: PartialWaifu) {
    // With this query, we must make sure we are not appending to img array
    // We will return the waifu object, and it will raise an exception
    // if the waifu's images goes out of bounds (due to our check constraint)
    return multi_query<WaifuDetails>(
        [
            `INSERT INTO waifus(name, gender, origin, img, nimg)
             VALUES ($1, $2, $3, $4, $5)
             ON CONFLICT (name, gender, origin)
                 DO UPDATE SET img  = waifus.img || EXCLUDED.img,
                               nimg = waifus.nimg || EXCLUDED.nimg
             RETURNING *`,
            'REFRESH MATERIALIZED VIEW chars',
        ],
        [[waifu.name, waifu.gender, waifu.origin, waifu.img, waifu.nimg]],
    ).then(res => new Waifu(res[0][0]));
}

export function fetchWaifuByDetails(details: PartialWaifu) {
    return query<WaifuDetails>(
        `SELECT *
         FROM chars
         WHERE name = $1
           AND gender = $2
           AND origin = $3
           AND fc = TRUE
         LIMIT 1`,
        [details.name, details.gender, details.origin],
    ).then(res => res.at(0) ? new Waifu(res[0]) : undefined);
}

export function fetchWaifu(wid: string) {
    return query<WaifuDetails>(
        'SELECT * FROM chars WHERE wid = $1',
        [wid],
    ).then(res => new Waifu(res[0]));
}

export function fetchWaifuCount() {
    return query<{ count: number }>(
        'SELECT COUNT(*)::int FROM waifus',
    ).then(ret => ret[0].count);
}

export function searchWaifuByName(name: string) {
    const params = [defaultLimit.toString()];
    return query<WaifuDetails>(
        `SELECT *
         FROM (SELECT *
               FROM chars
               WHERE fc = TRUE) A
             ${sortQueryAndParams('name', params, name)}
         LIMIT $1`,
        params,
    ).then(Waifu.fromRows);
}

export function searchOriginByName(name: string) {
    const params = [defaultLimit.toString()];
    return query<{ origin: string }>(
        `SELECT origin
         FROM (SELECT DISTINCT origin
               FROM chars
               WHERE fc = TRUE) A
             ${sortQueryAndParams('origin', params, name)}
         LIMIT $1`,
        params,
    ).then(res => res.map(row => row.origin));
}

export function fetchCompleteOrigin(origin: string) {
    // Escape percent signs and underscores.
    origin = origin.replaceAll(/(?<!\\)%/g, '\\%').replaceAll(/(?<!\\)_/g, '\\_');
    // Might be weird, but this isn't a search, it is simply
    // a case-insensitive query.
    return query<{ origin: string }>(
        'SELECT origin FROM chars WHERE origin ILIKE $1',
        [origin],
    ).then(res => res.at(0)?.origin);
}

export function getAnimesCount() {
    return query<{ count: number }>(
        'SELECT COUNT(DISTINCT origin)::int FROM waifus',
    ).then(ret => ret[0].count);
}

export function getAnimes(start: number) {
    return query<{ origin: string, count: number }>(
        `SELECT origin, COUNT(*)::int
         FROM waifus
         GROUP BY origin
         ORDER BY origin
         LIMIT $1 OFFSET $2`,
        [defaultLimit, start],
    );
}

export function getAnime(anime: string) {
    return query<WaifuDetails>(
        `SELECT *
         FROM chars
         WHERE origin = $1
           AND fc = TRUE
         ORDER BY name`,
        [anime],
    ).then(Waifu.fromRows);
}

export const enum Levels {
    EASY = 'easy',
    MEDIUM = 'medium',
    HARD = 'hard',
}

export function fetchRandomWaifu(amt: number, level: Levels) {
    switch (level) {
    case Levels.EASY:
        return query<WaifuDetails>(
            `SELECT name, gender, origin, img, nimg
             FROM waifus
             ORDER BY RANDOM()
             LIMIT $1`,
            [amt],
        ).then(Waifu.fromRows);
    case Levels.MEDIUM:
        return query<WaifuDetails>(
            `SELECT A.*
             FROM (SELECT name,
                          gender,
                          origin,
                          img[FLOOR(RANDOM() * array_length(img, 1)) + 1]
                   FROM waifus
                   UNION ALL
                   SELECT B.*
                   FROM (SELECT name, gender, origin, img
                         FROM commons
                         ORDER BY RANDOM()
                         LIMIT (SELECT COUNT(*)
                                FROM waifus)) B) A
             ORDER BY RANDOM()
             LIMIT $1`,
            [amt],
        ).then(Waifu.fromRows);
    case Levels.HARD:
        return query<WaifuDetails>(
            `SELECT name,
                    gender,
                    origin,
                    img[FLOOR(RANDOM() * array_length(img, 1)) + 1]
             FROM chars
             ORDER BY RANDOM()
             LIMIT $1`,
            [amt],
        ).then(Waifu.fromRows);
    }
    // Says unreachable, however if an invalid level is provided,
    // will be reached.
    throw new Error('Invalid level');
}

/* End All waifus data */

/* HoyoLab data */
type CheckinType = 'none' | 'checkin' | 'notify';
type GameType = 'genshin' | 'honkai' | 'star_rail';
type HoyolabAccount = {
    idx: string; // Only used for a specific scenario
    id: string;
    cookie: string;
    genshin: CheckinType;
    honkai: CheckinType;
    star_rail: CheckinType;
    page: string;
};

export function fetchAutocollectByIdx(userID: string, idx: string) {
    return query<HoyolabAccount>(
        `SELECT *
         FROM (SELECT *,
                      row_number() OVER (
                          PARTITION BY id
                          ORDER BY idx
                          ) AS page
               FROM hoyolab_cookies_list) A
         WHERE id = $1
           AND idx = $2`,
        [userID, idx],
    ).then(res => res.at(0));
}

export function fetchAutocollectByPage(userID: string, page: number) {
    return query<HoyolabAccount>(
        `SELECT *, $2::int + 1 AS page
         FROM hoyolab_cookies_list
         WHERE id = $1
         ORDER BY idx
         LIMIT 1 OFFSET $2`,
        [userID, page],
    ).then(res => res.at(0));
}

export function fetchAutocollectLength(userID: string) {
    return query<{ count: number }>(
        `SELECT COUNT(*)::int
         FROM hoyolab_cookies_list
         WHERE id = $1`,
        [userID],
    ).then(res => res[0].count);
}

export function toggleAutocollect(userID: string, game: GameType, type: CheckinType, idx: string) {
    return query(
        `UPDATE hoyolab_cookies_list
         SET ${game} = $2
         WHERE id = $1
           AND idx = $3`,
        [userID, type, idx],
    ).then(Utils.VOID);
}

export async function addCookie(userID: string, cookie: string) {
    // Try to cap at 5 cookies
    // This is not guaranteed to always cap at 5, but won't be too far off like 100
    // Better solution is to create a trigger on the table
    const count = await fetchAutocollectLength(userID);
    if (count >= 5) return false;
    return query(
        `INSERT INTO hoyolab_cookies_list (id, cookie)
         VALUES ($1, $2)
         ON CONFLICT (id, cookie)
             DO NOTHING
         RETURNING *`,
        [userID, cookie],
    ).then(res => !!res.at(0));
}

export function deleteCookie(userID: string, idx: string) {
    return query(
        `DELETE
         FROM hoyolab_cookies_list
         WHERE id = $1
           AND idx = $2
         RETURNING *`,
        [userID, idx], // idx serves as a nice identifier
    ).then(rows => !!rows.at(0));
}

export function getEmoji(name: string) {
    return query<{ emoji: string }>(
        'SELECT emoji FROM emojis WHERE name = $1',
        [name],
    ).then(res => res.at(0)?.emoji);
}

export function addEmoji(name: string, emoji: string) {
    return query(
        'INSERT INTO emojis(name, emoji) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING',
        [name, emoji],
    );
}

/* End HoyoLab data */

/* User Chars database */

// Add character(s)
export function fetchAllUsers(wid: string) {
    return query(
        `SELECT *
         FROM all_user_chars
         WHERE wid = $1
         ORDER BY lvl DESC, idx
         LIMIT 20`, // Higher limit to fit embed
        [wid],
    ).then(Character.fromRows);
}

// For high list
export function fetchUserHighCount(userID: string) {
    return query<{ max: string }>(
        `SELECT MAX(idx)
         FROM
             get_high_user_chars($1)`,
        [userID],
    ).then(ret => parseInt(ret.at(0)?.max ?? '0'));
}

export function fetchUserCharacterCount(userID: string) {
    return query<{ max: string }>(
        'SELECT MAX(idx) FROM all_user_chars WHERE uid = $1',
        [userID],
    ).then(ret => parseInt(ret.at(0)?.max ?? '0'));
}

type Range = { start?: number, end?: number };

export function fetchUserCommonCount(userID: string, { start, end }: Range = {}) {
    let q = 'SELECT COUNT(*)::int FROM all_user_chars WHERE uid = $1 AND fc = FALSE';
    const params: (string | number)[] = [userID];
    if (start) {
        params.push(start);
        q += ' AND idx >= $2::bigint';
    }
    if (end) {
        params.push(end);
        q += ` AND idx <= $${params.length}::bigint`;
    }
    return query<{ count: number }>(q, params).then(ret => ret[0].count);
}

export function fetchUserStarredCount(userID: string) {
    return query<{ count: number }>(
        `SELECT COUNT(*)::int
         FROM all_user_chars
         WHERE uid = $1
           AND fc = TRUE`,
        [userID],
    ).then(ret => ret[0].count);
}

export function fetchRandomStarred(userID: string) {
    // For daily to get a random starred character
    return query<CharacterDetails>(
        `SELECT *
         FROM all_user_chars
         WHERE uid = $1
           AND fc = TRUE
         ORDER BY RANDOM()
         LIMIT 1`,
        [userID],
    ).then(res => res.at(0) ? new Character(res[0]) : undefined);
}

export function fetchUserCharacter(userID: string, wid: string) {
    if (parseInt(wid) <= 0) throw new Error('Invalid wid');
    return query<CharacterDetails>(
        `SELECT *
         FROM all_user_chars
         WHERE uid = $1
           AND wid = $2`,
        [userID, wid],
    ).then(res => res.at(0) ? new Character(res[0]) : undefined);
}

export function fetchUserHighCharacter(userID: string, wid: string) {
    return query<CharacterDetails>(
        `SELECT *
         FROM get_high_user_chars($1)
         WHERE wid = $2`,
        [userID, wid],
    ).then(res => res.at(0) ? new Character(res[0]) : undefined);
}

export function fetchUserHighestCharacter(userID: string) {
    return query<CharacterDetails>(
        `SELECT *
         FROM all_user_chars
         WHERE uid = $1
         ORDER BY lvl DESC, idx
         LIMIT 1`,
        [userID],
    ).then(res => res.at(0) ? new Character(res[0]) : undefined);
}

export function fetchUserCharactersList(userID: string, start: number) {
    if (start <= 0) throw new Error('Invalid start');
    return query(
        `SELECT *
         FROM get_user_chars($1)
         WHERE idx >= $2
         LIMIT $3`,
        [userID, start, defaultLimit],
    ).then(Character.fromRows);
}

export function fetchUserHighCharactersList(userID: string, start: number) {
    if (start <= 0) throw new Error('Invalid start');
    return query(
        `SELECT *
         FROM get_high_user_chars($1)
         WHERE idx >= $2
         LIMIT $3`,
        [userID, start, defaultLimit],
    ).then(Character.fromRows);
}

export function queryUserCharacter(userID: string, name: string) {
    const params = [userID, defaultLimit.toString()];
    return query(
        `SELECT *
         FROM get_user_chars($1) ${sortQueryAndParams('name', params, name)}
         LIMIT $2`,
        params,
    ).then(Character.fromRows);
}

export function queryUserHighCharacter(userID: string, name: string) {
    const params = [userID, defaultLimit.toString()];
    return query(
        `SELECT *
         FROM get_high_user_chars($1) ${sortQueryAndParams('name', params, name)}
         LIMIT $2`,
        params,
    ).then(Character.fromRows);
}

export function fetchUserAnimeCount(userID: string, origin: string) {
    return query<{ count: number }>(
        `SELECT COUNT(*)::int
         FROM all_user_chars
         WHERE uid = $1
           AND origin = $2
           AND fc = TRUE`,
        [userID, origin],
    ).then(ret => ret[0].count);
}

function getCommonQuery() {
    return 'SELECT wid FROM chars WHERE fc = FALSE ORDER BY RANDOM() LIMIT 1';
}

function getStarredQuery() {
    return 'SELECT wid FROM chars WHERE fc = TRUE ORDER BY RANDOM() LIMIT 1';
}

function getMultiStarredQuery() {
    return `SELECT wid
            FROM chars
            WHERE fc = TRUE AND array_length(img, 1) > 1
               OR array_length(nimg, 1) > 0
            ORDER BY RANDOM()
            LIMIT 1`;
}

const enum GuaranteeLevel {
    COMMON = 0,
    STARRED,
    MULTI_STARS,
}

function generateCharacterQuery(level: GuaranteeLevel) {
    const random = Math.floor(Math.random() * 101);
    switch (level) {
    case GuaranteeLevel.COMMON:
        if (specialRate.includes(random)) {
            return getStarredQuery();
        } else {
            return getCommonQuery();
        }
    case GuaranteeLevel.STARRED:
        if (specialRate.includes(random)) {
            return getMultiStarredQuery();
        } else {
            return getStarredQuery();
        }
    case GuaranteeLevel.MULTI_STARS:
        return getMultiStarredQuery();
    }
}

// Special type of character that also includes whether it is new or old
export type CharacterInsert = Character & { new: boolean };

// Used for single pulls
export async function generateAndAddCharacter(
    userID: string,
    amtTaken: { amt: number },
): Promise<CharacterInsert | string> {
    const amt = getCostPerPull(false);
    amtTaken.amt = -amt; // Returning to the front end brons difference
    return multi_query<CharacterDetails & { new: boolean }>(
        [
            'CALL sub_brons($1, $2, $3)',
            `SELECT *
             FROM add_character($1,
                                (${generateCharacterQuery(GuaranteeLevel.COMMON)})
                  )`,
        ],
        [[userID, false, amt], [userID]],
    ).then(res => {
        const c = new Character(res[1][0]) as CharacterInsert;
        c.new = res[1][0].new;
        return c;
    }).catch(err => {
        if (err instanceof DatabaseMaintenanceError) throw err;
        else if (err.message.includes('user_info_brons_check')) return 'not enough brons';
        else if (err.message.includes('user_not_found_error')) return 'you do not have an existing account';
        // This means that nothing happened (ACID).
        return 'there was an error with the database.';
    });
}

export function generateAndAddCharacters(
    userID: string,
    special: boolean,
    amtTaken: { amt: number },
): Promise<CharacterInsert[] | string> {
    // special = false - multi
    // special = true - whales
    const PULL_AMT = 10;
    const amt = getCostPerPull(special) * PULL_AMT;
    amtTaken.amt = -amt; // Returning to the front end brons difference
    const queries = ['CALL sub_brons($1, $2, $3)'];
    const params: string[][] = [[userID, special.toString(), amt.toString()]];
    let qstring = '';
    if (special) {
        // 10 starred pulls, 1 guaranteed upgradable
        for (let i = 0; i < PULL_AMT; ++i) {
            qstring = generateCharacterQuery(GuaranteeLevel.STARRED);
            queries.push(`SELECT *
                          FROM add_character($1, (${qstring}))`);
            params.push([userID]);
        }
    } else {
        // 10 normal pulls, 1 guaranteed starred
        for (let i = 0; i < PULL_AMT; ++i) {
            qstring = generateCharacterQuery(GuaranteeLevel.COMMON);
            queries.push(`SELECT *
                          FROM add_character($1, (${qstring}))`);
            params.push([userID]);
        }
    }
    // Finally, add the guaranteed character.
    qstring = generateCharacterQuery(special ? GuaranteeLevel.MULTI_STARS : GuaranteeLevel.STARRED);
    queries.push(`SELECT *
                  FROM add_character($1, (${qstring}))`);
    params.push([userID]);
    return multi_query<CharacterDetails & { new: boolean }>(
        queries,
        params,
    ).then(res =>
        // Whales has extra query for user_info
        res.splice(1).map(x => {
            const c = new Character(x[0]) as CharacterInsert;
            c.new = x[0].new;
            return c;
        }),
    ).catch((err: Error) => {
        if (err instanceof DatabaseMaintenanceError) throw err;
        else if (err.message.includes('user_info_brons_check')) return 'not enough brons';
        else if (err.message.includes('whale_fail_error')) return 'you already whaled today';
        else if (err.message.includes('user_not_found_error')) return 'you do not have an existing account';
        // This means that nothing happened (ACID).
        return 'there was an error with the database.';
    });
}

function setUserCharacterImage(userID: string, wid: string, img: number) {
    return multi_query<{ _img?: number, img: string }>(
        [
            `UPDATE user_chars
             SET _img = $3
             WHERE uid = $1
               AND wid = $2
               AND wid IN (SELECT wid
                           FROM chars
                           WHERE $3 <= array_length(img, 1))
             RETURNING _img`,
            'SELECT img FROM all_user_chars WHERE uid = $1 AND wid = $2',
        ],
        [[userID, wid, img], [userID, wid]],
    ).then(res => ({ _img: res[0][0]._img, img: res[1][0].img }));
}

function setUserCharacterNImage(userID: string, wid: string, nimg: number) {
    return multi_query<{ _nimg?: number, nimg: string }>(
        [
            `UPDATE user_chars
             SET _nimg = $3
             WHERE uid = $1
               AND wid = $2
               AND wid IN (SELECT wid
                           FROM chars
                           WHERE $3 <= COALESCE(array_length(nimg, 1), 0))
             RETURNING _nimg`,
            'SELECT _nimg, nimg FROM all_user_chars WHERE uid = $1 AND wid = $2',
        ],
        [[userID, wid, nimg], [userID, wid]],
    ).then(res => ({ _nimg: res[0][0]._nimg, nimg: res[1][0].nimg }));
}

function setUserCharacterNsfw(userID: string, wid: string, nsfw: boolean) {
    return multi_query(
        [
            `UPDATE user_chars
             SET nsfw = $3
             WHERE uid = $1
               AND wid = $2
               AND wid IN (SELECT wid
                           FROM chars
                           WHERE COALESCE(array_length(nimg, 1), 0) >= 1)
             RETURNING nsfw`,
            `UPDATE user_chars
             SET _nimg = 1
             WHERE nsfw = TRUE
               AND _nimg = 0`,
            `SELECT _nimg, nimg, nsfw
             FROM all_user_chars
             WHERE uid = $1
               AND wid = $2`,
        ],
        [[userID, wid, nsfw], [], [userID, wid]],
    ).then(res =>
        [res[0][0], res[2][0]] as [{ nsfw: boolean } | undefined, { _nimg: number, nimg: string, nsfw: boolean }],
    );
}

export async function deleteUserCharacter(char: Character) {
    // Just in case, retrieve index; I'm paranoid.
    const { idx } = await query<{ idx: string }>(
        'SELECT idx FROM user_chars WHERE uid = $1 AND wid = $2',
        [char.uid, char.wid],
    ).then(res => res[0]);
    // Note that we didn't need to also include index,
    // but we do it just in case; will be helpful when
    // updating the index for other chars
    return multi_query(
        [
            `DELETE
             FROM user_chars
             WHERE uid = $1
               AND wid = $2
               AND idx = $3
             RETURNING *`,
            `UPDATE user_chars
             SET idx = idx - 1
             WHERE uid = $1
               AND idx >= $2`,
        ],
        [[char.uid, char.wid, idx], [char.uid, idx]],
    ).then(res => res[0].length);
}

export async function deleteUserCommonCharacters(userID: string, { start = 1, end }: Range = {}) {
    let q = 'DELETE FROM all_user_chars WHERE uid = $1 AND fc = FALSE AND idx >= $2::bigint';
    const params: string[] = [userID, start.toString()];
    if (end) {
        params.push(end.toString());
        q += ' AND idx <= $3::bigint';
    }
    q += ' RETURNING *';
    return multi_query([q, 'CALL repair_index($1)'], [params, [userID]]).then(res => res[0].length);
}

export function moveUserCharacter(char: Character, pos: number) {
    // Length is not 1 if pos is out of range.
    return multi_query(
        [
            'SET CONSTRAINTS ALL DEFERRED',
            `UPDATE user_chars
             SET idx = $4
             WHERE uid = $1
               AND wid = $2
               AND idx = $3
               AND $3 IN (SELECT idx FROM user_chars WHERE uid = $1)
             RETURNING *`,
            'CALL repair_index($1)',
        ],
        [[], [char.uid, char.wid, char.idx, pos], [char.uid]],
    ).then(ret => ret[1].length === 1);
}

export function swapUserCharacters(char1: Character, char2: Character) {
    return multi_query(
        [
            'SET CONSTRAINTS ALL DEFERRED',
            `UPDATE user_chars
             SET idx = $4
             WHERE uid = $1
               AND wid = $2
               AND idx = $3`,
            `UPDATE user_chars
             SET idx = $4
             WHERE uid = $1
               AND wid = $2
               AND idx = $3`,
        ],
        [
            [],
            [char1.uid, char1.wid, char1.idx, char2.idx],
            [char2.uid, char2.wid, char2.idx, char1.idx],
        ],
    ).then(Utils.VOID);
}

// Trade characters; deal with this in the far future
// Trading will be completely redone
/* End User Chars database */

/* Special functions to get/set guild welcome */
type GuildSettings = {
    gid: string;
    welcome_msg: string | null;
    welcome_roleid: string | null;
    welcome_channelid: string | null;
    emoji_replacement: boolean;
};
const EMPTY_GUILD_SETTINGS: GuildSettings = {
    gid: '',
    welcome_msg: null,
    welcome_roleid: null,
    welcome_channelid: null,
    emoji_replacement: true,
};

export function isGuildEmpty(guild: GuildSettings) {
    return guild.gid === '' &&
        guild.welcome_msg === null &&
        guild.welcome_roleid === null &&
        guild.welcome_channelid === null &&
        guild.emoji_replacement;

}

// Will return an empty GuildSettings object if not found
// This allows modification easily even if it does not exist.
export function getGuild(gid: string) {
    return query<GuildSettings>(
        'SELECT * FROM guild_settings WHERE gid = $1',
        [gid],
    ).then(res => res.at(0) ?? { ...EMPTY_GUILD_SETTINGS, gid });
}

// Set any to null to remove instead of undefined.
export function setGuild(settings: GuildSettings) {
    const params: (typeof EMPTY_GUILD_SETTINGS[keyof GuildSettings])[] = [settings.gid];
    let cols: string = 'gid';
    let values: string = '$1';
    let colUpdates: string = 'gid = EXCLUDED.gid';
    // Use empty guild settings as keys to iterate
    // The reason is that settings itself, may inherit from GuildSettings,
    // so it might have extra keys that we don't want to add to the query.
    for (const key in EMPTY_GUILD_SETTINGS) {
        // We already added gid to the parameters; it is required.
        if (key === 'gid') continue;
        const setting: keyof GuildSettings = key as keyof GuildSettings;
        params.push(settings[setting]);
        cols += `, ${setting}`;
        values += `, $${params.length}`;
        colUpdates += `, ${setting} = EXCLUDED.${setting}`;
    }
    return query(
        `INSERT INTO guild_settings(${cols})
         VALUES (${values})
         ON CONFLICT (gid)
             DO UPDATE SET ${colUpdates}`,
        params,
    ).then(Utils.VOID);
}

/* Special functions for guessing streaks */
type GuessStreak = {
    uid: string;
    easy_streak: number;
    easy_max_streak: number;
    medium_streak: number;
    medium_max_streak: number;
    hard_streak: number;
    hard_max_streak: number;
};

export function getGuessStreaks(userID: string) {
    return query<GuessStreak>(
        'SELECT * FROM guess_info WHERE uid = $1',
        [userID],
    ).then(res => res.at(0));
}

export function addOneToGuessStreak(userID: string, level: Levels) {
    return query<GuessStreak>(
        `INSERT INTO guess_info(uid, ${level}_streak, ${level}_max_streak)
         VALUES ($1, $2, $3)
         ON CONFLICT (uid)
             DO UPDATE SET ${level}_streak = guess_info.${level}_streak + 1
         RETURNING ${level}_streak, ${level}_max_streak`,
        [userID, 1, 1],
    ).then(res => {
        if (!res) throw new Error(`Guess streak ${level} not found`);
        return {
            streak: res[0][`${level}_streak`],
            max: res[0][`${level}_max_streak`],
        };
    });
}

export function resetGuessStreak(userID: string, level: Levels) {
    return query(
        `UPDATE guess_info
         SET ${level}_streak = 0
         WHERE uid = $1`,
        [userID],
    ).then(Utils.VOID);
}

/*
 * Special functions for storing local data.
 * Can store any object that can be serialized.
 */
export class Cache<CacheType extends NodePgJsonValue> {
    constructor(private cmd: string) {
    }

    get(id: string): Promise<NodePgJsonSerialized<CacheType> | undefined>;
    get(
        id: string,
        deserializer: (data: NodePgJsonSerialized<CacheType>) => CacheType,
    ): Promise<CacheType | undefined>;
    get(id: string, deserializer?: (data: NodePgJsonSerialized<CacheType>) => CacheType) {
        return query<{ data: NodePgJsonSerialized<CacheType> }>(
            `SELECT data
             FROM local_data
             WHERE cmd = $1
               AND id = $2
               AND (CURRENT_DATE < expiry OR expiry IS NULL)`,
            [this.cmd, id],
        ).then(res => {
            const data = res.at(0)?.data;
            // Deserializer is only called if data was found.
            if (deserializer && data) return deserializer(data);
            return data;
        });
    }

    set(id: string, data: CacheType, expiry: Date | null = null) {
        return query(
            `INSERT INTO local_data(cmd, id, data, expiry)
             VALUES ($1, $2, $3, $4)
             ON CONFLICT (cmd, id) DO UPDATE SET data   = EXCLUDED.data,
                                                 expiry = COALESCE(local_data.expiry, EXCLUDED.expiry)`,
            [this.cmd, id, data, expiry],
        ).then(Utils.VOID);
    }

    delete(id: string | null = null) {
        return query<{ cmd: string, id: string, data: NodePgJsonSerialized<CacheType>, expiry: Date }>(
            'DELETE FROM local_data WHERE cmd = $1 AND id = $2 RETURNING *',
            [this.cmd, id],
        );
    }
}

// We use this function to delete when any subscribed object is deleted
export function deleteLocalData(id: string) {
    return query(
        'DELETE FROM local_data WHERE id = $1',
        [id],
    ).then(Utils.VOID, Utils.VOID);
}
