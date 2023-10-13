"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.fetchUserCharacter = exports.fetchRandomStarred = exports.fetchUserStarredCount = exports.fetchUserCommonCount = exports.fetchUserCharacterCount = exports.fetchUserHighCount = exports.fetchUserLewdList = exports.fetchUserUpList = exports.fetchAllUsers = exports.addEmoji = exports.getEmoji = exports.deleteCookie = exports.addCookie = exports.toggleAutocollect = exports.fetchAutocollectLength = exports.fetchAutocollectByPage = exports.fetchAutocollectByIdx = exports.fetchRandomWaifu = exports.getAnime = exports.getAnimeCount = exports.getAnimes = exports.getAnimesCount = exports.fetchCompleteOrigin = exports.searchOriginByName = exports.searchWaifuByName = exports.fetchWaifuCount = exports.fetchWaifu = exports.fetchWaifuByDetails = exports.insertWaifu = exports.getStarLeaderboards = exports.getUserStarLBStats = exports.getLeaderboards = exports.getUserLBStats = exports.setCompleted = exports.getCompleted = exports.getAllCompleted = exports.getWhales = exports.getCollected = exports.getAndSetDaily = exports.addBrons = exports.getBrons = exports.getUserCount = exports.getUidsList = exports.end = exports.start = exports.getCostPerPull = exports.getSource = exports.Character = exports.fromGenderTypes = exports.toGenderTypes = void 0;
exports.deleteLocalData = exports.Cache = exports.resetGuessStreak = exports.addOneToGuessStreak = exports.getGuessStreaks = exports.setGuild = exports.getGuild = exports.swapUserCharacters = exports.moveUserCharacter = exports.deleteUserCommonCharacters = exports.deleteUserCharacter = exports.generateAndAddCharacters = exports.generateAndAddCharacter = exports.fetchUserAnimeWids = exports.fetchUserAnimeCount = exports.queryUserHighCharacter = exports.queryUserCharacter = exports.fetchUserHighCharactersList = exports.fetchUserCharactersList = exports.fetchUserHighestCharacter = exports.fetchUserHighCharacter = void 0;
const config_1 = __importDefault(require("../classes/config"));
const Utils = __importStar(require("./utils"));
const pg_1 = require("pg");
const discord_js_1 = require("discord.js");
const exceptions_1 = require("../classes/exceptions");
function toGenderTypes(gend) {
    switch (gend) {
        case 'Female':
            return "\u2640\uFE0F" /* GenderTypes.Female */;
        case 'Male':
            return "\u2642\uFE0F" /* GenderTypes.Male */;
        case 'Unknown':
            return "\u2754" /* GenderTypes.Unknown */;
        default:
            throw new Error('Invalid gender string');
    }
}
exports.toGenderTypes = toGenderTypes;
function fromGenderTypes(gend) {
    switch (gend) {
        case "\u2640\uFE0F" /* GenderTypes.Female */:
            return 'Female';
        case "\u2642\uFE0F" /* GenderTypes.Male */:
            return 'Male';
        case "\u2754" /* GenderTypes.Unknown */:
            return 'Unknown';
        default:
            throw new Error('Invalid gender type');
    }
}
exports.fromGenderTypes = fromGenderTypes;
class Waifu {
    static fromRows(rows) {
        const rets = [];
        for (const row of rows) {
            rets.push(new Waifu(row));
        }
        return rets;
    }
    constructor(row) {
        if (!row)
            throw new Error('Waifu details partial');
        this.wid = row.wid;
        this.name = row.name;
        this.gender = toGenderTypes(row.gender);
        this.origin = row.origin;
        // TEMPORARY SOLUTION: For now we use this to include get for img/nimg for our CDN
        this._img = row.img;
        this._nimg = row.nimg;
        this.fc = row.fc;
    }
    get img() {
        return this._img.map(i => {
            // Commons are not uploaded to CDN
            if (i.match(/^https?:\/\//)) {
                return i;
            }
            return `${config_1.default.cdn}/images/${i}`;
        });
    }
    get nimg() {
        // Commons don't have nimgs so we don't have to check here
        return this._nimg.map(i => {
            // Backwards compatibility
            if (i.startsWith('https://i.imgur')) {
                return i;
            }
            return `${config_1.default.cdn}/images/${i}`;
        });
    }
    getGender() {
        return ' ' + this.gender;
    }
    thisIsUpgradable() {
        return this._img.length > 1;
    }
    thisIsNToggleable() {
        return this._nimg.length !== 0;
    }
    thisIsNSwitchable() {
        return this._nimg.length > 1;
    }
    getUStatus(l = '', r = '') {
        if (this.thisIsUpgradable()) {
            return `${l}⏫${r}`;
        }
        return '';
    }
    fullClone() {
        return new Waifu({
            ...this,
            img: this._img.slice(),
            nimg: this._nimg.slice()
        });
    }
}
class Character {
    static fromRows(rows) {
        const rets = [];
        for (const row of rows) {
            rets.push(new Character(row));
        }
        return rets;
    }
    getWaifu(cb) {
        // Get the waifu object of this character.
        return fetchWaifu(this.wid).then(waifu => cb ? cb(waifu) : waifu);
    }
    constructor(row) {
        // This is sanity check, typescript can only do so much for us.
        if (!row)
            throw new Error('Character details partial');
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
        // TEMPORARY SOLUTION: For now we use this to include get for img/nimg for our CDN
        this.__img = row.img;
        this.__nimg = row.nimg;
        this.nsfw = row.nsfw;
        this.displayLvl = this.lvl < 0 ? '∞' : this.lvl.toString();
    }
    get img() {
        // Commons are not uploaded to CDN
        if (this.__img.match(/^https?:\/\//)) {
            return this.__img;
        }
        return `${config_1.default.cdn}/images/${this.__img}`;
    }
    get nimg() {
        // Backwards compatibility
        if (this.__nimg.startsWith('https://i.imgur')) {
            return this.__nimg;
        }
        return `${config_1.default.cdn}/images/${this.__nimg}`;
    }
    get unlockedImages() { return this.lvl === 5; }
    get unlockedNMode() { return this.lvl === 8; }
    get unlockedNImages() { return this.lvl === 10; }
    get isUpgradable() { return 0 < this.lvl && this.lvl <= 4; }
    get isSwitchable() { return this.lvl === -1 || this.lvl >= 5; }
    get isNToggleable() { return this.lvl === -1 || this.lvl >= 8; }
    get isNSwitchable() { return this.lvl === -1 || this.lvl >= 10; }
    async setImg(new_img) {
        const { _img, img } = await setUserCharacterImage(this.uid, this.wid, new_img);
        this._img = _img ?? this._img;
        this.__img = img;
        return _img !== undefined;
    }
    async setNImg(new_nimg) {
        const { _nimg, nimg } = await setUserCharacterNImage(this.uid, this.wid, new_nimg);
        this._nimg = _nimg ?? this._nimg;
        this.__nimg = nimg;
        return _nimg !== undefined;
    }
    async toggleNsfw() {
        const retval = await setUserCharacterNsfw(this.uid, this.wid, !this.nsfw);
        this.nsfw = retval[1].nsfw;
        this._nimg = retval[1]._nimg;
        this.__nimg = retval[1].nimg;
        return retval[0] === undefined;
    }
    async upgrade(cost) {
        const retval = await addUserCharacterLevel(this.uid, this.wid, cost);
        if (retval)
            return retval;
        this.lvl += 1;
        this.displayLvl = this.lvl.toString();
    }
    async loadWaifu() {
        this.waifu = await this.getWaifu();
        this.loaded = true;
    }
    thisIsUpgradable() {
        if (!this.fc)
            return false;
        return this.waifu.thisIsUpgradable();
    }
    thisIsNToggleable() {
        if (!this.fc)
            return false;
        return this.waifu.thisIsNToggleable();
    }
    thisIsNSwitchable() {
        if (!this.fc)
            return false;
        return this.waifu.thisIsNSwitchable();
    }
    getWFC(channel) {
        if (this.nsfw && Utils.channel_is_nsfw_safe(channel))
            return '🔞 ';
        return this.fc ? '⭐ ' : '';
    }
    getImage(channel) {
        if (this.nsfw && Utils.channel_is_nsfw_safe(channel))
            return this.nimg;
        return this.img;
    }
    getGender() {
        return ' ' + this.gender;
    }
    getUStatus(l = '', r = '') {
        if (!this.loaded)
            throw new Error('Getting ustatus before waifu is loaded');
        // Character doesn't have a level, default waifus database.
        const lvl = (this.lvl === -1) ? Infinity : (this.lvl ? this.lvl : 1);
        if (this.thisIsUpgradable()) {
            if (lvl < 4) {
                return `${l}⏫${r}`;
            }
            else if (lvl === 4) {
                return `${l}⏏️${r}`;
            }
            else if (this.thisIsNSwitchable() && (lvl >= 10)) {
                return `${l}🔥${r}`;
            }
            else if (this.thisIsNToggleable() && (lvl >= 8)) {
                return `${l}✨${r}`;
            }
            return `${l}👑${r}`;
        }
        return '';
    }
    getEmbed(channel) {
        if (!this.loaded)
            throw new Error('Getting embed before waifu is loaded');
        const img = this.getImage(channel);
        return new discord_js_1.EmbedBuilder({
            fields: [
                {
                    name: `${this.getWFC(channel)} **${this.name} ${this.getGender()} ` +
                        `(Lvl ${this.displayLvl}${this.getUStatus(' ')})**`,
                    value: `__From:__ ${this.origin}\n[Source](${getSource(img)})\n[Raw Image](${img})`,
                    inline: true
                },
            ],
            color: this.fc ? discord_js_1.Colors.Gold : discord_js_1.Colors.LightGrey
        }).setImage(img);
    }
}
exports.Character = Character;
function getSource(img) {
    if (img.match(/^https:\/\/i\.imgur\.(?:com|io)\//)) {
        // Old deprecated imgur - compatibility until migration complete
        return img.slice(0, img.lastIndexOf('.')).replace('//i.', '//');
    }
    else if (img.startsWith(config_1.default.cdn)) {
        // Using our CDN
        return img.replace('/images/', '/source/');
    }
    // Common characters have no source
    return img;
}
exports.getSource = getSource;
/* DATABASE SETUP */
const pool = new pg_1.Pool({
    connectionTimeoutMillis: 2000
});
/* DATABASE CONSTANTS */
// By default, all lists will return a max of 10 characters.
const defaultLimit = 10;
// Chances to get specific rarities:
// Can be changed to a sequence to increase chances.
const special = [50];
// Once user passes this value, brons cost changes
const EXTRA_COST_CNT = 60000;
// Can change brons cost here
function getCostPerPull(cnt, special) {
    // Special = whale, else multi/roll
    if (special)
        return 20;
    else if (cnt >= EXTRA_COST_CNT)
        return 3;
    else
        return 2;
}
exports.getCostPerPull = getCostPerPull;
// Still find this to be the most intuitive for the user
// Generates a query string and params to use my shiny custom
// search order
function sortQueryAndParams(colName, params, name) {
    // Escape percent signs and underscores.
    name = name.replaceAll(/(?<!\\)%/g, '\\%').replaceAll(/(?<!\\)_/g, '\\_');
    // This modifies params to make it all the correct ones
    params.push(`${name}`, `${name} %`, `% ${name}`, `% ${name} %`, `${name}%`, `%${name}`, `%${name}%`);
    return (`WHERE ${colName} ILIKE $${params.length}
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
            ${colName}`);
}
function getClient() {
    return pool.connect().catch(() => {
        // Wrap so we can throw our own error.
        throw new exceptions_1.DatabaseMaintenanceError('Database is currently under maintenance. Please try again later.');
    });
}
// Single queries MUST use this because all single queries are
// automatically wrapped inside a transaction.
async function query(query, values) {
    const client = await getClient();
    try {
        return client.query(query, values).then(res => res.rows);
    }
    finally {
        client.release();
    }
}
async function multi_query(queries, values = [], level = 'READ COMMITTED') {
    const client = await getClient();
    try {
        const res = [];
        await client.query(`BEGIN TRANSACTION ISOLATION LEVEL ${level}`);
        for (const query of queries) {
            res.push(await client.query(query, values.shift()).then(res => res.rows));
        }
        await client.query('COMMIT');
        return res;
    }
    catch (err) {
        await client.query('ROLLBACK');
        throw err;
    }
    finally {
        client.release();
    }
}
function start() {
    // We want to be able to still live even if database is not available.
    pool.on('error', err => {
        // We don't care if the connection is terminated.
        if (err.message.includes('terminating connection due to administrator command'))
            return;
        throw err;
    });
    // 2 in 1, we remove all expired local caches, and check if database works at the same time.
    return pool.query('DELETE FROM local_data WHERE CURRENT_DATE >= expiry').then(() => false, () => true);
}
exports.start = start;
function end() {
    return pool.end();
}
exports.end = end;
function getUidsList(shardId, totalShards) {
    return query(`WITH uids AS (
            SELECT uid FROM (
                SELECT uid FROM user_info
                UNION
                SELECT uid FROM guess_info
            ) A
        )
        
        SELECT uid FROM uids
        LIMIT (SELECT COUNT(*) FROM uids) / $1
        OFFSET (SELECT COUNT(*) FROM uids) / $1 * $2`, [totalShards, shardId]).then(res => res.map(row => row.uid));
}
exports.getUidsList = getUidsList;
/* END DATABASE SETUP */
/* GETTERS/SETTERS FOR DATABASE */
function getUserCount() {
    return query('SELECT COUNT(*) FROM user_info').then(ret => parseInt(ret[0].count));
}
exports.getUserCount = getUserCount;
function getBrons(userID) {
    return query('SELECT brons FROM user_info WHERE uid = $1', [userID]).then(ret => ret[0]?.brons);
}
exports.getBrons = getBrons;
function addBrons(userID, amount) {
    return query('UPDATE user_info SET brons = brons + $2 WHERE uid = $1 RETURNING uid', [userID, amount]).then(res => res.at(0)?.uid);
}
exports.addBrons = addBrons;
function getAndSetDaily(userID) {
    // We will use these constants here
    const dailyAmt = 200;
    const firstSignUp = 1000;
    return multi_query([
        'SELECT collected FROM user_info WHERE uid = $1',
        `INSERT INTO user_info(uid, brons) VALUES ($1, $2)
            ON CONFLICT (uid) DO UPDATE
            SET brons = user_info.brons + $3, collected = TRUE
            WHERE user_info.collected = FALSE
            RETURNING collected`
    ], [[userID], [userID, firstSignUp, dailyAmt]]).then(res => {
        const collect_success = res[1][0]?.collected ?? false;
        // User would exist if res[0][0] exists
        if (res[0][0])
            return { collect_success, amt: dailyAmt };
        return { collect_success, amt: firstSignUp };
    });
}
exports.getAndSetDaily = getAndSetDaily;
function getCollected(userID) {
    return query('SELECT collected FROM user_info WHERE uid = $1', [userID]).then(ret => ret.at(0)?.collected);
}
exports.getCollected = getCollected;
function getWhales(userID) {
    return query('SELECT whales FROM user_info WHERE uid = $1', [userID]).then(ret => ret.at(0)?.whales);
}
exports.getWhales = getWhales;
function getAllCompleted(userID) {
    return query('SELECT origin, count FROM completed_series WHERE uid = $1', [userID]).then(res => new Map(res.map(row => [row.origin, row.count])));
}
exports.getAllCompleted = getAllCompleted;
function getCompleted(userID, origin) {
    return query('SELECT count FROM completed_series WHERE uid = $1 AND origin = $2', [userID, origin]).then(res => res.at(0)?.count);
}
exports.getCompleted = getCompleted;
function setCompleted(userID, origin, count) {
    return query(`INSERT INTO completed_series(uid, origin, count)
            VALUES ($1, $2, $3)
        ON CONFLICT (uid, origin)
        DO UPDATE SET count = EXCLUDED.count`, [userID, origin, count]).then(() => true).catch(err => {
        if (err instanceof exceptions_1.DatabaseMaintenanceError)
            throw err;
        return false;
    });
}
exports.setCompleted = setCompleted;
function getUserLBStats(userID) {
    return query('SELECT brons, idx FROM leaderboard WHERE uid = $1', [userID]).then(res => res.at(0) ? ({ brons: res[0].brons, idx: parseInt(res[0].idx) }) : undefined);
}
exports.getUserLBStats = getUserLBStats;
function getLeaderboards(start) {
    return query('SELECT * FROM leaderboard LIMIT 10 OFFSET $1', [start]).then(res => res.map(row => ({
        uid: row.uid,
        brons: row.brons,
        waifus: parseInt(row.waifus),
        idx: parseInt(row.idx)
    })));
}
exports.getLeaderboards = getLeaderboards;
function getUserStarLBStats(userID) {
    return query('SELECT brons, stars, idx FROM starLeaderboard WHERE uid = $1', [userID]).then(res => res.at(0) ? ({
        brons: res[0].brons,
        stars: parseInt(res[0].stars),
        idx: parseInt(res[0].idx)
    }) : undefined);
}
exports.getUserStarLBStats = getUserStarLBStats;
function getStarLeaderboards(start) {
    return query('SELECT * FROM starLeaderboard LIMIT 10 OFFSET $1', [start]).then(res => res.map(row => ({
        uid: row.uid,
        brons: row.brons,
        stars: parseInt(row.stars),
        idx: parseInt(row.idx)
    })));
}
exports.getStarLeaderboards = getStarLeaderboards;
/**
 * Ensure the waifu provided does not contain old images, only new images that are to be added
 * @throws {Error} If waifu gets too many images
 */
function insertWaifu(waifu) {
    // With this query, we must make sure we are not appending to img array
    // We will return the waifu object, and it will raise an exception
    // if the waifu's images goes out of bounds (due to our check constraint)
    return multi_query([
        `INSERT INTO waifus(name, gender, origin, img, nimg)
                VALUES ($1, $2, $3, $4, $5) 
            ON CONFLICT (name, gender, origin)
            DO UPDATE SET
                img = waifus.img || EXCLUDED.img,
                nimg = waifus.nimg || EXCLUDED.nimg
            RETURNING *`,
        'REFRESH MATERIALIZED VIEW chars'
    ], [[waifu.name, waifu.gender, waifu.origin, waifu.img, waifu.nimg]]).then(res => new Waifu(res[0][0]));
}
exports.insertWaifu = insertWaifu;
function fetchWaifuByDetails(details) {
    return query(`SELECT * FROM chars
        WHERE name = $1 AND gender = $2 AND origin = $3
        AND fc = TRUE LIMIT 1`, [details.name, details.gender, details.origin]).then(res => res.at(0) ? new Waifu(res[0]) : undefined);
}
exports.fetchWaifuByDetails = fetchWaifuByDetails;
function fetchWaifu(wid) {
    return query('SELECT * FROM chars WHERE wid = $1', [wid]).then(res => new Waifu(res[0]));
}
exports.fetchWaifu = fetchWaifu;
function fetchWaifuCount() {
    return query('SELECT COUNT(*) FROM waifus').then(ret => parseInt(ret[0].count));
}
exports.fetchWaifuCount = fetchWaifuCount;
function searchWaifuByName(name) {
    const params = [defaultLimit.toString()];
    return query(`SELECT * FROM (
            SELECT * FROM chars WHERE fc = TRUE
        ) A
        ${sortQueryAndParams('name', params, name)}
        LIMIT $1`, params).then(Waifu.fromRows);
}
exports.searchWaifuByName = searchWaifuByName;
function searchOriginByName(name) {
    const params = [defaultLimit.toString()];
    return query(`SELECT origin FROM (
            SELECT DISTINCT origin FROM chars WHERE fc = TRUE
        ) A
        ${sortQueryAndParams('origin', params, name)}
        LIMIT $1`, params).then(res => res.map(row => row.origin));
}
exports.searchOriginByName = searchOriginByName;
function fetchCompleteOrigin(origin) {
    // Escape percent signs and underscores.
    origin = origin.replaceAll(/(?<!\\)%/g, '\\%').replaceAll(/(?<!\\)_/g, '\\_');
    // Might be weird, but this isn't a search, it is simply
    // a case-insensitive query.
    return query('SELECT origin FROM chars WHERE origin ILIKE $1', [origin]).then(res => res.at(0)?.origin);
}
exports.fetchCompleteOrigin = fetchCompleteOrigin;
function getAnimesCount() {
    return query('SELECT COUNT(DISTINCT origin) FROM waifus').then(ret => parseInt(ret[0].count));
}
exports.getAnimesCount = getAnimesCount;
function getAnimes(start) {
    return query(`SELECT origin, COUNT(*) FROM waifus GROUP BY origin
        ORDER BY origin LIMIT $1 OFFSET $2`, [defaultLimit, start]);
}
exports.getAnimes = getAnimes;
function getAnimeCount(anime) {
    return query('SELECT COUNT(*) FROM waifus WHERE origin = $1', [anime]).then(ret => parseInt(ret[0].count));
}
exports.getAnimeCount = getAnimeCount;
function getAnime(anime) {
    return query(`SELECT * FROM chars
        WHERE origin = $1 AND fc = TRUE
        ORDER BY name`, [anime]).then(Waifu.fromRows);
}
exports.getAnime = getAnime;
function fetchRandomWaifu(amt, level) {
    switch (level) {
        case "easy" /* Levels.EASY */:
            return query(`SELECT name, gender, origin, img, nimg
                    FROM waifus ORDER BY RANDOM() LIMIT $1`, [amt]).then(Waifu.fromRows);
        case "medium" /* Levels.MEDIUM */:
            return query(`SELECT A.* FROM (
                    SELECT name, gender, origin,
                        img[FLOOR(RANDOM() * array_length(img, 1)) + 1] 
                        FROM waifus UNION ALL 
                    SELECT B.* FROM (
                        SELECT name, gender, origin, img FROM commons
                        ORDER BY RANDOM() LIMIT (
                            SELECT COUNT(*) FROM waifus
                        )
                    ) B
                ) A ORDER BY RANDOM() LIMIT $1`, [amt]).then(Waifu.fromRows);
        case "hard" /* Levels.HARD */:
            return query(`SELECT name, gender, origin,
                    img[FLOOR(RANDOM() * array_length(img, 1)) + 1]
                FROM chars ORDER BY RANDOM() LIMIT $1`, [amt]).then(Waifu.fromRows);
    }
    // Says unreachable, however if an invalid level is provided,
    // will be reached.
    throw new Error('Invalid level');
}
exports.fetchRandomWaifu = fetchRandomWaifu;
function fetchAutocollectByIdx(userID, idx) {
    return query(`SELECT * FROM (
            SELECT *, row_number() OVER(
                PARTITION BY id
                ORDER BY idx
            ) AS page
            FROM hoyolab_cookies_list
        ) A WHERE id = $1 AND idx = $2`, [userID, idx]).then(res => res.at(0));
}
exports.fetchAutocollectByIdx = fetchAutocollectByIdx;
function fetchAutocollectByPage(userID, page) {
    return query(`SELECT *, $2::int + 1 AS page FROM hoyolab_cookies_list
            WHERE id = $1
        ORDER BY idx LIMIT 1 OFFSET $2`, [userID, page]).then(res => res.at(0));
}
exports.fetchAutocollectByPage = fetchAutocollectByPage;
function fetchAutocollectLength(userID) {
    return query(`SELECT COUNT(*) FROM hoyolab_cookies_list
            WHERE id = $1`, [userID]).then(res => parseInt(res[0]?.count ?? '0'));
}
exports.fetchAutocollectLength = fetchAutocollectLength;
function toggleAutocollect(userID, game, type, idx) {
    return query(`UPDATE hoyolab_cookies_list
            SET ${game} = $2
            WHERE id = $1 AND idx = $3`, [userID, type, idx]).then(() => { });
}
exports.toggleAutocollect = toggleAutocollect;
async function addCookie(userID, cookie) {
    // Try to cap at 5 cookies
    // This is not guaranteed to always cap at 5, but won't be too far off like 100
    // Better solution is to create a trigger on the table
    const count = await fetchAutocollectLength(userID);
    if (count >= 5)
        return false;
    return query(`INSERT INTO hoyolab_cookies_list (id, cookie)
            VALUES ($1, $2) ON CONFLICT (id, cookie)
        DO NOTHING RETURNING *`, [userID, cookie]).then(res => !!res.at(0));
}
exports.addCookie = addCookie;
function deleteCookie(userID, idx) {
    return query(`DELETE FROM hoyolab_cookies_list
            WHERE id = $1 AND idx = $2 RETURNING *`, [userID, idx] // idx serves as a nice identifier
    ).then(rows => !!rows.at(0));
}
exports.deleteCookie = deleteCookie;
function getEmoji(name) {
    return query('SELECT emoji FROM emojis WHERE name = $1', [name]).then(res => res.at(0)?.emoji);
}
exports.getEmoji = getEmoji;
function addEmoji(name, emoji) {
    return query('INSERT INTO emojis(name, emoji) VALUES ($1, $2) ON CONFLICT (name) DO NOTHING', [name, emoji]);
}
exports.addEmoji = addEmoji;
/* End HoyoLab data */
/* User Chars database */
// Add character(s)
function fetchAllUsers(wid) {
    return query(`SELECT * FROM all_user_chars
            WHERE wid = $1
        ORDER BY lvl DESC, idx
        LIMIT 20`, // Higher limit to fit embed
    [wid]).then(Character.fromRows);
}
exports.fetchAllUsers = fetchAllUsers;
/** NOTE: Return value does not include 'nimg' property. */
function fetchUserUpList(userID) {
    // This fetches the upgradable list, joined w/
    // the user's character list.
    // Wild af query
    return query(`SELECT 
            B.uid,
            A.wid,
            A.name,
            A.gender,
            A.origin,
            COALESCE(B.img, A.img[1]) AS img,
            A.fc,
            B.lvl,
            B.nsfw,
            B.idx
        FROM
        (
            SELECT * FROM chars
            WHERE fc = TRUE AND array_length(img, 1) > 1
            ORDER BY name
            LIMIT 10
        ) A
        LEFT JOIN
        (
            SELECT uid, wid, lvl, fc, img, nimg, nsfw, idx FROM
            get_user_chars($1)
        ) B
        ON A.wid = B.wid`, [userID]).then(Character.fromRows);
    // A little violation with this function,
    // it is actually not a full character,
    // uid might be null.
}
exports.fetchUserUpList = fetchUserUpList;
/** NOTE: Return value does not include 'img' property. */
function fetchUserLewdList(userID) {
    // This fetches the lewd list, joined w/
    // the user's character list.
    /*
     * After a long thought, nlist should not show nimg
     * unless user owns character. Also nlist should
     * only be available in nsfw channels, so we don't
     * have to show img.
     */
    return query(`SELECT 
            B.uid,
            A.wid,
            A.name,
            A.gender,
            A.origin,
            COALESCE(B.nimg, A.img[1]) AS nimg,
            A.fc,
            B.lvl,
            B.nsfw,
            B.idx
        FROM
        (
            SELECT * FROM chars
            WHERE fc = TRUE AND array_length(nimg, 1) > 0
            ORDER BY name
            LIMIT 10
        ) A
        LEFT JOIN
        (
            SELECT uid, wid, lvl, fc, img, nimg, nsfw, idx FROM
            get_user_chars($1)
        ) B
        ON A.wid = B.wid`, [userID]).then(Character.fromRows);
    // A little violation with this function,
    // it is actually not a full character,
    // uid might be null.
}
exports.fetchUserLewdList = fetchUserLewdList;
// For high list
function fetchUserHighCount(userID) {
    return query(`SELECT MAX(idx) FROM
            get_high_user_chars($1)`, [userID]).then(ret => parseInt(ret.at(0)?.max ?? '0'));
}
exports.fetchUserHighCount = fetchUserHighCount;
function fetchUserCharacterCount(userID) {
    return query('SELECT MAX(idx) FROM all_user_chars WHERE uid = $1', [userID]).then(ret => parseInt(ret.at(0)?.max ?? '0'));
}
exports.fetchUserCharacterCount = fetchUserCharacterCount;
function fetchUserCommonCount(userID, { start, end } = {}) {
    let q = 'SELECT COUNT(*) FROM all_user_chars WHERE uid = $1 AND fc = FALSE';
    const params = [userID];
    if (start) {
        params.push(start);
        q += ' AND idx >= $2::bigint';
    }
    if (end) {
        params.push(end);
        q += ` AND idx <= $${params.length}::bigint`;
    }
    return query(q, params).then(ret => parseInt(ret[0].count));
}
exports.fetchUserCommonCount = fetchUserCommonCount;
function fetchUserStarredCount(userID) {
    return query(`SELECT COUNT(*) FROM all_user_chars
            WHERE uid = $1 AND fc = TRUE`, [userID]).then(ret => parseInt(ret[0].count));
}
exports.fetchUserStarredCount = fetchUserStarredCount;
function fetchRandomStarred(userID) {
    // For daily to get a random starred character
    return query(`SELECT * FROM all_user_chars
            WHERE uid = $1 AND fc = TRUE
        ORDER BY RANDOM() LIMIT 1`, [userID]).then(res => res.at(0) ? new Character(res[0]) : undefined);
}
exports.fetchRandomStarred = fetchRandomStarred;
function fetchUserCharacter(userID, wid) {
    if (parseInt(wid) <= 0)
        throw new Error('Invalid wid');
    return query(`SELECT * FROM all_user_chars
            WHERE uid = $1 AND wid = $2`, [userID, wid]).then(res => new Character(res[0]));
}
exports.fetchUserCharacter = fetchUserCharacter;
function fetchUserHighCharacter(userID, wid) {
    return query(`SELECT * FROM get_high_user_chars($1)
            WHERE wid = $2`, [userID, wid]).then(res => new Character(res[0]));
}
exports.fetchUserHighCharacter = fetchUserHighCharacter;
function fetchUserHighestCharacter(userID) {
    return query(`SELECT * FROM all_user_chars
            WHERE uid = $1
        ORDER BY lvl DESC, idx LIMIT 1`, [userID]).then(res => res[0] ? new Character(res[0]) : undefined);
}
exports.fetchUserHighestCharacter = fetchUserHighestCharacter;
function fetchUserCharactersList(userID, start) {
    if (start <= 0)
        throw new Error('Invalid start');
    return query(`SELECT * FROM get_user_chars($1)
        WHERE idx >= $2 LIMIT $3`, [userID, start, defaultLimit]).then(Character.fromRows);
}
exports.fetchUserCharactersList = fetchUserCharactersList;
function fetchUserHighCharactersList(userID, start) {
    if (start <= 0)
        throw new Error('Invalid start');
    return query(`SELECT * FROM get_high_user_chars($1)
        WHERE idx >= $2 LIMIT $3`, [userID, start, defaultLimit]).then(Character.fromRows);
}
exports.fetchUserHighCharactersList = fetchUserHighCharactersList;
function queryUserCharacter(userID, name) {
    const params = [userID, defaultLimit.toString()];
    return query(`SELECT * FROM get_user_chars($1)
        ${sortQueryAndParams('name', params, name)}
        LIMIT $2`, params).then(Character.fromRows);
}
exports.queryUserCharacter = queryUserCharacter;
function queryUserHighCharacter(userID, name) {
    const params = [userID, defaultLimit.toString()];
    return query(`SELECT * FROM get_high_user_chars($1)
        ${sortQueryAndParams('name', params, name)}
        LIMIT $2`, params).then(Character.fromRows);
}
exports.queryUserHighCharacter = queryUserHighCharacter;
function fetchUserAnimeCount(userID, origin) {
    return query(`SELECT COUNT(*) FROM all_user_chars
            WHERE uid = $1 AND origin = $2 AND fc = TRUE`, [userID, origin]).then(ret => parseInt(ret[0].count));
}
exports.fetchUserAnimeCount = fetchUserAnimeCount;
function fetchUserAnimeWids(userID, origin) {
    return query(`SELECT wid FROM all_user_chars
            WHERE uid = $1 AND origin = $2 AND fc = TRUE`, [userID, origin]).then(res => res.map(ret => ret.wid));
}
exports.fetchUserAnimeWids = fetchUserAnimeWids;
function getCommonQuery() {
    return 'SELECT wid FROM chars WHERE fc = FALSE ORDER BY RANDOM() LIMIT 1';
}
function getStarredQuery() {
    return 'SELECT wid FROM chars WHERE fc = TRUE ORDER BY RANDOM() LIMIT 1';
}
function getUpgradableStarredQuery() {
    return `SELECT wid FROM chars
        WHERE fc = TRUE AND array_length(img, 1) > 1
        ORDER BY RANDOM() LIMIT 1`;
}
function generateCharacterQuery(level) {
    const random = Math.floor(Math.random() * 101);
    switch (level) {
        case 0 /* GuaranteeLevel.COMMON */:
            if (special.includes(random)) {
                return getStarredQuery();
            }
            else {
                return getCommonQuery();
            }
        case 1 /* GuaranteeLevel.STARRED */:
            if (special.includes(random)) {
                return getUpgradableStarredQuery();
            }
            else {
                return getStarredQuery();
            }
        case 2 /* GuaranteeLevel.UPGRADABLE */:
            return getUpgradableStarredQuery();
    }
}
// Used for single pulls
async function generateAndAddCharacter(userID, amtTaken) {
    const cnt = await fetchUserCharacterCount(userID);
    const amt = getCostPerPull(cnt, false);
    amtTaken.amt = -amt; // Returning to the front end brons difference
    return multi_query([
        'CALL sub_brons($1, $2, $3)',
        `SELECT * FROM add_character($1,
                (${generateCharacterQuery(0 /* GuaranteeLevel.COMMON */)})
            )`
    ], [[userID, false, amt], [userID]]).then(res => {
        const c = new Character(res[1][0]);
        c.new = res[1][0].new;
        return c;
    }).catch(err => {
        if (err instanceof exceptions_1.DatabaseMaintenanceError)
            throw err;
        else if (err.message.includes('user_info_brons_check'))
            return 'not enough brons';
        else if (err.message.includes('user_not_found_error'))
            return 'you do not have an existing account';
        // This means that nothing happened (ACID).
        return 'there was an error with the database.';
    });
}
exports.generateAndAddCharacter = generateAndAddCharacter;
async function generateAndAddCharacters(userID, special, amtTaken) {
    // special = false - multi
    // special = true - whales
    const PULL_AMT = 10;
    const cnt = await fetchUserCharacterCount(userID);
    const amt = getCostPerPull(cnt, special) * PULL_AMT;
    amtTaken.amt = -amt; // Returning to the front end brons difference
    const queries = ['CALL sub_brons($1, $2, $3)'];
    const params = [[userID, special.toString(), amt.toString()]];
    let qstring = '';
    if (special) {
        // 10 starred pulls, 1 guaranteed upgradable
        for (let i = 0; i < PULL_AMT; ++i) {
            qstring = generateCharacterQuery(1 /* GuaranteeLevel.STARRED */);
            queries.push(`SELECT * FROM add_character($1, (${qstring}))`);
            params.push([userID]);
        }
    }
    else {
        // 10 normal pulls, 1 guaranteed starred
        for (let i = 0; i < PULL_AMT; ++i) {
            qstring = generateCharacterQuery(0 /* GuaranteeLevel.COMMON */);
            queries.push(`SELECT * FROM add_character($1, (${qstring}))`);
            params.push([userID]);
        }
    }
    // Finally, add the guaranteed character.
    qstring = generateCharacterQuery(special ? 2 /* GuaranteeLevel.UPGRADABLE */ : 1 /* GuaranteeLevel.STARRED */);
    queries.push(`SELECT * FROM add_character($1, (${qstring}))`);
    params.push([userID]);
    return multi_query(queries, params).then(res => 
    // Whales has extra query for user_info
    res.splice(1).map(x => {
        const c = new Character(x[0]);
        c.new = x[0].new;
        return c;
    })).catch((err) => {
        if (err instanceof exceptions_1.DatabaseMaintenanceError)
            throw err;
        else if (err.message.includes('user_info_brons_check'))
            return 'not enough brons';
        else if (err.message.includes('whale_fail_error'))
            return 'you already whaled today';
        else if (err.message.includes('user_not_found_error'))
            return 'you do not have an existing account';
        // This means that nothing happened (ACID).
        return 'there was an error with the database.';
    });
}
exports.generateAndAddCharacters = generateAndAddCharacters;
function addUserCharacterLevel(userID, wid, amt) {
    return multi_query([
        'CALL sub_brons($1, FALSE, $2)',
        `UPDATE user_chars SET lvl = lvl + 1
                WHERE uid = $1 AND wid = $2
            RETURNING *`
    ], [[userID, amt], [userID, wid]]).then(() => { }).catch((err) => {
        if (err instanceof exceptions_1.DatabaseMaintenanceError)
            throw err;
        else if (err.message.includes('user_info_brons_check'))
            return 'not enough brons';
        else if (err.message.includes('user_not_found_error'))
            return 'you do not have an existing account';
        // This means that nothing happened (ACID).
        return 'there was an error with the database.';
    });
}
function setUserCharacterImage(userID, wid, img) {
    return multi_query([
        `UPDATE user_chars
                SET _img = $3
            WHERE uid = $1 AND wid = $2 AND
            wid IN (
                SELECT wid FROM chars WHERE
                $3 <= array_length(img, 1)
            ) RETURNING _img`,
        'SELECT img FROM all_user_chars WHERE uid = $1 AND wid = $2'
    ], [[userID, wid, img], [userID, wid]]).then(res => ({ _img: res[0][0]._img, img: res[1][0].img }));
}
function setUserCharacterNImage(userID, wid, nimg) {
    return multi_query([
        `UPDATE user_chars
                SET _nimg = $3
            WHERE uid = $1 AND wid = $2 AND
            wid IN (
                SELECT wid FROM chars WHERE
                $3 <= COALESCE(array_length(nimg, 1), 0)
            ) RETURNING _nimg`,
        'SELECT _nimg, nimg FROM all_user_chars WHERE uid = $1 AND wid = $2'
    ], [[userID, wid, nimg], [userID, wid]]).then(res => ({ _nimg: res[0][0]._nimg, nimg: res[1][0].nimg }));
}
function setUserCharacterNsfw(userID, wid, nsfw) {
    return multi_query([
        `UPDATE user_chars
                SET nsfw = $3
            WHERE uid = $1 AND wid = $2 AND
            wid IN (
                SELECT wid FROM chars WHERE
                COALESCE(array_length(nimg, 1), 0) >= 1
            ) RETURNING nsfw`,
        `UPDATE user_chars SET _nimg = 1
            WHERE nsfw = TRUE AND _nimg = 0`,
        `SELECT _nimg, nimg, nsfw FROM all_user_chars
            WHERE uid = $1 AND wid = $2`
    ], [[userID, wid, nsfw], [], [userID, wid]]).then(res => [res[0][0], res[2][0]]);
}
async function deleteUserCharacter(char) {
    // Just in case, retrieve index; I'm paranoid.
    const { idx } = await query('SELECT idx FROM user_chars WHERE uid = $1 AND wid = $2', [char.uid, char.wid]).then(res => res[0]);
    // Note that we didn't need to also include index,
    // but we do it just in case; will be helpful when
    // updating the index for other chars
    return multi_query([
        `DELETE FROM user_chars
            WHERE uid = $1 AND wid = $2 AND idx = $3
            RETURNING *`,
        `UPDATE user_chars SET idx = idx - 1
            WHERE uid = $1 AND idx >= $2`
    ], [[char.uid, char.wid, idx], [char.uid, idx]]).then(res => res[0].length);
}
exports.deleteUserCharacter = deleteUserCharacter;
async function deleteUserCommonCharacters(userID, { start = 1, end } = {}) {
    let q = 'DELETE FROM user_chars WHERE uid = $1 AND fc = FALSE AND idx >= $2::bigint';
    const params = [userID, start.toString()];
    if (end) {
        params.push(end.toString());
        q += ' AND idx <= $3::bigint';
    }
    q += ' RETURNING *';
    return multi_query([q, 'CALL repair_index($1)'], [params, [userID]]).then(res => res[0].length);
}
exports.deleteUserCommonCharacters = deleteUserCommonCharacters;
function moveUserCharacter(char, pos) {
    // Length is not 1 if pos is out of range.
    return multi_query([
        'SET CONSTRAINTS ALL DEFERRED',
        `UPDATE user_chars
                SET idx = $4
            WHERE uid = $1 AND wid = $2 AND idx = $3 AND
                $3 IN (SELECT idx FROM user_chars WHERE uid = $1)
            RETURNING *`,
        'CALL repair_index($1)'
    ], [[], [char.uid, char.wid, char.idx, pos], [char.uid]]).then(ret => ret[1].length === 1);
}
exports.moveUserCharacter = moveUserCharacter;
function swapUserCharacters(char1, char2) {
    return multi_query([
        'SET CONSTRAINTS ALL DEFERRED',
        `UPDATE user_chars
                SET idx = $4
            WHERE uid = $1 AND wid = $2 AND idx = $3`,
        `UPDATE user_chars
                SET idx = $4
            WHERE uid = $1 AND wid = $2 AND idx = $3`,
    ], [
        [],
        [char1.uid, char1.wid, char1.idx, char2.idx],
        [char2.uid, char2.wid, char2.idx, char1.idx]
    ]).then(() => { });
}
exports.swapUserCharacters = swapUserCharacters;
function getGuild(gid) {
    return query('SELECT * FROM guild_new_member WHERE gid = $1', [gid]).then(res => res.at(0));
}
exports.getGuild = getGuild;
function setGuild({ gid, msg, roleid, channelid }) {
    // Set any to null to remove instead of undefined.
    if (channelid === undefined && msg === undefined &&
        roleid === undefined)
        throw new Error('Set Guild no settings');
    const params = [gid];
    let p = '';
    let cols = '';
    let colUpdates = '';
    if (msg !== undefined) {
        params.push(msg);
        p += ', $2';
        cols += ', msg';
        colUpdates += 'msg = EXCLUDED.msg';
    }
    if (roleid !== undefined) {
        params.push(roleid);
        p += `, $${params.length}`;
        cols += ', roleid';
        if (colUpdates !== '')
            colUpdates += ', ';
        colUpdates += 'roleid = EXCLUDED.roleid';
    }
    if (channelid !== undefined) {
        params.push(channelid);
        p += `, $${params.length}`;
        cols += ', channelid';
        if (colUpdates !== '')
            colUpdates += ', ';
        colUpdates += 'channelid = EXCLUDED.channelid';
    }
    return query(`INSERT INTO guild_new_member(gid${cols})
            VALUES($1${p}) ON CONFLICT (gid)
        DO UPDATE SET ${colUpdates}`, params).then(() => { });
}
exports.setGuild = setGuild;
function getGuessStreaks(userID) {
    return query('SELECT * FROM guess_info WHERE uid = $1', [userID]).then(res => res.at(0));
}
exports.getGuessStreaks = getGuessStreaks;
function addOneToGuessStreak(userID, level) {
    return query(`INSERT INTO guess_info(uid, ${level}_streak, ${level}_max_streak)
            VALUES($1, $2, $3) ON CONFLICT (uid)
        DO UPDATE SET ${level}_streak = guess_info.${level}_streak + 1
        RETURNING ${level}_streak, ${level}_max_streak`, [userID, 1, 1]).then(res => {
        if (!res)
            throw new Error(`Guess streak ${level} not found`);
        return {
            streak: res[0][`${level}_streak`],
            max: res[0][`${level}_max_streak`]
        };
    });
}
exports.addOneToGuessStreak = addOneToGuessStreak;
function resetGuessStreak(userID, level) {
    return query(`UPDATE guess_info SET ${level}_streak = 0
            WHERE uid = $1`, [userID]).then(() => { });
}
exports.resetGuessStreak = resetGuessStreak;
/* Special functions for storing local data */
class Cache {
    constructor(cmd) {
        this.cmd = cmd;
    }
    get(id) {
        return query('SELECT data FROM local_data WHERE cmd = $1 AND id = $2', [this.cmd, id]).then(res => res.at(0)?.data);
    }
    set(id, data, expiry) {
        return query(`INSERT INTO local_data(cmd, id, data, expiry) VALUES ($1, $2, $3, $4)
            ON CONFLICT (cmd, id) DO UPDATE SET
                data = EXCLUDED.data,
                expiry = COALESCE(EXCLUDED.expiry, local_data.expiry)`, [this.cmd, id, data, expiry]).then(() => { });
    }
}
exports.Cache = Cache;
// We use this function to delete when any subscribed object is deleted
function deleteLocalData(id) {
    return query('DELETE FROM local_data WHERE id = $1', [id]).then(() => { }).catch(() => { });
}
exports.deleteLocalData = deleteLocalData;
//# sourceMappingURL=database.js.map