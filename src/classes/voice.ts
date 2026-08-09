import { ChannelType, GuildMember, GuildTextBasedChannel, Message, User, VoiceBasedChannel } from 'discord.js';
import {
    AudioPlayer,
    AudioResource,
    createAudioPlayer,
    createAudioResource,
    DiscordGatewayAdapterCreator,
    entersState,
    getVoiceConnection,
    joinVoiceChannel,
    StreamType,
    VoiceConnectionStatus,
} from '@discordjs/voice';
import { FFmpeg } from 'prism-media';
import { resolveStream, StreamTarget, TrackInfo } from '@modules/ytdlp';
import { VOID } from '@modules/utils';

/**
 * ffmpeg flags that have to precede -i because they configure the input protocol.
 * The CDN drops long lived connections, and without these a single dropped packet
 * silently truncates the song; the stream URL stays valid, so retrying works.
 */
const FFMPEG_INPUT_ARGS = [
    '-reconnect', '1',
    '-reconnect_streamed', '1',
    '-reconnect_delay_max', '5',
    '-analyzeduration', '0',
    // Not 0: silencing ffmpeg turns any playback failure into an unexplained "End of queue".
    '-loglevel', 'error',
];

const FFMPEG_STDERR_TAIL = 2000;

/**
 * Wraps a resolved stream in Ogg so @discordjs/voice can demux straight to Opus.
 */
function createOpusStream(source: StreamTarget) {
    const codecArgs = source.acodec === 'opus'
        ? ['-c:a', 'copy']
        : ['-c:a', 'libopus', '-b:a', '128k', '-ar', '48000', '-ac', '2'];
    const stream = new FFmpeg({
        args: [
            ...FFMPEG_INPUT_ARGS,
            '-i', source.streamUrl,
            '-vn',
            ...codecArgs,
            '-f', 'opus',
        ],
    });

    // prism-media never inspects the exit code, so a dead ffmpeg closes stdout with zero
    // bytes and is indistinguishable from a song that played out.
    const child = stream.process;
    let stderr = '';
    child.stderr?.on('data', (chunk: Buffer) => {
        stderr = (stderr + chunk.toString()).slice(-FFMPEG_STDERR_TAIL);
    });
    child.once('close', (code, signal) => {
        // Skipping or stopping SIGKILLs ffmpeg, and prism clears .process first.
        if (signal || stream.process !== child) return;
        if (code) console.error(`ffmpeg exited ${code} playing ${source.webpageUrl}\n${stderr.trim()}`);
    });
    return stream;
}

export const enum LoopType {
    none = 'NONE',
    one = 'ONE',
    all = 'ALL',
}

export class Song {
    albumUrl!: string;
    url!: string;
    playUrl!: string;
    title!: string;
    linkedTitle!: string;
    thumbnail!: string | null;
    duration!: number;
    id!: number;
    user!: User;
    notFound: boolean; // When infoData is undefined
    invalid: boolean; // When channel is not NSFW attempts to play NSFW song

    constructor(
        infoData: TrackInfo | undefined,
        uniqueId: number,
        isNsfw: boolean,
        playlist_url?: string,
    ) {
        this.invalid = true;
        this.notFound = true;
        if (!infoData) return;
        this.notFound = false;
        if (infoData.ageRestricted && !isNsfw) return;
        this.url = infoData.url;
        this.playUrl = infoData.url;
        this.albumUrl = playlist_url ?? infoData.url;
        this.title = infoData.title;
        this.linkedTitle = `[${this.title}](${this.url})`;
        this.thumbnail = infoData.thumbnail;
        this.duration = infoData.durationInSec;
        this.id = uniqueId;
        this.invalid = false;
    }
}

export class GuildVoice {
    textChannel: GuildTextBasedChannel;
    voiceChannel: VoiceBasedChannel;
    host: GuildMember;
    player: AudioPlayer;
    loop: LoopType;
    started: boolean;
    paused: boolean;
    currentSongResource: AudioResource | null;
    voted: GuildMember[];
    votingMessage: Message | null;
    fullQueue: Song[];
    songs: Song[];
    IDCounter: number;

    constructor(
        textChannel: GuildTextBasedChannel,
        voiceChannel: VoiceBasedChannel,
        host: GuildMember,
    ) {
        this.textChannel = textChannel;
        this.voiceChannel = voiceChannel;
        this.host = host;
        this.player = createAudioPlayer();
        this.loop = LoopType.none;
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

    join(voiceChannel: VoiceBasedChannel) {
        return joinVoiceChannel({
            channelId: voiceChannel.id,
            guildId: voiceChannel.guildId,
            adapterCreator: voiceChannel.guild.voiceAdapterCreator as DiscordGatewayAdapterCreator,
        });
    }

    // This is actually only called during in ctor

    // Added extra parameter specifically for reset.
    reset(songs: Song[] = []) {
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
        if (this.loop === LoopType.all) {
            this.songs.shift();
            // Refill queue for all
            if (this.songs.length === 0) {
                this.songs = this.fullQueue.slice();
            }
        } else if (this.loop === LoopType.none) {
            this.songs.shift();
        }
        // Empty playlist
        if (!this.songs.length) this.reset();
    }

    getCurrentSong() {
        return this.songs.at(0);
    }

    async playNextSong(): Promise<boolean> {
        if (this.started) this.shiftToNextSong();
        const song = this.getCurrentSong();
        if (!song) return this.started = false;
        else this.started = true;
        const source = await resolveStream(song.playUrl);
        if (!source) {
            // Forcefully skip song on error
            if (this.loop === LoopType.one) {
                this.songs.shift();
            }
            return this.playNextSong();
        }
        // yt-dlp has already exited by this point. ffmpeg pulls from the CDN URL
        // directly, so nothing holds a Python process open for the whole song.
        // Destroying playStream tears down the whole pipeline, so the player
        // stopping or skipping kills this ffmpeg rather than leaking it.
        this.currentSongResource = createAudioResource(createOpusStream(source), {
            inputType: StreamType.OggOpus,
        });
        this.currentSongResource.playStream.on('error', e => {
            console.error(e);
        });
        this.player.play(this.currentSongResource);
        this.voted = [];
        this.votingMessage = null;
        return true;
    }

    getSong(idx: number) {
        return this.fullQueue[idx];
    }

    /** -1 Represents bad index, 0 means trying to remove current song, 1 means successful */
    removeSong(idx: number) {
        // -1 Represents bad index, 0 means trying to remove current song from queue
        if (idx >= this.fullQueue.length) return -1;
        const currIdx = this.fullQueue.findIndex(song => song.id === this.songs.at(0)?.id);
        if (idx === currIdx) return 0;
        const songIdx = this.songs.findIndex(s => s.id === this.fullQueue[idx].id);
        if (songIdx !== -1) this.songs.splice(songIdx, 1);
        this.fullQueue.splice(idx, 1);
        // 1 means successful
        return 1;
    }

    _shuffleFullQueue() {
        for (let i = this.fullQueue.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() *
                (
                    i + 1
                ));
            [this.fullQueue[i], this.fullQueue[j]] = [this.fullQueue[j], this.fullQueue[i]];
        }
    }

    shuffle() {
        if (this.songs.length === 0) return this._shuffleFullQueue();
        const currIdx = this.fullQueue.findIndex(song => song.id === this.songs[0].id);
        this.fullQueue.splice(currIdx, 1);
        this._shuffleFullQueue();
        this.fullQueue.splice(currIdx, 0, this.songs[0]);
        // Update songs to match fullQueue
        this.songs = this.fullQueue.slice(currIdx);
    }

    destroy() {
        getVoiceConnection(this.voiceChannel.guild.id)?.destroy();
        GuildVoices.delete(this.voiceChannel.guildId);
    }

    // create massive ID numbers for songs in different guilds
    getUniqueId() {
        return this.IDCounter++;
    }

    // Give a unique id for the guild's songs, so we don't

    // Separated to make ctor more clear.
    private connectAndListen(voiceChannel: VoiceBasedChannel) {
        const connection = this.join(voiceChannel);
        connection.subscribe(this.player);

        // Deliberately not async: a throw here is an unhandled rejection that takes the
        // shard down. The player goes Idle after an error, so the next song follows anyway.
        this.player.on('error', err => {
            console.error(err);
            this.textChannel.send({
                content:
                    'Something bad happened while I was playing...\n' +
                    'Sorry! I will continue to play the next song.',
            }).catch(VOID);
        });
        connection.on(VoiceConnectionStatus.Ready, async () => {
            // Get latest voice channel info
            this.voiceChannel = await this.voiceChannel.guild.channels.fetch(
                connection.joinConfig.channelId!,
            ) as VoiceBasedChannel;
            const me = this.voiceChannel.guild.members.me!;
            // This makes it so that I can play music in stage channels
            if (this.voiceChannel.type === ChannelType.GuildStageVoice) {
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
                                `${this.voiceChannel} so I'm leaving... 😭`,
                        });
                    }
                } else {
                    this.host = newHost;
                }
            }
            return this.textChannel.send({
                content: `Connected to ${this.voiceChannel}\nHost is ${this.host}`,
                allowedMentions: { users: [] },
            });
        });

        // Some cute error handling when random disconnection.
        connection.on(VoiceConnectionStatus.Disconnected, async () => {
            try {
                await Promise.race([
                    entersState(connection, VoiceConnectionStatus.Signalling, 5000),
                    entersState(connection, VoiceConnectionStatus.Connecting, 5000),
                ]);
                // Seems to be reconnecting to a new channel - ignore disconnect.
            } catch (err) {
                // Seems to be a real disconnect which SHOULDN'T be recovered from
                this.destroy();
            }
        });
    }
}

export const GuildVoices = new Map<string, GuildVoice>();
