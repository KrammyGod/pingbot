import { parse } from 'cookie';

const userAgent = `
    Mozilla/5.0 (iPhone; CPU iPhone OS 14_0_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E150
`;
const roleURL = 'https://bbs-api-os.hoyolab.com/game_record/card/wapi/getGameRecordCard?uid=';

// Normally would use zod or other verifying library
// however unnecessary for this.
type GameAccountInfo = {
    has_role: boolean;
    game_id: number;            // 1 = HI3, 2 = Genshin, 6 = StarRail
    game_role_id: string;       // User's in-game uid
    nickname: string;
    region: string;             // eg. "os_usa"
    level: number;
    background_image: string;
    is_public: boolean;
    region_name: string;        // eg. "America Server"
    url: string;                // brings to game profile
};

class HoyoAccountInfo {
    uid: string;
    list: GameAccountInfo[];

    constructor(uid: string, list: GameAccountInfo[]) {
        this.uid = uid;
        this.list = list;
    }

    private infoString(game_id: number) {
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
        if (!gameInfo) return null;
        return `**${game_name}:**\n` +
            `> [${gameInfo.region_name}] ` +
            `**[${gameInfo.nickname}](${gameInfo.url})**\n` +
            `> **UID:** ${gameInfo.game_role_id}\n` +
            `> **Level:** ${gameInfo.level}\n`;
    }

    loadAllGames({
        honkaiStatus, genshinStatus, starrailStatus
    }: {
        honkaiStatus?: string,
        genshinStatus?: string,
        starrailStatus?: string
    } = {}) {
        let retval = '';
        let infoStr = this.infoString(1);
        const games: { HI3?: boolean, GI?: boolean, HSR?: boolean }  = {};
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

export function getUID(cookie?: string) {
    if (!cookie) return '';
    const cookieObj = parse(cookie);
    return cookieObj?.account_id ?? cookieObj?.ltuid ?? cookieObj?.account_id_v2 ?? cookieObj?.ltuid_v2;
}

export async function getHoyoLabData(cookie?: string) {
    if (!cookie) return null;
    const headers = {
        'User-Agent': userAgent,
        'Accept-Encoding': 'gzip, deflate, br',
        'Cookie': cookie
    };
    const uid = getUID(cookie);
    const info = await fetch(roleURL + uid, { headers })
        .then(res => res.json())
        .then(res => res.data?.list as GameAccountInfo[]);
    if (info) {
        return new HoyoAccountInfo(uid, info);
    }
    return null;
}
