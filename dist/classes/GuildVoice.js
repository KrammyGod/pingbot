"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.Song = void 0;
const play_dl_1 = __importDefault(require("play-dl"));
const discord_js_1 = require("discord.js");
const client_1 = require("./client");
const play_dl_2 = require("play-dl");
const voice_1 = require("@discordjs/voice");
class Song {
    constructor(infoData, uniqueId, isNsfw, playlist_url) {
        this.invalid = true;
        this.notFound = true;
        if (!infoData)
            return;
        this.notFound = false;
        if (infoData instanceof play_dl_2.SpotifyTrack) {
            if (infoData.explicit && !isNsfw)
                return;
            this.url = infoData.url;
            this.playUrl = infoData.url;
            this.albumUrl = playlist_url ?? infoData.url;
            this.title = infoData.name;
            this.linkedTitle = `[${this.title}](${this.url})`;
            this.thumbnail = infoData.thumbnail?.url ?? null;
            this.duration = infoData.durationInSec;
            this.artists = infoData.artists.map(a => a.name).join(', ');
            this.id = uniqueId;
            this.invalid = false;
        }
        else if (!infoData.discretionAdvised || isNsfw) {
            this.url = infoData.url;
            this.playUrl = infoData.url;
            this.albumUrl = playlist_url ?? infoData.url;
            this.title = infoData.title ?? '';
            this.linkedTitle = `[${this.title}](${this.url})`;
            this.thumbnail = this.findBestThumbnail(infoData.thumbnails);
            this.duration = infoData.durationInSec;
            this.id = uniqueId;
            this.invalid = false;
        }
    }
    findBestThumbnail(thumbnails) {
        thumbnails.sort((thumb1, thumb2) => {
            const thumb1dims = thumb1.width * thumb1.height;
            const thumb2dims = thumb2.width * thumb2.height;
            return thumb2dims - thumb1dims;
        });
        return thumbnails.at(0)?.url ?? null;
    }
}
exports.Song = Song;
class GuildVoice {
    constructor(textChannel, voiceChannel, host) {
        this.textChannel = textChannel;
        this.voiceChannel = voiceChannel;
        this.host = host;
        this.player = (0, voice_1.createAudioPlayer)();
        this.loop = "NONE" /* LoopType.none */;
        this.started = false;
        this.paused = false;
        this.currentSongResource = null;
        this.voted = [];
        this.votingMessage = null;
        this.fullQueue = [];
        this.songs = [];
        this.IDCounter = 0;
        this.connectAndListen(voiceChannel);
    }
    join(voiceChannel) {
        return (0, voice_1.joinVoiceChannel)({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator
        });
    }
    // This is actually only called during in ctor
    // Separated to make ctor more clear.
    connectAndListen(voiceChannel) {
        const connection = this.join(voiceChannel);
        connection.subscribe(this.player);
        this.player.on('error', async (err) => {
            await this.textChannel.send({
                content: 'Something bad happended while I was playing...\n' +
                    'Sorry! I will continue to play the next song.'
            });
            throw err;
        });
        connection.on(voice_1.VoiceConnectionStatus.Ready, async () => {
            // Get latest voice channel info
            this.voiceChannel = await this.voiceChannel.guild.channels.fetch(connection.joinConfig.channelId);
            const me = this.voiceChannel.guild.members.me;
            // This makes it so that I can play music in stage channels
            if (this.voiceChannel.type === discord_js_1.ChannelType.GuildStageVoice) {
                await me.voice.setSuppressed(false);
            }
            const members = this.voiceChannel.members.filter(m => !m.user.bot);
            const host = members.get(this.host.id);
            if (!host) {
                const newHost = members.at(Math.floor(Math.random() * members.size));
                // No more members in channel, so get ready for me to be host.
                if (!newHost) {
                    this.host = me;
                    // If it hadn't started/finished, and then moved, then we can safely disconnect.
                    if (!this.started || this.paused) {
                        this.destroy();
                        return this.textChannel.send({
                            content: 'No one wants to listen to me in ' +
                                `${this.voiceChannel} so I'm leaving... 😭`
                        });
                    }
                }
                else {
                    this.host = newHost;
                }
            }
            return this.textChannel.send({
                content: `Connected to ${this.voiceChannel}\nHost is ${this.host}`,
                allowedMentions: { users: [] }
            });
        });
        // Some cute error handling when random disconnection.
        connection.on(voice_1.VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    (0, voice_1.entersState)(connection, voice_1.VoiceConnectionStatus.Signalling, 5000),
                    (0, voice_1.entersState)(connection, voice_1.VoiceConnectionStatus.Connecting, 5000)
                ]);
                // Seems to be reconecting to a new channel - ignore disconnect.
            }
            catch (err) {
                err;
                // Seems to be a real disconnect which SHOULDN'T be recovered from
                this.destroy();
            }
        });
    }
    // Added extra parameter specifically for reset.
    reset(songs = []) {
        this.started = false;
        this.paused = false;
        this.currentSongResource = null;
        this.songs = songs;
        this.player.stop();
    }
    fullReset() {
        // Clearing the entire queue vs ending a song
        this.reset();
        this.fullQueue = [];
        this.IDCounter = 0;
    }
    shiftToNextSong() {
        if (this.loop === "ALL" /* LoopType.all */) {
            this.songs.shift();
            // Refill queue for all
            if (this.songs.length === 0) {
                this.songs = this.fullQueue.slice();
            }
        }
        else if (this.loop === "NONE" /* LoopType.none */) {
            this.songs.shift();
        }
        // Empty playlist
        if (!this.songs.length)
            this.reset();
    }
    getCurrentSong() { return this.songs.at(0); }
    async playNextSong() {
        if (this.started)
            this.shiftToNextSong();
        const song = this.getCurrentSong();
        if (!song)
            return this.started = false;
        else
            this.started = true;
        if (song.artists) {
            const info = await play_dl_1.default.search(`${song.title} by ${song.artists}`, {
                source: { youtube: 'video' },
                limit: 1,
                unblurNSFWThumbnails: true // We wouldn't have added if it wasn't NSFW allowed
            }).then(res => res.at(0)).catch(() => undefined);
            if (info) {
                song.playUrl = info.url; // Different url to actually stream the song
                song.duration = info.durationInSec;
                song.artists = undefined; // So we don't repeatedly search for this song.
            }
            else {
                // Forcibly skip song if we can't find details of it.
                if (this.loop === "ONE" /* LoopType.one */) {
                    this.songs.shift();
                }
                return this.playNextSong();
            }
        }
        const source = await play_dl_1.default.stream(song.playUrl).catch(() => { });
        if (!source) {
            // Forcefully skip song on error
            if (this.loop === "ONE" /* LoopType.one */) {
                this.songs.shift();
            }
            return this.playNextSong();
        }
        source.stream.on('error', e => {
            console.error(e);
        });
        this.currentSongResource = (0, voice_1.createAudioResource)(source.stream, {
            inputType: source.type
        });
        this.player.play(this.currentSongResource);
        this.voted = [];
        this.votingMessage = null;
        return true;
    }
    getSong(idx) { return this.fullQueue[idx]; }
    /** -1 Represents bad index, 0 means trying to remove current song, 1 means successful */
    removeSong(idx) {
        // -1 Represents bad index, 0 means trying to remove current song from queue
        if (idx >= this.fullQueue.length)
            return -1;
        const currIdx = this.fullQueue.findIndex(song => song.id === this.songs.at(0)?.id);
        if (idx === currIdx)
            return 0;
        const songIdx = this.songs.findIndex(s => s.id === this.fullQueue[idx].id);
        if (songIdx !== -1)
            this.songs.splice(songIdx, 1);
        this.fullQueue.splice(idx, 1);
        // 1 means successful
        return 1;
    }
    _shuffleFullQueue() {
        for (let i = this.fullQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [this.fullQueue[i], this.fullQueue[j]] = [this.fullQueue[j], this.fullQueue[i]];
        }
    }
    shuffle() {
        if (this.songs.length === 0)
            return this._shuffleFullQueue();
        const currIdx = this.fullQueue.findIndex(song => song.id === this.songs[0].id);
        this.fullQueue.splice(currIdx, 1);
        this._shuffleFullQueue();
        this.fullQueue.splice(currIdx, 0, this.songs[0]);
        // Update songs to match fullQueue
        this.songs = this.fullQueue.slice(currIdx);
    }
    destroy() {
        (0, voice_1.getVoiceConnection)(this.voiceChannel.guild.id)?.destroy();
        client_1.GuildVoices.delete(this.voiceChannel.guildId);
    }
    // Give a unique id for the guild's songs so we dont
    // create massive ID numbers for songs in different guilds
    getUniqueId() { return this.IDCounter++; }
}
exports.default = GuildVoice;
//# sourceMappingURL=GuildVoice.js.map