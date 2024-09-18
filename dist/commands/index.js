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
exports.mod = exports.minigame = exports.help = exports.fun = exports.anime = exports.admin = void 0;
exports.admin = Promise.resolve().then(() => __importStar(require('./admin_commands')));
exports.anime = Promise.resolve().then(() => __importStar(require('./anime_commands')));
exports.fun = Promise.resolve().then(() => __importStar(require('./fun_commands')));
exports.help = Promise.resolve().then(() => __importStar(require('./help_command')));
exports.minigame = Promise.resolve().then(() => __importStar(require('./minigame_commands')));
exports.mod = Promise.resolve().then(() => __importStar(require('./mod_commands')));
// Disabling all music commands atm, there is currently an issue with the player interacting with youtube's API
// export const music = import('./music_commands') as unknown as CommandFile;
//# sourceMappingURL=index.js.map