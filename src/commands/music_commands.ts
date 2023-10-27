import util from 'util';
import Play from 'play-dl';
import GuildVoice from '@classes/GuildVoice';
import * as Utils from '@modules/utils';
import { Song, LoopType } from '@classes/GuildVoice';
import { GuildVoices, CustomClient } from '@classes/client';
import { AudioPlayerStatus } from '@discordjs/voice';
import {
    ActionRowBuilder, ButtonBuilder, ButtonStyle,
    Colors, ComponentType, EmbedBuilder, GuildMember,
    ModalBuilder, PermissionsBitField, SlashCommandBuilder,
    SlashCommandSubcommandBuilder,
    SlashCommandSubcommandGroupBuilder,
    TextInputBuilder, TextInputStyle
} from 'discord.js';
import type DTypes from 'discord.js';
import type * as PlayTypes from 'play-dl';
import type { SlashCommand, SlashSubcommand, SlashSubcommandGroup } from '@classes/client';

export const name = 'Music';
export const desc = 'This category contains commands for playing music!';

function number_to_date_string(num: number) {
    const date = new Date(0);
    date.setSeconds(num);
    // Over a day, show days AND hours
    if (num >= 24 * 3600) {
        // Yes, I came up with this myself...
        return `${`0${Math.floor(num / (24 * 3600))}`.slice(-2)}:${date.toISOString().slice(11, 19)}`;
    }
    // Strip hour if its 00
    return date.toISOString().slice(11, 19).replace(/^00:/, '');
}

async function get_member(interaction: DTypes.BaseInteraction) {
    let member = interaction.member;
    if (!(member instanceof GuildMember)) {
        member = await interaction.guild!.members.fetch(member?.user.id ?? '0').catch(() => null);
        if (!member) {
            const reply = {
                content: 'I was unable to fetch your details. Please report this to the support server!',
                ephemeral: true
            };
            return interaction.isRepliable() ?
                interaction.replied || interaction.deferred ?
                    interaction.reply(reply).then(() => null) :
                    interaction.followUp(reply).then(() => null) :
                null;
        }
    }
    return member;
}

// This function will pretty much always be called to validate
// if music commands can be used.
async function member_voice_valid(interaction: DTypes.ChatInputCommandInteraction) {
    const member = await get_member(interaction);
    if (!member) return null;
    if (!member.voice.channel) {
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        return interaction.editReply({
            content: `You must be in a voice channel to use ${rich_cmd}`
        }).then(() => null);
    }
    return member;
}

function check_host(member: DTypes.GuildMember, guildVoice: GuildVoice, rich_cmd: string):
    DTypes.InteractionReplyOptions | null {
    if (member.id !== guildVoice.host.id) {
        const host = guildVoice.host.id === member.client.user.id ? 'me' : guildVoice.host.toString();
        return {
            content: `You are not the host so you cannot use ${rich_cmd}. The host is ${host}`,
            allowedMentions: { users: [] }
        };
    }
    return null;
}

function check_move_permission(member: DTypes.GuildMember, guildVoice: GuildVoice, rich_cmd: string):
    DTypes.InteractionReplyOptions | null {
    // Either they have move members permission or they are host
    if (member.permissionsIn(guildVoice.voiceChannel).has(PermissionsBitField.Flags.MoveMembers)) return null;
    return check_host(member, guildVoice, rich_cmd);
}

// Tried, tested, and true.
const barLength = 13;
// This function will display the current playing stats in a pretty embed
async function nowPlaying(guildId: string) {
    // Really this is bad, but what can I do?
    const client = new CustomClient();
    const guildVoice = GuildVoices.get(guildId)!;
    const song = guildVoice.getCurrentSong()!;
    const playbackTime = guildVoice.currentSongResource!.playbackDuration / 1000;
    const durationLeft = song.duration - playbackTime;
    let percentageLeft = durationLeft / song.duration;
    if (percentageLeft > 1) percentageLeft = 1;
    else if (percentageLeft < 0) percentageLeft = 0;
    const emptyBars = Math.round(barLength * percentageLeft);
    const bar =
        client.bot_emojis.barfull.repeat(barLength - emptyBars) +
        client.bot_emojis.barempty.repeat(emptyBars);
    const embed = new EmbedBuilder({
        title: '🎶 Now Playing:',
        description: `${guildVoice.paused ? '⏸️' : '▶️'} ${song.linkedTitle} ` +
                     `${number_to_date_string(durationLeft)} left\n\n${bar} ` +
                     `${number_to_date_string(playbackTime)} / ${number_to_date_string(song.duration)}`,
        color: Colors.Blue
    }).setAuthor({
        name: `Added by: @${song.user.username}`,
        url: song.albumUrl,
        iconURL: song.user.displayAvatarURL()
    }).setFooter({
        text: `Loop type: ${guildVoice.loop}`
    }).setThumbnail(song.thumbnail);
    return embed;
}

const playNextLock = new Map<string, boolean>();
function getPlayNextLock(guildId: string) {
    if (!playNextLock.has(guildId)) {
        playNextLock.set(guildId, false);
        return true;
    }
    const lock = playNextLock.get(guildId)!;
    playNextLock.set(guildId, false);
    return lock;
}
function releasePlayNextLock(guildId: string) {
    playNextLock.delete(guildId);
}
// This function will help play the next song in a guild
async function playNext(guildId: string) {
    if (!getPlayNextLock(guildId)) return;
    const guildVoice = GuildVoices.get(guildId)!;
    const success = await guildVoice.playNextSong();
    releasePlayNextLock(guildId);
    if (!success) {
        await guildVoice.textChannel.send({ content: 'End of queue.' });
        return guildVoice.player.stop();
    }
    // Send now playing stats
    const embed = await nowPlaying(guildId);
    return guildVoice.textChannel.send({ embeds: [embed] }).catch(() => { });
}

const join: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('join')
        .setDescription('Joins the voice channel you are in.'),

    desc: 'Joins the voice channel. Use this command to move me if I am already in a channel!\n' +
          'Note: You can only move me if you have the `MOVE_MEMBERS` permission!\n\n' +
          'Usage: `/music join`\n\n' +
          'Examples: `/music join`',

    async execute(interaction) {
        await interaction.deferReply();
        const me = interaction.guild!.members.me!;
        const member = await member_voice_valid(interaction);
        if (!member) return;
        const channel = interaction.channel!;
        // This should never be true, but typescript is screaming.
        if (channel.isDMBased()) return;
        const voiceChannel = member.voice.channel!;
        let guildVoice = GuildVoices.get(interaction.guildId!);

        const permissions = voiceChannel.permissionsFor(me);
        if (!permissions.has(PermissionsBitField.Flags.Connect) || !permissions.has(PermissionsBitField.Flags.Speak)) {
            return interaction.editReply({
                content: `I need the permissions to join and speak in ${voiceChannel}!`
            });
        } else if (!channel.permissionsFor(me).has(PermissionsBitField.Flags.SendMessages)) {
            return interaction.editReply({
                content: `I need the permissions to send messages in ${channel}!`
            });
        }

        if (guildVoice) {
            // Fix later
            return interaction.editReply({ content: `I am already in ${guildVoice.voiceChannel}` });
        } else {
            guildVoice = new GuildVoice(channel, voiceChannel, member);
            GuildVoices.set(interaction.guildId!, guildVoice);
            // Register listener for when song ends
            guildVoice.player.on(AudioPlayerStatus.Idle, () => {
                // Leave if host is self, which means nobody is listening.
                if (guildVoice!.host.id === me.user.id) {
                    guildVoice!.destroy();
                    return guildVoice!.textChannel.send({
                        content: `No one wants to listen to me in ${guildVoice!.voiceChannel} so I'm leaving... 😭`
                    });
                }
                return playNext(guildVoice!.voiceChannel.guildId);
            });
        }

        return interaction.editReply({ content: `✅ Success! I am now in ${voiceChannel}` });
    }
};

const leave: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('leave')
        .setDescription('Disconnects me from the voice channel. MUST BE HOST/MOD'),

    desc: 'Leaves the voice channel. You can only disconnect me if you are the host/you have ' +
          '`MOVE_MEMBERS` permission!\n\n' +
          'Usage: `/music leave`\n\n' +
          'Examples: `/music leave`',
    
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_move_permission(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        guildVoice.destroy();
        return interaction.editReply({ content: `💨 Leaving ${guildVoice.voiceChannel} bye!` });
    },
};

const np: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('np')
        .setDescription('Shows the currently playing song.'),

    desc: 'Shows the currently playing song in a pretty embed.\n\n' +
          'Usage: `/music np`\n\n' +
          'Examples: `/music np`',

    async execute(interaction) {
        await interaction.deferReply();
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        } else if (!guildVoice.getCurrentSong()) {
            return interaction.editReply({ content: 'I am not playing anything.' });
        }
        const embed = await nowPlaying(interaction.guildId!);
        return interaction.editReply({ embeds: [embed] });
    }
};

type PlayPrivates = {
    shuffle(arr: unknown[]): void;
    validate_song(song: Song, member: DTypes.GuildMember): boolean;
    on_partial_error(
        interaction: DTypes.CommandInteraction,
        err: { invalid?: boolean, notFound?: boolean }
    ): void;
};
const play: SlashSubcommand & PlayPrivates = {
    data: new SlashCommandSubcommandBuilder()
        .setName('play')
        .setDescription('Plays a song in the voice channel.')
        .addStringOption(option =>
            option
                .setName('query')
                .setDescription('The youtube, spotify, or search query to play.')
                .setRequired(true))
        .addStringOption(option =>
            option
                .setName('loop')
                .setDescription('Set a loop option for the playlist.')
                .addChoices(
                    { name: '🔀 None', value: LoopType.none },
                    { name: '🔂 One', value: LoopType.one },
                    { name: '🔁 All', value: LoopType.all }
                ))
        .addBooleanOption(option =>
            option
                .setName('shuffle')
                .setDescription('Whether to shuffle the playlist before playing.')),

    desc: 'Plays a query in the voice channel! I will automatically join if I am not with you.\n\n' +
          'Usage: `/music play query: <query> loop: [loop] shuffle: [shuffle]`\n\n' +
          '__**Options**__\n' +
          '*query:* The youtube, spotify, or search query to add. (Required)\n' +
          '*loop:* Set a loop option for the playlist. (Default: None)\n' +
          '*shuffle:* Whether to shuffle the playlist before adding. Only affects playlists. (Default: False) \n\n' +
          'Examples: `/music play query: Rick Astley loop: 🔁 All`, ' +
          '`/music play query: https://www.twitch.tv/videos/404860573 shuffle: True`',

    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    },

    on_partial_error(interaction, err) {
        if (err.notFound) {
            return interaction.followUp({
                content: 'Data could not be found. Perhaps the video/playlist is private.\n' +
                    'If you believe this is an error, please report it to the support server.'
            });
        } else if (err.invalid) {
            return interaction.followUp({
                content: 'This video is NSFW and you are not in an NSFW enabled text channel ' +
                    "AND voice channel (due to discord's policies).\n" +
                    'If you believe this is an error, please report it to the support server.'
            });
        } else {
            throw new Error(`Error ${util.inspect(err)} does not have what I expect`);
        }
    },

    validate_song(song, member) {
        if (song.notFound || song.invalid) return false;
        song.user = member.user;
        return true;
    },

    async execute(interaction, client) {
        let guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            await join.execute(interaction, client);
            guildVoice = GuildVoices.get(interaction.guildId!);
            if (!guildVoice) return;
        } else {
            await interaction.deferReply();
        }
        const member = await member_voice_valid(interaction);
        if (!member) return;
        if (member.voice.channelId !== guildVoice.voiceChannel.id) {
            return interaction.editReply({ content: 'I am not with you, b-baka.' });
        }

        const link = interaction.options.getString('query')!.trim();
        const shuffle = interaction.options.getBoolean('shuffle') || false;
        // Only host can modify loop settings.
        if (guildVoice.host.id === member.id) {
            const loop = interaction.options.getString('loop') as LoopType;
            if (loop) guildVoice.loop = loop;
        }
        const songs = [];
        let showLink = '';
        let showThumbnail: string | null = null;

        // Now we search
        const validateResults = await Play.validate(link);
        // Do token refresh in case of expiry for both spotify and youtube
        if (Play.is_expired()) {
            await Play.refreshToken();
        }
        const isNsfw = Utils.channel_is_nsfw_safe(interaction.channel!) &&
            Utils.channel_is_nsfw_safe(guildVoice.voiceChannel);
        if (validateResults === 'yt_playlist') {
            if (!link.match(/(&|\?)index=[0-9]+/)) {
                const playlistInfo = await Play.playlist_info(link, { incomplete: true }).catch(() => undefined);
                if (!playlistInfo) return this.on_partial_error(interaction, { notFound: true });
                showLink = playlistInfo.url!;
                showThumbnail = playlistInfo.thumbnail?.url ?? null;
                for (const video of await playlistInfo.all_videos()) {
                    const song = new Song(video, guildVoice.getUniqueId(), isNsfw, playlistInfo.url);
                    if (!this.validate_song(song, member)) continue;
                    songs.push(song);
                }
            } else {
                // Otherwise its still a single video
                const infoData = await Play.video_basic_info(link)
                    .then(res => res.video_details).catch(() => undefined);
                const song = new Song(infoData, guildVoice.getUniqueId(), isNsfw);
                if (!this.validate_song(song, member)) {
                    return this.on_partial_error(interaction, song);
                }
                showThumbnail = song.thumbnail;
                showLink = song.url;
                songs.push(song);
            }
        } else if (validateResults === 'yt_video') {
            // Link is single video
            const infoData = await Play.video_basic_info(link)
                .then(res => res.video_details).catch(() => undefined);
            const song = new Song(infoData, guildVoice.getUniqueId(), isNsfw);
            if (!this.validate_song(song, member)) {
                return this.on_partial_error(interaction, song);
            }
            showLink = song.url;
            showThumbnail = song.thumbnail;
            songs.push(song);
        } else if (validateResults && validateResults.startsWith('sp')) {
            // All spotify links
            const spotify = await Play.spotify(link).catch(() => undefined);
            if (!spotify) return this.on_partial_error(interaction, { notFound: true });
            showLink = spotify.url;
            showThumbnail = spotify.thumbnail?.url ?? null;
            if (spotify.type === 'track') {
                const song = new Song(spotify as PlayTypes.SpotifyTrack, guildVoice.getUniqueId(), isNsfw);
                if (!this.validate_song(song, member)) {
                    return this.on_partial_error(interaction, song);
                }
                songs.push(song);
            } else {
                // Else its multiple songs
                const all_tracks = await (spotify as PlayTypes.SpotifyPlaylist | PlayTypes.SpotifyAlbum).all_tracks();
                for (const track of all_tracks) {
                    const song = new Song(track, guildVoice.getUniqueId(), isNsfw, spotify.url);
                    if (!this.validate_song(song, member)) {
                        return this.on_partial_error(interaction, song);
                    }
                    songs.push(song);
                }
            }
        } else {
            const infoData = await Play.search(link, {
                source: { youtube: 'video' },
                limit: 1,
                unblurNSFWThumbnails: isNsfw
            }).then(res => res[0]).catch(() => undefined);
            const song = new Song(infoData, guildVoice.getUniqueId(), isNsfw);
            if (!this.validate_song(song, member)) {
                return this.on_partial_error(interaction, song);
            }
            showLink = song.url;
            songs.push(song);
        }
        if (shuffle) this.shuffle(songs);

        let idx = 1;
        let desc = '';
        for (const song of songs) {
            if (idx > 10) {
                desc += `\netc (${songs.length - 10} more)...`;
                break;
            }
            desc += `\n${idx}. ${song.linkedTitle} (${number_to_date_string(song.duration)})`;
            ++idx;
        }
        guildVoice.songs.push(...songs);
        guildVoice.fullQueue.push(...songs);
        const embed = new EmbedBuilder({
            title: `Successfully added ${songs.length} song(s) to the queue.`,
            description: desc,
            color: Colors.Blue
        }).setAuthor({
            name: `Added by: @${member.user.tag}`,
            url: showLink,
            iconURL: member.user.displayAvatarURL()
        }).setFooter({
            text: `Loop type: ${guildVoice.loop}`
        }).setThumbnail(showThumbnail);
        await interaction.followUp({ embeds: [embed] });
        if (!guildVoice.started) {
            return playNext(interaction.guildId!);
        }
    }
};

const host: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('host')
        .setDescription('Views the current host of the music channel.'),

    desc: 'Views the current host of the music channel.\n\n' +
          'Usage: `/music host`\n\n' +
          'Examples: `/music host`',

    async execute(interaction, client) {
        await interaction.deferReply();
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        let host = guildVoice.host.toString() as string;
        if (guildVoice.host.id === client.user!.id) {
            host = 'me';
        } else if (guildVoice.host.id === interaction.user.id) {
            host = 'you';
        }
        return interaction.editReply({ content: `The host is ${host}`, allowedMentions: { users: [] } });
    }
};

const clear: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('clear')
        .setDescription('Clears the playlist. MUST BE HOST'),

    desc: 'Clears the playlist. Only hosts may use this command.\n\n' +
          'Usage: `/music clear`\n\n' +
          'Examples: `/music clear`',

    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        guildVoice.fullReset();
        return interaction.editReply({ content: '🚮 **RIP Queue.**' });
    }
};

const loop: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('loop')
        .setDescription('Sets the loop mode. MUST BE HOST')
        .addStringOption(option =>
            option
                .setName('type')
                .setDescription('The new type of loop.')
                .addChoices(
                    { name: '🔀 None', value: LoopType.none },
                    { name: '🔂 One', value: LoopType.one },
                    { name: '🔁 All', value: LoopType.all }
                ).setRequired(true)),

    desc: 'Sets a new loop type. Only hosts may use this command.\n\n' +
          'Usage: `/music loop type: <type>`\n\n' +
          '__**Options**__\n' +
          '*type:* The type of loop to add. Please select one. (Required)\n\n' +
          'Examples: `/music loop type: `🔀 None',

    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        guildVoice.loop = interaction.options.getString('type') as LoopType;
        return interaction.editReply({ content: `✅ Loop type set to ${guildVoice.loop}` });
    }
};

const pause: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('pause')
        .setDescription('Pauses the current song. MUST BE HOST'),

    desc: 'Pauses the current song. Only hosts may use this command.\n\n' +
          'Usage: `/music pause`\n\n' +
          'Examples: `/music pause`',

    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        if (guildVoice.paused) {
            guildVoice.player.unpause();
            guildVoice.paused = false;
            return interaction.editReply({ content: '▶️ Resumed.' });
        } else {
            guildVoice.player.pause();
            guildVoice.paused = true;
            return interaction.editReply({ content: '⏸️ Paused.' });
        }
    }
};

const resume: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('resume')
        .setDescription('Resumes the current song. MUST BE HOST'),

    desc: 'Resumes the current song. Only hosts may use this command.\n\n' +
          'Usage: `/music resume`\n\n' +
          'Examples: `/music resume`',

    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        if (guildVoice.paused) {
            guildVoice.player.unpause();
            guildVoice.paused = false;
            return interaction.editReply({ content: '▶️ Resumed.' });
        } else {
            return interaction.editReply({ content: 'I am not paused.' });
        }
    }
};

type HelperRetVal = DTypes.InteractionReplyOptions & { followUp?: DTypes.InteractionReplyOptions };
type QueuePrivates = {
    getPage(userID: string, guildVoice: GuildVoice, page: number): HelperRetVal;
};
const queue: SlashSubcommand & QueuePrivates = {
    data: new SlashCommandSubcommandBuilder()
        .setName('queue')
        .setDescription('Shows the current queue.')
        .addIntegerOption(option =>
            option
                .setName('page')
                .setDescription('The page number of the queue to get')
                .setMinValue(1)),

    desc: 'Shows the current queue.\n\n' +
          'Usage: `/music queue`\n\n' +
          'Examples: `/music queue`',

    getPage(userID, guildVoice, page) {
        const embed = new EmbedBuilder({
            title: 'Here is the current queue:',
            color: Colors.Blue
        });
        const max_pages = Math.ceil(guildVoice.fullQueue.length / 10);
        if (max_pages === 0) {
            embed.setDescription(`Page 0/${max_pages}\n\nNo items in queue :(`);
            return { embeds: [embed] };
        }

        const song = guildVoice.getCurrentSong();
        const idx = guildVoice.fullQueue.findIndex(s => s.id === song?.id) + 1;
        const playbackTime = (guildVoice.currentSongResource?.playbackDuration ?? 0) / 1000;
        const durationLeft = (song?.duration ?? 0) - playbackTime;

        // This represents any followup messages that should be sent
        const followUp: {
            embeds: EmbedBuilder[],
            ephemeral: true
        } = {
            embeds: [],
            ephemeral: true
        };
        if (page < 1) {
            const error_embed = new EmbedBuilder({
                title: 'Please enter a positive number.',
                color: Colors.Red
            });
            followUp.embeds.push(error_embed);
            page = 1;
        } else if (page > max_pages) {
            const error_embed = new EmbedBuilder({
                title: `Too high. Max page: ${max_pages}`,
                color: Colors.Red
            });
            followUp.embeds.push(error_embed);
            page = max_pages;
        }

        let startIdx = (page - 1) * 10;
        const endIdx = startIdx + 10;
        const currentQueue = guildVoice.fullQueue.slice(startIdx, endIdx);
        const songsLeft = guildVoice.fullQueue.length - endIdx;
        let desc = `Page ${page}/${max_pages}\n\n`;
        for (const queuedSong of currentQueue) {
            if (++startIdx === idx) {
                desc += `${guildVoice.paused ? '⏸️' : '▶️'} ${queuedSong.linkedTitle} ` +
                    `${number_to_date_string(durationLeft)} left\n`;
            } else {
                desc += `**${startIdx}.** ${queuedSong.linkedTitle} (${number_to_date_string(queuedSong.duration)})\n`;
            }
        }
        if (songsLeft > 0) desc += `etc (${songsLeft} more)...`;
        embed.setDescription(desc).setThumbnail(currentQueue[0].thumbnail).setAuthor({
            name: `Added by: @${currentQueue[0].user.username}`,
            url: currentQueue[0].albumUrl,
            iconURL: currentQueue[0].user.displayAvatarURL()
        }).setFooter({ text: `Loop type: ${guildVoice.loop}` });
        const jumpPage = Math.floor(idx / 10) + (idx % 10 ? 1 : 0);
        const buttons = [
            new ButtonBuilder()
                .setEmoji('↩️')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`music/${userID}/queue/${jumpPage}/`)
                .setDisabled(!song),
            new ButtonBuilder()
                .setEmoji('⬅️')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`music/${userID}/queue/${page - 1}`)
                .setDisabled(page === 1),
            new ButtonBuilder()
                .setEmoji('➡️')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`music/${userID}/queue/${page + 1}`)
                .setDisabled(page === max_pages),
            new ButtonBuilder()
                .setEmoji('🔀')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`music/${userID}/shuffle/${page}`)
                .setDisabled(userID !== guildVoice.host.id),
            new ButtonBuilder()
                .setEmoji('📄')
                .setStyle(ButtonStyle.Primary)
                .setCustomId(`music/${userID}/queue/input`)
        ];
        const retval: HelperRetVal = {
            embeds: [embed],
            components: [
                new ActionRowBuilder<DTypes.ButtonBuilder>().addComponents(...buttons)
            ]
        };
        if (followUp.embeds.length > 0) {
            retval.followUp = followUp;
        }
        return retval;
    },

    async textInput(interaction) {
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) return; // No longer playing music
        await interaction.deferUpdate();
        const value = interaction.fields.getTextInputValue('value');
        const page = parseInt(value);
        if (isNaN(page)) {
            return interaction.followUp({
                content: 'Invalid page number.',
                ephemeral: true
            });
        }
        const { embeds, components, followUp } = this.getPage(interaction.user.id, guildVoice, page);
        await interaction.editReply({ embeds, components });
        if (followUp) return interaction.followUp(followUp);
    },

    async buttonReact(interaction) {
        const [page] = interaction.customId.split('/').slice(3);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const input = new ModalBuilder({
                    title: 'Jump to page',
                    customId: 'music/queue',
                    components: [
                        new ActionRowBuilder<DTypes.TextInputBuilder>({
                            components: [
                                new TextInputBuilder({
                                    label: 'Page #',
                                    customId: 'value',
                                    placeholder: 'Enter the page number to jump to...',
                                    style: TextInputStyle.Short,
                                    maxLength: 100,
                                    required: true
                                })
                            ]
                        })
                    ]
                });
                return interaction.showModal(input);
            } else {
                throw new Error(`Page ${page} is not a valid type.`);
            }
        }
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) return; // No longer playing music
        await interaction.deferUpdate();
        const { embeds, components } = this.getPage(interaction.user.id, guildVoice, val);
        return interaction.editReply({ embeds, components });
    },

    async execute(interaction) {
        await interaction.deferReply();
        const page = interaction.options.getInteger('page') ?? 1;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const { embeds, components, followUp } = this.getPage(interaction.user.id, guildVoice, page);
        await interaction.editReply({ embeds, components });
        if (followUp) {
            return interaction.followUp(followUp);
        }
    }
};

const shuffle: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffles the current queue. MUST BE HOST'),

    desc: 'Shuffles the entire queue. Only hosts may use this command.\n\n' +
          'Usage: `/music shuffle`\n\n' +
          'Example: `/music shuffle`',

    async buttonReact(interaction) {
        await interaction.deferUpdate();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) return interaction.deleteReply();
        const reply = check_host(member, guildVoice, 'this button');
        if (reply) return interaction.followUp({ ...reply, ephemeral: true });
        guildVoice.shuffle();
        const page = parseInt(interaction.customId.split('/').slice(3)[0]);
        const { embeds, components } = queue.getPage(interaction.user.id, guildVoice, page);
        await interaction.editReply({ embeds, components });
        return interaction.followUp({ content: '🔀 Successfully shuffled the queue.', ephemeral: true });
    },

    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        guildVoice.shuffle();
        return interaction.editReply({ content: '🔀 Successfully shuffled the queue.' });
    }
};

const prev: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('prev')
        .setDescription('Plays the previous song. MUST BE HOST'),

    desc: 'Plays the previous song. Only hosts may use this command.\n\n' +
          'Usage: `/music prev`\n\n' +
          'Example: `/music prev`',

    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        // Using lower-level access, however more efficient.
        const currIdx = guildVoice.fullQueue.findIndex(song => song.id === guildVoice.songs[0]?.id);
        if (currIdx === 0) return interaction.editReply({ content: '❌ There is no previous song.' });

        // Hack we do, pretend we just started playing so it doesn't skip the new song we added.
        guildVoice.songs.unshift(guildVoice.fullQueue[currIdx - 1]);
        guildVoice.started = false;
        guildVoice.player.stop();
        return interaction.editReply({ content: '✅ Successfully rewinded to previous song.' });
    }
};

const skip: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('skip')
        .setDescription('Skips the current song. MUST BE HOST'),

    desc: 'Skips the current song. Only hosts may use this command.\n\n' +
          'Usage: `/music skip`\n\n' +
          'Example: `/music skip`',

    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        // A bit of outside handling, but its minor
        // Shift the internal queue to force next song when loop type is One.
        if (guildVoice.loop === LoopType.one) guildVoice.songs.shift();
        guildVoice.player.stop();
        return interaction.editReply({ content: '✅ Successfully skipped the current song.' });
    }
};

const remove_song: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('song')
        .setDescription('Removes a song from the queue. MUST BE HOST')
        .addIntegerOption(option =>
            option
                .setName('index')
                .setDescription('The index of the song to remove.')
                .setMinValue(1)
                .setRequired(true)),

    desc: 'Removes a song at a certain index. Cannot be used to skip the current playing song\n' +
          'Use {/skip} to skip the current song instead. Only hosts may use this command.\n\n' +
          'Usage: `/music remove song index: <index>`\n\n' +
          '__**Options**__\n' +
          '*index:* The index of the song in the queue. See {/music queue} (Required)\n\n' +
          'Examples: `/music remove song index: 1`',

    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        const idx = interaction.options.getInteger('index')! - 1;
        const res = guildVoice.removeSong(idx);
        if (res === -1) {
            return interaction.editReply({ content: `There are only ${guildVoice.fullQueue.length} songs.` });
        } else if (res === 0) {
            const skip_cmd = await Utils.get_rich_cmd('skip');
            return interaction.editReply({
                content: `Song at index ${idx + 1} is currently playing. Use ${skip_cmd} instead.`
            });
        }
        return interaction.editReply({ content: `✅ Successfully removed song at index ${idx + 1}.` });
    }
};

const remove: SlashSubcommandGroup = {
    data: new SlashCommandSubcommandGroupBuilder()
        .setName('remove')
        .setDescription('Remove base description')
        .addSubcommand(remove_song.data),

    desc: 'Remove base command',
    subcommands: new Map()
        .set(remove_song.data.name, remove_song),

    async execute(interaction, client) {
        const subcmd = this.subcommands!.get(interaction.options.getSubcommand());
        return subcmd!.execute(interaction, client);
    }
};

type SkipPrivates = {
    setEmbed(embed: DTypes.EmbedBuilder, guildVoice: GuildVoice, requiredVotes: number): DTypes.EmbedBuilder;
};
const vote_skip: SlashSubcommand & SkipPrivates = {
    data: new SlashCommandSubcommandBuilder()
        .setName('skip')
        .setDescription('Votes to skip the current song.')
        .addBooleanOption(option =>
            option
                .setName('skip')
                .setDescription('Whether to vote skip or not.')
                .setRequired(true)),

    desc: 'Votes to skip the current song.\n\n' +
          'Usage: `/music vote skip skip: <vote>`\n\n' +
          '__**Options**__\n' +
          '*skip:* Whether to vote skip or not. (Required)\n\n' +
          'Examples: `/music vote skip skip: True`',

    setEmbed(embed, guildVoice, requiredVotes) {
        let desc = '';
        desc += `**Song: ${guildVoice.getCurrentSong()!.linkedTitle}**\n`;
        embed.setDescription(`${desc}\n\nVotes required to skip: \`${guildVoice.voted.length}/${requiredVotes}\``);
        return embed;
    },

    async execute(interaction) {
        await interaction.deferReply();
        // const vote = interaction.options.getBoolean('skip')!;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const song = guildVoice.getCurrentSong();
        if (!song) {
            return interaction.editReply({ content: 'There is no song playing.' });
        }
        return interaction.editReply({ content: 'This command is not implemented yet.' });
    }
};

const vote: SlashSubcommandGroup = {
    data: new SlashCommandSubcommandGroupBuilder()
        .setName('vote')
        .setDescription('Vote Base Command.')
        .addSubcommand(vote_skip.data),

    desc: 'Vote Base Command',

    subcommands: new Map()
        .set(vote_skip.data.name, vote_skip),

    async execute(interaction, client) {
        const subcmd = this.subcommands!.get(interaction.options.getSubcommand());
        return subcmd!.execute(interaction, client);
    }
};

const restart: SlashSubcommand = {
    data: new SlashCommandSubcommandBuilder()
        .setName('restart')
        .setDescription('Restarts the queue. MUST BE HOST'),

    desc: 'Restarts the queue (start from the beginning). Only hosts may use this command.\n\n' +
          'Usage: `/music restart`' +
          'Examples: `/music restart`',
    
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member) return;
        const guildVoice = GuildVoices.get(interaction.guildId!);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply) return interaction.editReply(reply);
        if (!guildVoice.fullQueue.length) {
            return interaction.editReply({ content: 'There is no queue.' });
        }
        const message = await interaction.editReply({
            content: '# Are you sure you want to restart the queue?',
            components: [new ActionRowBuilder<DTypes.ButtonBuilder>().addComponents(
                new ButtonBuilder()
                    .setLabel('Yes!')
                    .setCustomId('restart/confirm')
                    .setEmoji('🔄')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setLabel('No')
                    .setCustomId('restart/cancel')
                    .setStyle(ButtonStyle.Secondary)
            )]
        });
        const i = await message.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id,
            componentType: ComponentType.Button,
            time: 60_000
        }).catch(() => null);
        if (i && i.customId === 'restart/confirm') {
            await i.deferUpdate();
            // Low level access to guildVoice private fields
            guildVoice.reset(guildVoice.fullQueue.slice());
            if (guildVoice.fullQueue.length) {
                playNext(interaction.guildId!);
                return i.editReply({ content: '🔄 Successfully restarted the queue.', components: [] });
            } else {
                return i.editReply({ content: 'There is no queue.', components: [] });
            }
        } else {
            return interaction.deleteReply();
        }
    }
};

// All commands are under this main command
export const music: SlashCommand = {
    data: new SlashCommandBuilder()
        .setName('music')
        .setDescription('Music base command.')
        .addSubcommand(join.data)
        .addSubcommand(leave.data)
        .addSubcommand(np.data)
        .addSubcommand(play.data)
        .addSubcommand(host.data)
        .addSubcommand(clear.data)
        .addSubcommand(loop.data)
        .addSubcommand(pause.data)
        .addSubcommand(resume.data)
        .addSubcommand(queue.data)
        .addSubcommand(shuffle.data)
        .addSubcommand(prev.data)
        .addSubcommand(skip.data)
        .addSubcommandGroup(remove.data)
        .addSubcommandGroup(vote.data)
        .addSubcommand(restart.data)
        .setDMPermission(false),
    
    subcommands: new Map()
        .set(join.data.name, join)
        .set(leave.data.name, leave)
        .set(np.data.name, np)
        .set(play.data.name, play)
        .set(host.data.name, host)
        .set(clear.data.name, clear)
        .set(loop.data.name, loop)
        .set(pause.data.name, pause)
        .set(resume.data.name, resume)
        .set(queue.data.name, queue)
        .set(shuffle.data.name, shuffle)
        .set(prev.data.name, prev)
        .set(skip.data.name, skip)
        .set(remove.data.name, remove)
        .set(vote.data.name, vote)
        .set(restart.data.name, restart),

    desc: 'Music base command',
    
    async textInput(interaction, client) {
        const subcommand = this.subcommands!.get(interaction.customId.split('/')[1]);
        return subcommand!.textInput!(interaction, client);
    },

    async buttonReact(interaction, client) {
        const subcommand = this.subcommands!.get(interaction.customId.split('/')[2]);
        return subcommand!.buttonReact!(interaction, client);
    },

    async menuReact(interaction, client) {
        const subcommand = this.subcommands!.get(interaction.customId.split('/')[2]);
        return subcommand!.menuReact!(interaction, client);
    },

    async execute(interaction, client) {
        const subcmd = this.subcommands!.get(
            interaction.options.getSubcommand(false) ??
            interaction.options.getSubcommandGroup()!
        );
        return subcmd!.execute(interaction, client);
    }
};
