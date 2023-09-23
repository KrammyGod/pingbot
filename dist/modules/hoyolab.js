"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHoyoLabData = exports.getUID = void 0;
const cookie_1 = require("cookie");
const userAgent = `
    Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E150
`;
const roleURL = 'https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard?uid=';
class HoyoAccountInfo {
    constructor(uid, list) {
        this.uid = uid;
        this.list = list;
    }
    infoString(game_id) {
        const gameInfo = this.list.find(g => g.game_id === game_id);
        let game_name = '';
        switch (game_id) {
            case 1:
                game_name = 'Honkai Impact 3rd';
                break;
            case 2:
                game_name = 'Genshin Impact';
                break;
            case 6:
                game_name = 'Honkai Star Rail';
                break;
            default:
                game_name = 'Unknown Game';
        }
        if (!gameInfo)
            return null;
        return `**${game_name}:**\n` +
            `> [${gameInfo.region_name}] ` +
            `**[${gameInfo.nickname}](${gameInfo.url})**\n` +
            `> **UID:** ${gameInfo.game_role_id}\n` +
            `> **Level:** ${gameInfo.level}\n`;
    }
    loadAllGames({ honkaiStatus, genshinStatus, starrailStatus } = {}) {
        let retval = '';
        let infoStr = this.infoString(1);
        const games = {};
        if (infoStr) {
            retval += infoStr + (honkaiStatus ?? '');
            games.HI3 = true;
        }
        infoStr = this.infoString(2);
        if (infoStr) {
            retval += infoStr + (genshinStatus ?? '');
            games.GI = true;
        }
        infoStr = this.infoString(6);
        if (infoStr) {
            retval += infoStr + (starrailStatus ?? '');
            games.HSR = true;
        }
        return { retval, games };
    }
}
function getUID(cookie) {
    if (!cookie)
        return '';
    const cookieObj = (0, cookie_1.parse)(cookie);
    return cookieObj?.account_id ?? cookieObj?.ltuid ?? cookieObj?.account_id_v2 ?? cookieObj?.ltuid_v2;
}
exports.getUID = getUID;
async function getHoyoLabData(cookie) {
    if (!cookie)
        return null;
    const headers = {
        'User-Agent': userAgent,
        'Accept-Encoding': 'gzip, deflate, br',
        'Cookie': cookie
    };
    const uid = getUID(cookie);
    const info = await fetch(roleURL + uid, { headers })
        .then(res => res.json())
        .then(res => res.data?.list);
    if (info) {
        return new HoyoAccountInfo(uid, info);
    }
    return null;
}
exports.getHoyoLabData = getHoyoLabData;
//# sourceMappingURL=hoyolab.js.map