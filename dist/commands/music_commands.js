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
var __importStar = (this && this.__importStar) || (function () {
    var ownKeys = function(o) {
        ownKeys = Object.getOwnPropertyNames || function (o) {
            var ar = [];
            for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
            return ar;
        };
        return ownKeys(o);
    };
    return function (mod) {
        if (mod && mod.__esModule) return mod;
        var result = {};
        if (mod != null) for (var k = ownKeys(mod), i = 0; i < k.length; i++) if (k[i] !== "default") __createBinding(result, mod, k[i]);
        __setModuleDefault(result, mod);
        return result;
    };
})();
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.music = exports.desc = exports.name = void 0;
const util_1 = __importDefault(require("util"));
const play_dl_1 = __importDefault(require("play-dl"));
const voice_1 = require("../classes/voice");
const Utils = __importStar(require("../modules/utils"));
const voice_2 = require("@discordjs/voice");
const discord_js_1 = require("discord.js");
const commands_1 = require("../classes/commands");
exports.name = 'Music';
exports.desc = 'This category contains commands for playing music!';
function number_to_date_string(num) {
    const date = new Date(0);
    date.setSeconds(num);
    // Over a day, show days AND hours
    if (num >= 24 * 3600) {
        // Yes, I came up with this myself...
        return `${`0${Math.floor(num /
            (24 * 3600))}`.slice(-2)}:${date.toISOString().slice(11, 19)}`;
    }
    // Strip hour if its 00
    return date.toISOString().slice(11, 19).replace(/^00:/, '');
}
function isGuildMemberObject(member) {
    return member instanceof discord_js_1.GuildMember;
}
async function get_member(interaction) {
    let member = interaction.member;
    if (isGuildMemberObject(member))
        return member;
    member = await interaction.guild.members.fetch(member?.user.id ?? '0').catch(() => null);
    if (!member) {
        const reply = {
            content: 'I was unable to fetch your details. Please report this to the support server!',
            flags: discord_js_1.MessageFlags.Ephemeral,
        };
        return interaction.isRepliable() ?
            interaction.replied || interaction.deferred ?
                interaction.reply(reply).then(() => null) :
                interaction.followUp(reply).then(() => null) :
            null;
    }
}
// This function will pretty much always be called to validate
// if music commands can be used.
async function member_voice_valid(interaction) {
    const member = await get_member(interaction);
    if (!member)
        return null;
    if (!member.voice.channel) {
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        return interaction.editReply({
            content: `You must be in a voice channel to use ${rich_cmd}`,
        }).then(() => null);
    }
    return member;
}
function check_host(member, guildVoice, rich_cmd) {
    if (member.id !== guildVoice.host.id) {
        const host = guildVoice.host.id === member.client.user.id ? 'me' : guildVoice.host.toString();
        return {
            content: `You are not the host so you cannot use ${rich_cmd}. The host is ${host}`,
            allowedMentions: { users: [] },
        };
    }
    return null;
}
function check_move_permission(member, guildVoice, rich_cmd) {
    // Either they have move members permission or they are host
    if (member.permissionsIn(guildVoice.voiceChannel).has(discord_js_1.PermissionsBitField.Flags.MoveMembers))
        return null;
    return check_host(member, guildVoice, rich_cmd);
}
// Tried, tested, and true.
const barLength = 13;
// This function will display the current playing stats in a pretty embed
async function nowPlaying(client, guildId) {
    const guildVoice = voice_1.GuildVoices.get(guildId);
    // This happens if the user immediately disconnects exactly when this is called.
    if (!guildVoice)
        return;
    const song = guildVoice.getCurrentSong();
    const playbackTime = guildVoice.currentSongResource.playbackDuration / 1000;
    const durationLeft = song.duration - playbackTime;
    let percentageLeft = durationLeft / song.duration;
    if (percentageLeft > 1)
        percentageLeft = 1;
    else if (percentageLeft < 0)
        percentageLeft = 0;
    const emptyBars = Math.round(barLength * percentageLeft);
    const bar = client.bot_emojis.barfull.repeat(barLength - emptyBars) +
        client.bot_emojis.barempty.repeat(emptyBars);
    return new discord_js_1.EmbedBuilder({
        title: '🎶 Now Playing:',
        description: `${guildVoice.paused ? '⏸️' : '▶️'} ${song.linkedTitle} ` +
            `${number_to_date_string(durationLeft)} left\n\n${bar} ` +
            `${number_to_date_string(playbackTime)} / ${number_to_date_string(song.duration)}`,
        color: discord_js_1.Colors.Blue,
    }).setAuthor({
        name: `Added by: @${song.user.username}`,
        url: song.albumUrl,
        iconURL: song.user.displayAvatarURL(),
    }).setFooter({
        text: `Loop type: ${guildVoice.loop}`,
    }).setThumbnail(song.thumbnail);
}
const playNextLock = new Map();
function getPlayNextLock(guildId) {
    if (!playNextLock.has(guildId)) {
        playNextLock.set(guildId, false);
        return true;
    }
    const lock = playNextLock.get(guildId);
    playNextLock.set(guildId, false);
    return lock;
}
function releasePlayNextLock(guildId) {
    playNextLock.delete(guildId);
}
// This function will help play the next song in a guild
async function playNext(client, guildId) {
    if (!getPlayNextLock(guildId))
        return;
    const guildVoice = voice_1.GuildVoices.get(guildId);
    if (!guildVoice)
        return;
    const success = await guildVoice.playNextSong();
    releasePlayNextLock(guildId);
    if (!success) {
        await guildVoice.textChannel.send({ content: 'End of queue.' });
        guildVoice.player.stop();
        return;
    }
    // Send now playing stats
    const embed = await nowPlaying(client, guildId);
    if (embed) {
        await guildVoice.textChannel.send({ embeds: [embed] }).catch(Utils.VOID);
    }
}
const join = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('join')
        .setDescription('Joins the voice channel you are in.'),
    long_description: 'Joins the voice channel. Use this command to move me if I am already in a channel!\n' +
        'Note: You can only move me if you have the `MOVE_MEMBERS` permission!\n\n' +
        'Usage: `/music join`\n\n' +
        'Examples: `/music join`',
    async execute(interaction) {
        await interaction.deferReply();
        const me = interaction.guild.members.me;
        const member = await member_voice_valid(interaction);
        if (!member)
            return;
        const channel = interaction.channel;
        // This should never be true, but typescript is screaming.
        if (channel.isDMBased())
            return;
        const voiceChannel = member.voice.channel;
        const guildID = interaction.guildId;
        let guildVoice = voice_1.GuildVoices.get(guildID);
        const permissions = voiceChannel.permissionsFor(me);
        if (!permissions.has(discord_js_1.PermissionsBitField.Flags.Connect) ||
            !permissions.has(discord_js_1.PermissionsBitField.Flags.Speak)) {
            return interaction.editReply({
                content: `I need the permissions to join and speak in ${voiceChannel}!`,
            }).then(Utils.VOID);
        }
        else if (!channel.permissionsFor(me).has(discord_js_1.PermissionsBitField.Flags.SendMessages)) {
            return interaction.editReply({
                content: `I need the permissions to send messages in ${channel}!`,
            }).then(Utils.VOID);
        }
        if (guildVoice) {
            // Fix later
            return interaction.editReply({ content: `I am already in ${guildVoice.voiceChannel}` })
                .then(Utils.VOID);
        }
        else {
            guildVoice = new voice_1.GuildVoice(channel, voiceChannel, member);
            voice_1.GuildVoices.set(guildID, guildVoice);
            // Register listener for when song ends
            guildVoice.player.on(voice_2.AudioPlayerStatus.Idle, () => {
                // Allows us to release the guildVoice object.
                const guildVoice = voice_1.GuildVoices.get(guildID);
                if (!guildVoice)
                    return;
                // Leave if host is self, which means nobody is listening.
                if (guildVoice.host.id === me.user.id) {
                    guildVoice.destroy();
                    return guildVoice.textChannel.send({
                        content: `No one wants to listen to me in ${guildVoice.voiceChannel} so I'm leaving... 😭`,
                    }).then(Utils.VOID);
                }
                return playNext(interaction.client, guildVoice.voiceChannel.guildId);
            }).on('error', console.error);
        }
        await interaction.editReply({ content: `✅ Success! I am now in ${voiceChannel}` });
    },
});
const leave = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('leave')
        .setDescription('Disconnects me from the voice channel. MUST BE HOST/MOD'),
    long_description: 'Leaves the voice channel. You can only disconnect me if you are the host/you have ' +
        '`MOVE_MEMBERS` permission!\n\n' +
        'Usage: `/music leave`\n\n' +
        'Examples: `/music leave`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_move_permission(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        guildVoice.destroy();
        await interaction.editReply({ content: `💨 Leaving ${guildVoice.voiceChannel} bye!` });
    },
});
const np = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('np')
        .setDescription('Shows the currently playing song.'),
    long_description: 'Shows the currently playing song in a pretty embed.\n\n' +
        'Usage: `/music np`\n\n' +
        'Examples: `/music np`',
    async execute(interaction) {
        await interaction.deferReply();
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        else if (!guildVoice.getCurrentSong()) {
            return interaction.editReply({ content: 'I am not playing anything.' }).then(Utils.VOID);
        }
        const embed = await nowPlaying(interaction.client, interaction.guildId);
        if (embed) {
            await interaction.editReply({ embeds: [embed] });
        }
    },
});
const play_privates = {
    shuffle(arr) {
        for (let i = arr.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() *
                (i + 1));
            [arr[i], arr[j]] = [arr[j], arr[i]];
        }
    },
    on_partial_error(interaction, err) {
        if (err.notFound) {
            return interaction.followUp({
                content: 'Data could not be found. Perhaps the video/playlist is private.\n' +
                    'If you believe this is an error, please report it to the support server.',
            }).then(Utils.VOID);
        }
        else if (err.invalid) {
            return interaction.followUp({
                content: 'This video is NSFW and you are not in an NSFW enabled text channel ' +
                    "AND voice channel (due to discord's policies).\n" +
                    'If you believe this is an error, please report it to the support server.',
            }).then(Utils.VOID);
        }
        else {
            throw new Error(`Error ${util_1.default.inspect(err)} does not have what I expect`);
        }
    },
    validate_song(song, member) {
        if (song.notFound || song.invalid)
            return false;
        song.user = member.user;
        return true;
    },
};
const play = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('play')
        .setDescription('Plays a song in the voice channel.')
        .addStringOption(option => option
        .setName('query')
        .setDescription('The youtube, spotify, or search query to play.')
        .setRequired(true))
        .addStringOption(option => option
        .setName('loop')
        .setDescription('Set a loop option for the playlist.')
        .addChoices({ name: '🔀 None', value: "NONE" /* LoopType.none */ }, { name: '🔂 One', value: "ONE" /* LoopType.one */ }, { name: '🔁 All', value: "ALL" /* LoopType.all */ }))
        .addBooleanOption(option => option
        .setName('shuffle')
        .setDescription('Whether to shuffle the playlist before playing.')),
    long_description: 'Plays a query in the voice channel! I will automatically join if I am not with you.\n\n' +
        'Usage: `/music play query: <query> loop: [loop] shuffle: [shuffle]`\n\n' +
        '__**Options**__\n' +
        '*query:* The youtube, spotify, or search query to add. (Required)\n' +
        '*loop:* Set a loop option for the playlist. (Default: None)\n' +
        '*shuffle:* Whether to shuffle the playlist before adding. Only affects playlists. (Default: False) \n\n' +
        'Examples: `/music play query: Rick Astley loop: 🔁 All`, ' +
        '`/music play query: https://www.twitch.tv/videos/404860573 shuffle: True`',
    async execute(interaction) {
        let guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            await join.execute(interaction);
            guildVoice = voice_1.GuildVoices.get(interaction.guildId);
            if (!guildVoice)
                return;
        }
        else {
            await interaction.deferReply();
        }
        const member = await member_voice_valid(interaction);
        if (!member)
            return;
        if (member.voice.channelId !== guildVoice.voiceChannel.id) {
            return interaction.editReply({ content: 'I am not with you, b-baka.' }).then(Utils.VOID);
        }
        const link = interaction.options.getString('query').trim();
        const shuffle = interaction.options.getBoolean('shuffle') || false;
        // Only host can modify loop settings.
        if (guildVoice.host.id === member.id) {
            const loop = interaction.options.getString('loop');
            if (loop)
                guildVoice.loop = loop;
        }
        const songs = [];
        let showLink = '';
        let showThumbnail = null;
        // Now we search
        const validateResults = await play_dl_1.default.validate(link);
        // Do token refresh in case of expiry for both Spotify and YouTube
        if (play_dl_1.default.is_expired()) {
            await play_dl_1.default.refreshToken();
        }
        const isNsfw = Utils.channel_is_nsfw_safe(interaction.channel) &&
            Utils.channel_is_nsfw_safe(guildVoice.voiceChannel);
        if (validateResults === 'yt_playlist') {
            if (!link.match(/([&?])index=[0-9]+/)) {
                const playlistInfo = await play_dl_1.default.playlist_info(link, { incomplete: true }).catch(() => undefined);
                if (!playlistInfo)
                    return play_privates.on_partial_error(interaction, { notFound: true });
                showLink = playlistInfo.url;
                showThumbnail = playlistInfo.thumbnail?.url ?? null;
                for (const video of await playlistInfo.all_videos()) {
                    const song = new voice_1.Song(video, guildVoice.getUniqueId(), isNsfw, playlistInfo.url);
                    if (!play_privates.validate_song(song, member))
                        continue;
                    songs.push(song);
                }
            }
            else {
                // Otherwise It's still a single video
                const infoData = await play_dl_1.default.video_basic_info(link)
                    .then(res => res.video_details)
                    .catch(() => undefined);
                const song = new voice_1.Song(infoData, guildVoice.getUniqueId(), isNsfw);
                if (!play_privates.validate_song(song, member)) {
                    return play_privates.on_partial_error(interaction, song);
                }
                showThumbnail = song.thumbnail;
                showLink = song.url;
                songs.push(song);
            }
        }
        else if (validateResults === 'yt_video') {
            // Link is single video
            const infoData = await play_dl_1.default.video_basic_info(link)
                .then(res => res.video_details)
                .catch(() => undefined);
            const song = new voice_1.Song(infoData, guildVoice.getUniqueId(), isNsfw);
            if (!play_privates.validate_song(song, member)) {
                return play_privates.on_partial_error(interaction, song);
            }
            showLink = song.url;
            showThumbnail = song.thumbnail;
            songs.push(song);
        }
        else if (validateResults && validateResults.startsWith('sp')) {
            // All spotify links
            const spotify = await play_dl_1.default.spotify(link).catch(() => undefined);
            if (!spotify)
                return play_privates.on_partial_error(interaction, { notFound: true });
            showLink = spotify.url;
            showThumbnail = spotify.thumbnail?.url ?? null;
            if (spotify.type === 'track') {
                const song = new voice_1.Song(spotify, guildVoice.getUniqueId(), isNsfw);
                if (!play_privates.validate_song(song, member)) {
                    return play_privates.on_partial_error(interaction, song);
                }
                songs.push(song);
            }
            else {
                // Else its multiple songs
                const all_tracks = await spotify.all_tracks();
                for (const track of all_tracks) {
                    const song = new voice_1.Song(track, guildVoice.getUniqueId(), isNsfw, spotify.url);
                    if (!play_privates.validate_song(song, member)) {
                        return play_privates.on_partial_error(interaction, song);
                    }
                    songs.push(song);
                }
            }
        }
        else {
            const infoData = await play_dl_1.default.search(link, {
                source: { youtube: 'video' },
                limit: 1,
                unblurNSFWThumbnails: isNsfw,
            }).then(res => res.at(0)).catch(() => undefined);
            const song = new voice_1.Song(infoData, guildVoice.getUniqueId(), isNsfw);
            if (!play_privates.validate_song(song, member)) {
                return play_privates.on_partial_error(interaction, song);
            }
            showLink = song.url;
            songs.push(song);
        }
        if (shuffle)
            play_privates.shuffle(songs);
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
        const embed = new discord_js_1.EmbedBuilder({
            title: `Successfully added ${songs.length} song(s) to the queue.`,
            description: desc,
            color: discord_js_1.Colors.Blue,
        }).setAuthor({
            name: `Added by: @${member.user.tag}`,
            url: showLink,
            iconURL: member.user.displayAvatarURL(),
        }).setFooter({
            text: `Loop type: ${guildVoice.loop}`,
        }).setThumbnail(showThumbnail);
        await interaction.followUp({ embeds: [embed] });
        if (!guildVoice.started) {
            return playNext(interaction.client, interaction.guildId);
        }
    },
});
const host = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('host')
        .setDescription('Views the current host of the music channel.'),
    long_description: 'Views the current host of the music channel.\n\n' +
        'Usage: `/music host`\n\n' +
        'Examples: `/music host`',
    async execute(interaction) {
        await interaction.deferReply();
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        let host = guildVoice.host.toString();
        if (guildVoice.host.id === interaction.client.user.id) {
            host = 'me';
        }
        else if (guildVoice.host.id === interaction.user.id) {
            host = 'you';
        }
        await interaction.editReply({ content: `The host is ${host}`, allowedMentions: { users: [] } });
    },
});
const clear = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('clear')
        .setDescription('Clears the playlist. MUST BE HOST'),
    long_description: 'Clears the playlist. Only hosts may use this command.\n\n' +
        'Usage: `/music clear`\n\n' +
        'Examples: `/music clear`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        guildVoice.fullReset();
        await interaction.editReply({ content: '🚮 **RIP Queue.**' });
    },
});
const loop = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('loop')
        .setDescription('Sets the loop mode. MUST BE HOST')
        .addStringOption(option => option
        .setName('type')
        .setDescription('The new type of loop.')
        .addChoices({ name: '🔀 None', value: "NONE" /* LoopType.none */ }, { name: '🔂 One', value: "ONE" /* LoopType.one */ }, { name: '🔁 All', value: "ALL" /* LoopType.all */ })
        .setRequired(true)),
    long_description: 'Sets a new loop type. Only hosts may use this command.\n\n' +
        'Usage: `/music loop type: <type>`\n\n' +
        '__**Options**__\n' +
        '*type:* The type of loop to add. Please select one. (Required)\n\n' +
        'Examples: `/music loop type: `🔀 None',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        guildVoice.loop = interaction.options.getString('type');
        await interaction.editReply({ content: `✅ Loop type set to ${guildVoice.loop}` });
    },
});
const pause = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('pause')
        .setDescription('Pauses the current song. MUST BE HOST'),
    long_description: 'Pauses the current song. Only hosts may use this command.\n\n' +
        'Usage: `/music pause`\n\n' +
        'Examples: `/music pause`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        if (guildVoice.paused) {
            guildVoice.player.unpause();
            guildVoice.paused = false;
            await interaction.editReply({ content: '▶️ Resumed.' });
        }
        else {
            guildVoice.player.pause();
            guildVoice.paused = true;
            await interaction.editReply({ content: '⏸️ Paused.' });
        }
    },
});
const resume = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('resume')
        .setDescription('Resumes the current song. MUST BE HOST'),
    long_description: 'Resumes the current song. Only hosts may use this command.\n\n' +
        'Usage: `/music resume`\n\n' +
        'Examples: `/music resume`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        if (guildVoice.paused) {
            guildVoice.player.unpause();
            guildVoice.paused = false;
            await interaction.editReply({ content: '▶️ Resumed.' });
        }
        else {
            await interaction.editReply({ content: 'I am not paused.' });
        }
    },
});
const queue_privates = {
    getPage(userID, guildVoice, page) {
        const embed = new discord_js_1.EmbedBuilder({
            title: 'Here is the current queue:',
            color: discord_js_1.Colors.Blue,
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
        const followUp = {
            embeds: [],
            flags: discord_js_1.MessageFlags.Ephemeral,
        };
        if (page < 1) {
            const error_embed = new discord_js_1.EmbedBuilder({
                title: 'Please enter a positive number.',
                color: discord_js_1.Colors.Red,
            });
            followUp.embeds.push(error_embed);
            page = 1;
        }
        else if (page > max_pages) {
            const error_embed = new discord_js_1.EmbedBuilder({
                title: `Too high. Max page: ${max_pages}`,
                color: discord_js_1.Colors.Red,
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
            }
            else {
                desc += `**${startIdx}.** ${queuedSong.linkedTitle} (${number_to_date_string(queuedSong.duration)})\n`;
            }
        }
        if (songsLeft > 0)
            desc += `etc (${songsLeft} more)...`;
        embed.setDescription(desc).setThumbnail(currentQueue[0].thumbnail).setAuthor({
            name: `Added by: @${currentQueue[0].user.username}`,
            url: currentQueue[0].albumUrl,
            iconURL: currentQueue[0].user.displayAvatarURL(),
        }).setFooter({ text: `Loop type: ${guildVoice.loop}` });
        const jumpPage = Math.floor(idx / 10) +
            (idx % 10 ? 1 : 0);
        const buttons = [
            new discord_js_1.ButtonBuilder().setEmoji('↩️')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setCustomId(`music/${userID}/queue/${jumpPage}/`)
                .setDisabled(!song),
            new discord_js_1.ButtonBuilder().setEmoji('⬅️').setStyle(discord_js_1.ButtonStyle.Primary).setCustomId(`music/${userID}/queue/${page -
                1}`).setDisabled(page === 1),
            new discord_js_1.ButtonBuilder().setEmoji('➡️').setStyle(discord_js_1.ButtonStyle.Primary).setCustomId(`music/${userID}/queue/${page +
                1}`).setDisabled(page === max_pages),
            new discord_js_1.ButtonBuilder().setEmoji('🔀')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setCustomId(`music/${userID}/shuffle/${page}`)
                .setDisabled(userID !== guildVoice.host.id),
            new discord_js_1.ButtonBuilder().setEmoji('📄').setStyle(discord_js_1.ButtonStyle.Primary).setCustomId(`music/${userID}/queue/input`),
        ];
        const retval = {
            embeds: [embed],
            components: [
                new discord_js_1.ActionRowBuilder().addComponents(...buttons),
            ],
        };
        if (followUp.embeds.length > 0) {
            retval.followUp = followUp;
        }
        return retval;
    },
};
const queue = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder().setName('queue')
        .setDescription('Shows the current queue.')
        .addIntegerOption(option => option
        .setName('page')
        .setDescription('The page number of the queue to get')
        .setMinValue(1)),
    long_description: 'Shows the current queue.\n\n' +
        'Usage: `/music queue`\n\n' +
        'Examples: `/music queue`',
    async textInput(interaction) {
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice)
            return; // No longer playing music
        await interaction.deferUpdate();
        const value = interaction.fields.getTextInputValue('value');
        const page = parseInt(value);
        if (isNaN(page)) {
            return interaction.followUp({
                content: 'Invalid page number.',
                flags: discord_js_1.MessageFlags.Ephemeral,
            }).then(Utils.VOID);
        }
        const { embeds, components, followUp } = queue_privates.getPage(interaction.user.id, guildVoice, page);
        await interaction.editReply({ embeds, components });
        if (followUp)
            await interaction.followUp(followUp);
    },
    async buttonReact(interaction) {
        const [page] = interaction.customId.split('/').slice(3);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const input = new discord_js_1.ModalBuilder({
                    title: 'Jump to page',
                    customId: 'music/queue',
                    components: [
                        new discord_js_1.ActionRowBuilder({
                            components: [
                                new discord_js_1.TextInputBuilder({
                                    label: 'Page #',
                                    customId: 'value',
                                    placeholder: 'Enter the page number to jump to...',
                                    style: discord_js_1.TextInputStyle.Short,
                                    maxLength: 100,
                                    required: true,
                                }),
                            ],
                        }),
                    ],
                });
                return interaction.showModal(input);
            }
            else {
                throw new Error(`Page ${page} is not a valid type.`);
            }
        }
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice)
            return; // No longer playing music
        await interaction.deferUpdate();
        const { embeds, components } = queue_privates.getPage(interaction.user.id, guildVoice, val);
        await interaction.editReply({ embeds, components });
    },
    async execute(interaction) {
        await interaction.deferReply();
        const page = interaction.options.getInteger('page') ?? 1;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const { embeds, components, followUp } = queue_privates.getPage(interaction.user.id, guildVoice, page);
        await interaction.editReply({ embeds, components });
        if (followUp)
            await interaction.followUp(followUp);
    },
});
const shuffle = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffles the current queue. MUST BE HOST'),
    long_description: 'Shuffles the entire queue. Only hosts may use this command.\n\n' +
        'Usage: `/music shuffle`\n\n' +
        'Example: `/music shuffle`',
    async buttonReact(interaction) {
        await interaction.deferUpdate();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice)
            return interaction.deleteReply();
        const reply = check_host(member, guildVoice, 'this button');
        if (reply)
            return interaction.followUp({ ...reply, flags: discord_js_1.MessageFlags.Ephemeral }).then(Utils.VOID);
        guildVoice.shuffle();
        const page = parseInt(interaction.customId.split('/').slice(3)[0]);
        const { embeds, components } = queue_privates.getPage(interaction.user.id, guildVoice, page);
        await interaction.editReply({ embeds, components });
        await interaction.followUp({ content: '🔀 Successfully shuffled the queue.', flags: discord_js_1.MessageFlags.Ephemeral });
    },
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        guildVoice.shuffle();
        await interaction.editReply({ content: '🔀 Successfully shuffled the queue.' });
    },
});
const prev = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('prev')
        .setDescription('Plays the previous song. MUST BE HOST'),
    long_description: 'Plays the previous song. Only hosts may use this command.\n\n' +
        'Usage: `/music prev`\n\n' +
        'Example: `/music prev`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        // Using lower-level access, however more efficient.
        const currIdx = guildVoice.fullQueue.findIndex(song => song.id === guildVoice.songs.at(0)?.id);
        if (currIdx === 0)
            return interaction.editReply({ content: '❌ There is no previous song.' })
                .then(Utils.VOID);
        // Hack we do, pretend we just started playing, so it doesn't skip the new song we added.
        guildVoice.songs.unshift(guildVoice.fullQueue[currIdx - 1]);
        guildVoice.started = false;
        guildVoice.player.stop();
        await interaction.editReply({ content: '✅ Successfully rewound to previous song.' });
    },
});
const skip = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('skip')
        .setDescription('Skips the current song. MUST BE HOST'),
    long_description: 'Skips the current song. Only hosts may use this command.\n\n' +
        'Usage: `/music skip`\n\n' +
        'Example: `/music skip`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        // A bit of outside handling, but its minor
        // Shift the internal queue to force next song when loop type is One.
        if (guildVoice.loop === "ONE" /* LoopType.one */)
            guildVoice.songs.shift();
        guildVoice.player.stop();
        await interaction.editReply({ content: '✅ Successfully skipped the current song.' });
    },
});
const remove_song = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('song')
        .setDescription('Removes a song from the queue. MUST BE HOST')
        .addIntegerOption(option => option
        .setName('index')
        .setDescription('The index of the song to remove.')
        .setMinValue(1)
        .setRequired(true)),
    long_description: 'Removes a song at a certain index. Cannot be used to skip the current playing song\n' +
        'Use {/skip} to skip the current song instead. Only hosts may use this command.\n\n' +
        'Usage: `/music remove song index: <index>`\n\n' +
        '__**Options**__\n' +
        '*index:* The index of the song in the queue. See {/music queue} (Required)\n\n' +
        'Examples: `/music remove song index: 1`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        const idx = interaction.options.getInteger('index') - 1;
        const res = guildVoice.removeSong(idx);
        if (res === -1) {
            return interaction.editReply({
                content: `There are only ${guildVoice.fullQueue.length} songs.`,
            }).then(Utils.VOID);
        }
        else if (res === 0) {
            const skip_cmd = await Utils.get_rich_cmd('skip', interaction.client);
            return interaction.editReply({
                content: `Song at index ${idx + 1} is currently playing. Use ${skip_cmd} instead.`,
            }).then(Utils.VOID);
        }
        await interaction.editReply({ content: `✅ Successfully removed song at index ${idx + 1}.` });
    },
});
const remove = new commands_1.SlashSubcommandGroup({
    data: new discord_js_1.SlashCommandSubcommandGroupBuilder()
        .setName('remove')
        .setDescription('Remove base description'),
    long_description: 'Remove base command',
    subcommands: [remove_song],
});
// const skip_privates = {
//     setEmbed(embed: EmbedBuilder, guildVoice: GuildVoice, requiredVotes: number) {
//         let desc = '';
//         desc += `**Song: ${guildVoice.getCurrentSong()!.linkedTitle}**\n`;
//         embed.setDescription(`${desc}\n\nVotes required to skip: \`${guildVoice.voted.length}/${requiredVotes}\``);
//         return embed;
//     },
// };
const vote_skip = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder().setName('skip')
        .setDescription('Votes to skip the current song.')
        .addBooleanOption(option => option
        .setName('skip')
        .setDescription('Whether to vote skip or not.')
        .setRequired(true)),
    long_description: 'Votes to skip the current song.\n\n' +
        'Usage: `/music vote skip skip: <vote>`\n\n' +
        '__**Options**__\n' +
        '*skip:* Whether to vote skip or not. (Required)\n\n' +
        'Examples: `/music vote skip skip: True`',
    async execute(interaction) {
        await interaction.deferReply();
        // const vote = interaction.options.getBoolean('skip')!;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const song = guildVoice.getCurrentSong();
        if (!song) {
            return interaction.editReply({ content: 'There is no song playing.' }).then(Utils.VOID);
        }
        await interaction.editReply({ content: 'This command is not implemented yet.' });
    },
});
const vote = new commands_1.SlashSubcommandGroup({
    data: new discord_js_1.SlashCommandSubcommandGroupBuilder()
        .setName('vote')
        .setDescription('Vote Base Command.'),
    long_description: 'Vote Base Command',
    subcommands: [vote_skip],
});
const restart = new commands_1.SlashSubcommand({
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('restart')
        .setDescription('Restarts the queue. MUST BE HOST'),
    long_description: 'Restarts the queue (start from the beginning). Only hosts may use this command.\n\n' +
        'Usage: `/music restart`' +
        'Examples: `/music restart`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = voice_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' }).then(Utils.VOID);
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply).then(Utils.VOID);
        if (!guildVoice.fullQueue.length) {
            return interaction.editReply({ content: 'There is no queue.' }).then(Utils.VOID);
        }
        const message = await interaction.editReply({
            content: '# Are you sure you want to restart the queue?',
            components: [
                new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder().setLabel('Yes!').setCustomId('restart/confirm').setEmoji('🔄').setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder().setLabel('No')
                    .setCustomId('restart/cancel')
                    .setStyle(discord_js_1.ButtonStyle.Secondary)),
            ],
        });
        const i = await message.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id,
            componentType: discord_js_1.ComponentType.Button,
            time: 60_000,
        }).catch(() => null);
        if (i && i.customId === 'restart/confirm') {
            await i.deferUpdate();
            // Low level access to guildVoice private fields
            guildVoice.reset(guildVoice.fullQueue.slice());
            if (guildVoice.fullQueue.length) {
                playNext(interaction.client, interaction.guildId);
                await i.editReply({ content: '🔄 Successfully restarted the queue.', components: [] });
            }
            else {
                await i.editReply({ content: 'There is no queue.', components: [] });
            }
        }
        else {
            return interaction.deleteReply();
        }
    },
});
// All commands are under this main command
exports.music = new commands_1.SlashCommandWithSubcommand({
    data: new discord_js_1.SlashCommandBuilder()
        .setName('music')
        .setDescription('Music base command.')
        .setDMPermission(false),
    long_description: 'Music base command',
    async textInputGetter(interaction) {
        return interaction.customId.split('/')[1];
    },
    async buttonReactGetter(interaction) {
        return interaction.customId.split('/')[2];
    },
    async menuReactGetter(interaction) {
        return interaction.customId.split('/')[2];
    },
    subcommands: [
        join, leave, np, play, host, clear, loop, pause, resume, queue, shuffle, prev, skip, remove,
        vote, restart,
    ],
});
//# sourceMappingURL=music_commands.js.map