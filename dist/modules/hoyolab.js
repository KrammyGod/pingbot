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
Object.defineProperty(exports, "__esModule", { value: true });
exports.getHoyoLabData = exports.getUID = void 0;
const cookie_1 = require("cookie");
const userAgent = 'Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) ' +
    'AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E150';
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
        'Accept-Language': 'en-US,en;q=0.9',
        'Cookie': cookie,
        'X-Rpc-Language': 'en-us',
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
// Allows for testing API route with cookie input.
if (require.main === module) {
    // Conditional import
    Promise.resolve().then(() => __importStar(require('readline'))).then(readline => {
        const rl = readline.createInterface({
            input: process.stdin,
            output: process.stdout
        });
        // Challenge: don't use async/await
        rl.question('Enter cookie or blank to stop: ', function getData(ans) {
            if (!ans.length)
                return rl.close();
            getHoyoLabData(ans).then(data => {
                console.dir(data, { colors: true, depth: null, compact: false });
                rl.question('Enter cookie or blank to stop: ', getData);
            });
        });
    });
}
//# sourceMappingURL=hoyolab.js.map