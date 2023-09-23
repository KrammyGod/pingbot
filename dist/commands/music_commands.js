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
exports.restart = exports.vote = exports.remove = exports.skip = exports.prev = exports.shuffle = exports.queue = exports.resume = exports.pause = exports.loop = exports.clear = exports.host = exports.play = exports.np = exports.leave = exports.join = exports.desc = exports.name = void 0;
const util_1 = __importDefault(require("util"));
const play_dl_1 = __importDefault(require("play-dl"));
const GuildVoice_1 = __importDefault(require("../classes/GuildVoice"));
const Utils = __importStar(require("../modules/utils"));
const GuildVoice_2 = require("../classes/GuildVoice");
const client_1 = require("../classes/client");
const voice_1 = require("@discordjs/voice");
const discord_js_1 = require("discord.js");
exports.name = 'Music';
exports.desc = 'This category contains commands for playing music!';
function number_to_date_string(num) {
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
async function get_member(interaction) {
    let member = interaction.member;
    if (!(member instanceof discord_js_1.GuildMember)) {
        member = await interaction.guild.members.fetch(member?.user.id ?? '0').catch(() => null);
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
async function member_voice_valid(interaction, full_name) {
    const member = await get_member(interaction);
    if (!member)
        return null;
    if (!member.voice.channel) {
        return interaction.editReply({
            content: `You must be in a voice channel to use </${full_name}:${interaction.commandId}>`
        }).then(() => null);
    }
    return member;
}
function check_host(member, guildVoice, rich_cmd) {
    if (member.id !== guildVoice.host.id) {
        const host = guildVoice.host.id === member.client.user.id ? 'me' : guildVoice.host.toString();
        return {
            content: `You are not the host so you cannot use ${rich_cmd}. The host is ${host}`,
            allowedMentions: { users: [] }
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
async function nowPlaying(guildId) {
    // Really this is bad, but what can I do?
    const client = new client_1.CustomClient();
    const guildVoice = client_1.GuildVoices.get(guildId);
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
    const embed = new discord_js_1.EmbedBuilder({
        title: '🎶 Now Playing:',
        description: `${guildVoice.paused ? '⏸' : '▶️'} ${song.linkedTitle} ` +
            `${number_to_date_string(durationLeft)} left\n\n${bar} ` +
            `${number_to_date_string(playbackTime)} / ${number_to_date_string(song.duration)}`,
        color: discord_js_1.Colors.Blue
    }).setAuthor({
        name: `Added by: @${song.user.username}`,
        url: song.albumUrl,
        iconURL: song.user.displayAvatarURL()
    }).setFooter({
        text: `Loop type: ${guildVoice.loop}`
    }).setThumbnail(song.thumbnail);
    return embed;
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
async function playNext(guildId) {
    if (!getPlayNextLock(guildId))
        return;
    const guildVoice = client_1.GuildVoices.get(guildId);
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
exports.join = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('join')
        .setDescription('Joins the voice channel you are in.')
        .setDMPermission(false),
    desc: 'Joins the voice channel. Use this command to move me if I am already in a channel!\n' +
        'Note: You can only move me if you have the `MOVE_MEMBERS` permission!\n\n' +
        'Usage: `/join`\n\n' +
        'Examples: `/join`',
    async execute(interaction) {
        await interaction.deferReply();
        const me = interaction.guild.members.me;
        const member = await member_voice_valid(interaction, interaction.commandName);
        if (!member)
            return;
        const channel = interaction.channel;
        // This should never be true, but typescript is screaming.
        if (channel.isDMBased())
            return;
        const voiceChannel = member.voice.channel;
        let guildVoice = client_1.GuildVoices.get(interaction.guildId);
        const permissions = voiceChannel.permissionsFor(me);
        if (!permissions.has(discord_js_1.PermissionsBitField.Flags.Connect) || !permissions.has(discord_js_1.PermissionsBitField.Flags.Speak)) {
            return interaction.editReply({
                content: `I need the permissions to join and speak in ${voiceChannel}!`
            });
        }
        else if (!channel.permissionsFor(me).has(discord_js_1.PermissionsBitField.Flags.SendMessages)) {
            return interaction.editReply({
                content: `I need the permissions to send messages in ${channel}!`
            });
        }
        if (guildVoice) {
            // Fix later
            return interaction.editReply({ content: `I am already in ${guildVoice.voiceChannel}` });
        }
        else {
            guildVoice = new GuildVoice_1.default(channel, voiceChannel, member);
            client_1.GuildVoices.set(interaction.guildId, guildVoice);
            // Register listener for when song ends
            guildVoice.player.on(voice_1.AudioPlayerStatus.Idle, () => {
                // Leave if host is self, which means nobody is listening.
                if (guildVoice.host.id === me.user.id) {
                    guildVoice.destroy();
                    return guildVoice.textChannel.send({
                        content: `No one wants to listen to me in ${guildVoice.voiceChannel} so I'm leaving... 😭`
                    });
                }
                return playNext(guildVoice.voiceChannel.guildId);
            });
        }
        return interaction.editReply({ content: `✅ Success! I am now in ${voiceChannel}` });
    }
};
exports.leave = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('leave')
        .setDescription('Disconnects me from the voice channel. MUST BE HOST/MOD')
        .setDMPermission(false),
    desc: 'Leaves the voice channel. You can only disconnect me if you are the host/you have ' +
        '`MOVE_MEMBERS` permission!\n\n' +
        'Usage: `/leave`\n\n' +
        'Examples: `/leave`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_move_permission(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        guildVoice.destroy();
        return interaction.editReply({ content: `💨 Leaving ${guildVoice.voiceChannel} bye!` });
    },
};
exports.np = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('np')
        .setDescription('Shows the currently playing song.')
        .setDMPermission(false),
    desc: 'Shows the currently playing song in a pretty embed.\n\n' +
        'Usage: `/np`\n\n' +
        'Examples: `/np`',
    async execute(interaction) {
        await interaction.deferReply();
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        else if (!guildVoice.getCurrentSong()) {
            return interaction.editReply({ content: 'I am not playing anything.' });
        }
        const embed = await nowPlaying(interaction.guildId);
        return interaction.editReply({ embeds: [embed] });
    }
};
exports.play = {
    data: new discord_js_1.SlashCommandBuilder()
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
        .setDescription('Whether to shuffle the playlist before playing.'))
        .setDMPermission(false),
    desc: 'Plays a query in the voice channel! I will automatically join if I am not with you.\n\n' +
        'Usage: `/play query: <query> loop: [loop] shuffle: [shuffle]`\n\n' +
        '__**Options**__\n' +
        '*query:* The youtube, spotify, or search query to add. (Required)\n' +
        '*loop:* Set a loop option for the playlist. (Default: None)\n' +
        '*shuffle:* Whether to shuffle the playlist before adding. Only affects playlists. (Default: False) \n\n' +
        'Examples: `/play query: Rick Astley loop: 🔁 All`, ' +
        '`/play query: https://www.twitch.tv/videos/404860573 shuffle: True`',
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
        }
        else if (err.invalid) {
            return interaction.followUp({
                content: 'This video is NSFW and you are not in an NSFW enabled text channel ' +
                    "AND voice channel (due to discord's policies).\n" +
                    'If you believe this is an error, please report it to the support server.'
            });
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
    async execute(interaction) {
        let guildVoice = client_1.GuildVoices.get(interaction.guildId);
        const member = await member_voice_valid(interaction, interaction.commandName);
        if (!member)
            return;
        if (!guildVoice) {
            await exports.join.execute(interaction);
            guildVoice = client_1.GuildVoices.get(interaction.guildId);
            if (!guildVoice)
                return;
        }
        else if (member.voice.channelId !== guildVoice.voiceChannel.id) {
            return interaction.reply({ content: 'I am not with you, b-baka.', ephemeral: true });
        }
        else {
            await interaction.deferReply();
        }
        const link = interaction.options.getString('query');
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
        // Do token refresh in case of expiry for both spotify and youtube
        if (play_dl_1.default.is_expired()) {
            await play_dl_1.default.refreshToken();
        }
        const isNsfw = Utils.channel_is_nsfw_safe(interaction.channel) &&
            Utils.channel_is_nsfw_safe(guildVoice.voiceChannel);
        if (validateResults === 'yt_playlist') {
            if (!link.match(/(&|\?)index=[0-9]+/)) {
                const playlistInfo = await play_dl_1.default.playlist_info(link, { incomplete: true }).catch(() => undefined);
                if (!playlistInfo)
                    return this.on_partial_error(interaction, { notFound: true });
                showLink = playlistInfo.url;
                showThumbnail = playlistInfo.thumbnail?.url ?? null;
                for (const video of await playlistInfo.all_videos()) {
                    const song = new GuildVoice_2.Song(video, guildVoice.getUniqueId(), isNsfw, playlistInfo.url);
                    if (!this.validate_song(song, member))
                        continue;
                    songs.push(song);
                }
            }
            else {
                // Otherwise its still a single video
                const infoData = await play_dl_1.default.video_basic_info(link)
                    .then(res => res.video_details).catch(() => undefined);
                const song = new GuildVoice_2.Song(infoData, guildVoice.getUniqueId(), isNsfw);
                if (!this.validate_song(song, member)) {
                    return this.on_partial_error(interaction, song);
                }
                showThumbnail = song.thumbnail;
                showLink = song.url;
                songs.push(song);
            }
        }
        else if (validateResults === 'yt_video') {
            // Link is single video
            const infoData = await play_dl_1.default.video_basic_info(link)
                .then(res => res.video_details).catch(() => undefined);
            const song = new GuildVoice_2.Song(infoData, guildVoice.getUniqueId(), isNsfw);
            if (!this.validate_song(song, member)) {
                return this.on_partial_error(interaction, song);
            }
            showLink = song.url;
            showThumbnail = song.thumbnail;
            songs.push(song);
        }
        else if (validateResults && validateResults.startsWith('sp')) {
            // All spotify links
            const spotify = await play_dl_1.default.spotify(link).catch(() => undefined);
            if (!spotify)
                return this.on_partial_error(interaction, { notFound: true });
            showLink = spotify.url;
            showThumbnail = spotify.thumbnail?.url ?? null;
            if (spotify.type === 'track') {
                const song = new GuildVoice_2.Song(spotify, guildVoice.getUniqueId(), isNsfw);
                if (!this.validate_song(song, member)) {
                    return this.on_partial_error(interaction, song);
                }
                songs.push(song);
            }
            else {
                // Else its multiple songs
                const all_tracks = await spotify.all_tracks();
                for (const track of all_tracks) {
                    const song = new GuildVoice_2.Song(track, guildVoice.getUniqueId(), isNsfw, spotify.url);
                    if (!this.validate_song(song, member)) {
                        return this.on_partial_error(interaction, song);
                    }
                    songs.push(song);
                }
            }
        }
        else {
            const infoData = await play_dl_1.default.search(exports.name, {
                source: { youtube: 'video' },
                limit: 1,
                unblurNSFWThumbnails: isNsfw
            }).then(res => res[0]).catch(() => undefined);
            const song = new GuildVoice_2.Song(infoData, guildVoice.getUniqueId(), isNsfw);
            if (!this.validate_song(song, member)) {
                return this.on_partial_error(interaction, song);
            }
            showLink = song.url;
            songs.push(song);
        }
        if (shuffle)
            this.shuffle(songs);
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
            color: discord_js_1.Colors.Blue
        }).setAuthor({
            name: `Added by: @${member.user.tag}`,
            url: showLink,
            iconURL: member.user.displayAvatarURL()
        }).setFooter({
            text: `Loop type: ${guildVoice.loop}`
        }).setThumbnail(showThumbnail);
        await interaction.followUp({ embeds: [embed] });
        if (!guildVoice.started) {
            return playNext(interaction.guildId);
        }
    }
};
exports.host = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('host')
        .setDescription('Views the current host of the music channel.')
        .setDMPermission(false),
    desc: 'Views the current host of the music channel.\n\n' +
        'Usage: `/host`\n\n' +
        'Examples: `/host`',
    async execute(interaction) {
        await interaction.deferReply();
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        let host = guildVoice.host.toString();
        if (guildVoice.host.id === interaction.client.user.id) {
            host = 'me';
        }
        else if (guildVoice.host.id === interaction.user.id) {
            host = 'you';
        }
        return interaction.editReply({ content: `The host is ${host}`, allowedMentions: { users: [] } });
    }
};
exports.clear = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('clear')
        .setDescription('Clears the playlist. MUST BE HOST')
        .setDMPermission(false),
    desc: 'Clears the playlist. Only hosts may use this command.\n\n' +
        'Usage: `/clear`\n\n' +
        'Examples: `/clear`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        guildVoice.fullReset();
        return interaction.editReply({ content: '❌ **RIP Queue.**' });
    }
};
exports.loop = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('loop')
        .setDescription('Sets the loop mode. MUST BE HOST')
        .addStringOption(option => option
        .setName('type')
        .setDescription('The new type of loop.')
        .addChoices({ name: '🔀 None', value: "NONE" /* LoopType.none */ }, { name: '🔂 One', value: "ONE" /* LoopType.one */ }, { name: '🔁 All', value: "ALL" /* LoopType.all */ }).setRequired(true))
        .setDMPermission(false),
    desc: 'Sets a new loop type. Only hosts may use this command.\n\n' +
        'Usage: `/loop type: <type>`\n\n' +
        '__**Options**__\n' +
        '*type:* The type of loop to add. Please select one. (Required)\n\n' +
        'Examples: `/loop type: `🔀 None',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        guildVoice.loop = interaction.options.getString('type');
        return interaction.editReply({ content: `✅ Loop type set to ${guildVoice.loop}` });
    }
};
exports.pause = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('pause')
        .setDescription('Pauses the current song. MUST BE HOST')
        .setDMPermission(false),
    desc: 'Pauses the current song. Only hosts may use this command.\n\n' +
        'Usage: `/pause`\n\n' +
        'Examples: `/pause`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        if (guildVoice.paused) {
            guildVoice.player.unpause();
            guildVoice.paused = false;
            return interaction.editReply({ content: '▶️ Resumed.' });
        }
        else {
            guildVoice.player.pause();
            guildVoice.paused = true;
            return interaction.editReply({ content: '⏸ Paused.' });
        }
    }
};
exports.resume = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('resume')
        .setDescription('Resumes the current song. MUST BE HOST')
        .setDMPermission(false),
    desc: 'Resumes the current song. Only hosts may use this command.\n\n' +
        'Usage: `/resume`\n\n' +
        'Examples: `/resume`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        if (guildVoice.paused) {
            guildVoice.player.unpause();
            guildVoice.paused = false;
            return interaction.editReply({ content: '▶️ Resumed.' });
        }
        else {
            return interaction.editReply({ content: 'I am not paused.' });
        }
    }
};
exports.queue = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('queue')
        .setDescription('Shows the current queue.')
        .addIntegerOption(option => option
        .setName('page')
        .setDescription('The page number of the queue to get')
        .setMinValue(1))
        .setDMPermission(false),
    desc: 'Shows the current queue.\n\n' +
        'Usage: `/queue`\n\n' +
        'Examples: `/queue`',
    getPage(userID, guildVoice, page) {
        const embed = new discord_js_1.EmbedBuilder({
            title: 'Here is the current queue:',
            color: discord_js_1.Colors.Blue
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
            ephemeral: true
        };
        if (page < 1) {
            const error_embed = new discord_js_1.EmbedBuilder({
                title: 'Please enter a positive number.',
                color: discord_js_1.Colors.Red
            });
            followUp.embeds.push(error_embed);
            page = 1;
        }
        else if (page > max_pages) {
            const error_embed = new discord_js_1.EmbedBuilder({
                title: `Too high. Max page: ${max_pages}`,
                color: discord_js_1.Colors.Red
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
            iconURL: currentQueue[0].user.displayAvatarURL()
        }).setFooter({ text: `Loop type: ${guildVoice.loop}` });
        const jumpPage = Math.floor(idx / 10) + (idx % 10 ? 1 : 0);
        const buttons = [
            new discord_js_1.ButtonBuilder()
                .setEmoji('↩️')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setCustomId(`queue/${userID}/${jumpPage}/`)
                .setDisabled(!song),
            new discord_js_1.ButtonBuilder()
                .setEmoji('⬅️')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setCustomId(`queue/${userID}/${page - 1}`)
                .setDisabled(page === 1),
            new discord_js_1.ButtonBuilder()
                .setEmoji('➡️')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setCustomId(`queue/${userID}/${page + 1}`)
                .setDisabled(page === max_pages),
            new discord_js_1.ButtonBuilder()
                .setEmoji('🔀')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setCustomId(`shuffle/${userID}/${page}`)
                .setDisabled(userID !== guildVoice.host.id),
            new discord_js_1.ButtonBuilder()
                .setEmoji('📄')
                .setStyle(discord_js_1.ButtonStyle.Primary)
                .setCustomId(`queue/${userID}/input`)
        ];
        const retval = {
            embeds: [embed],
            components: [
                new discord_js_1.ActionRowBuilder().addComponents(...buttons)
            ]
        };
        if (followUp.embeds.length > 0) {
            retval.followUp = followUp;
        }
        return retval;
    },
    async textInput(interaction) {
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice)
            return; // No longer playing music
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
        if (followUp)
            return interaction.followUp(followUp);
    },
    async buttonReact(interaction) {
        const [page] = interaction.customId.split('/').slice(2);
        const val = parseInt(page);
        if (isNaN(val)) {
            if (page === 'input') {
                const input = new discord_js_1.ModalBuilder({
                    title: 'Jump to page',
                    customId: 'queue',
                    components: [
                        new discord_js_1.ActionRowBuilder({
                            components: [
                                new discord_js_1.TextInputBuilder({
                                    label: 'Page #',
                                    customId: 'value',
                                    placeholder: 'Enter the page number to jump to...',
                                    style: discord_js_1.TextInputStyle.Short,
                                    maxLength: 100,
                                    required: true
                                })
                            ]
                        })
                    ]
                });
                return interaction.showModal(input);
            }
            else {
                throw new Error(`Page ${page} is not a valid type.`);
            }
        }
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice)
            return; // No longer playing music
        await interaction.deferUpdate();
        const { embeds, components } = this.getPage(interaction.user.id, guildVoice, val);
        return interaction.editReply({ embeds, components });
    },
    async execute(interaction) {
        await interaction.deferReply();
        const page = interaction.options.getInteger('page') ?? 1;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
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
exports.shuffle = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('shuffle')
        .setDescription('Shuffles the current queue. MUST BE HOST')
        .setDMPermission(false),
    desc: 'Shuffles the entire queue. Only hosts may use this command.\n\n' +
        'Usage: `/shuffle`\n\n' +
        'Example: `/shuffle`',
    async buttonReact(interaction) {
        await interaction.deferUpdate();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice)
            return interaction.deleteReply();
        const reply = check_host(member, guildVoice, 'this button');
        if (reply)
            return interaction.followUp({ ...reply, ephemeral: true });
        guildVoice.shuffle();
        const page = parseInt(interaction.customId.split('/').slice(2)[0]);
        const { embeds, components } = exports.queue.getPage(interaction.user.id, guildVoice, page);
        await interaction.editReply({ embeds, components });
        return interaction.followUp({ content: '🔀 Successfully shuffled the queue.', ephemeral: true });
    },
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        guildVoice.shuffle();
        return interaction.editReply({ content: '🔀 Successfully shuffled the queue.' });
    }
};
exports.prev = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('prev')
        .setDescription('Plays the previous song. MUST BE HOST')
        .setDMPermission(false),
    desc: 'Plays the previous song. Only hosts may use this command.\n\n' +
        'Usage: `/prev`\n\n' +
        'Example: `/prev`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        // Using lower-level access, however more efficient.
        const currIdx = guildVoice.fullQueue.findIndex(song => song.id === guildVoice.songs[0]?.id);
        if (currIdx === 0)
            return interaction.editReply({ content: '❌ There is no previous song.' });
        // Hack we do, pretend we just started playing so it doesn't skip the new song we added.
        guildVoice.songs.unshift(guildVoice.fullQueue[currIdx - 1]);
        guildVoice.started = false;
        guildVoice.player.stop();
        return interaction.editReply({ content: '✅ Successfully rewinded to previous song.' });
    }
};
exports.skip = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('skip')
        .setDescription('Skips the current song. MUST BE HOST')
        .setDMPermission(false),
    desc: 'Skips the current song. Only hosts may use this command.\n\n' +
        'Usage: `/skip`\n\n' +
        'Example: `/skip`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        // A bit of outside handling, but its minor
        // Shift the internal queue to force next song when loop type is One.
        if (guildVoice.loop === "ONE" /* LoopType.one */)
            guildVoice.songs.shift();
        guildVoice.player.stop();
        return interaction.editReply({ content: '✅ Successfully skipped the current song.' });
    }
};
const remove_song = {
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('song')
        .setDescription('Removes a song from the queue. MUST BE HOST')
        .addIntegerOption(option => option
        .setName('index')
        .setDescription('The index of the song to remove.')
        .setMinValue(1)
        .setRequired(true)),
    desc: 'Removes a song at a certain index. Cannot be used to skip the current playing song\n' +
        'Use {/skip} to skip the current song instead. Only hosts may use this command.\n\n' +
        'Usage: `/remove song index: <index>`\n\n' +
        '__**Options**__\n' +
        '*index:* The index of the song in the queue. See {/queue} (Required)\n\n' +
        'Examples: `/remove song index: 1`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        const idx = interaction.options.getInteger('index') - 1;
        const res = guildVoice.removeSong(idx);
        if (res === -1) {
            return interaction.editReply({ content: `There are only ${guildVoice.fullQueue.length} songs.` });
        }
        else if (res === 0) {
            const skip_cmd = await Utils.get_rich_cmd('skip');
            return interaction.editReply({
                content: `Song at index ${idx + 1} is currently playing. Use ${skip_cmd} instead.`
            });
        }
        return interaction.editReply({ content: `✅ Successfully removed song at index ${idx + 1}.` });
    }
};
exports.remove = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('remove')
        .setDescription('Remove base description')
        .addSubcommand(remove_song.data)
        .setDMPermission(false),
    desc: 'Remove base command',
    subcommands: new Map()
        .set(remove_song.data.name, remove_song),
    async execute(interaction) {
        const subcmd = this.subcommands.get(interaction.options.getSubcommand());
        return subcmd.execute(interaction);
    }
};
const vote_skip = {
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('skip')
        .setDescription('Votes to skip the current song.')
        .addBooleanOption(option => option
        .setName('skip')
        .setDescription('Whether to vote skip or not.')
        .setRequired(true)),
    desc: 'Votes to skip the current song.\n\n' +
        'Usage: `/vote skip skip: <vote>`\n\n' +
        '__**Options**__\n' +
        '*skip:* Whether to vote skip or not. (Required)\n\n' +
        'Examples: `/vote skip skip: True`',
    setEmbed(embed, guildVoice, requiredVotes) {
        let desc = '';
        desc += `**Song: ${guildVoice.getCurrentSong().linkedTitle}**\n`;
        embed.setDescription(`${desc}\n\nVotes required to skip: \`${guildVoice.voted.length}/${requiredVotes}\``);
        return embed;
    },
    async execute(interaction) {
        await interaction.deferReply();
        // const vote = interaction.options.getBoolean('skip')!;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
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
exports.vote = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('vote')
        .setDescription('Vote Base Command.')
        .addSubcommand(vote_skip.data)
        .setDMPermission(false),
    desc: 'Vote Base Command',
    subcommands: new Map()
        .set(vote_skip.data.name, vote_skip),
    async execute(interaction) {
        const subcmd = this.subcommands.get(interaction.options.getSubcommand());
        return subcmd.execute(interaction);
    }
};
exports.restart = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('restart')
        .setDescription('Restarts the queue. MUST BE HOST')
        .setDMPermission(false),
    desc: 'Restarts the queue (start from the beginning). Only hosts may use this command.\n\n' +
        'Usage: `/restart`' +
        'Examples: `/restart`',
    async execute(interaction) {
        await interaction.deferReply();
        const member = await get_member(interaction);
        if (!member)
            return;
        const guildVoice = client_1.GuildVoices.get(interaction.guildId);
        if (!guildVoice) {
            return interaction.editReply({ content: 'I am not in a voice channel.' });
        }
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const reply = check_host(member, guildVoice, rich_cmd);
        if (reply)
            return interaction.editReply(reply);
        const message = await interaction.editReply({
            content: 'Are you sure you want to restart the queue?',
            components: [new discord_js_1.ActionRowBuilder().addComponents(new discord_js_1.ButtonBuilder()
                    .setLabel('Yes!')
                    .setCustomId('restart/confirm')
                    .setEmoji('👍')
                    .setStyle(discord_js_1.ButtonStyle.Success), new discord_js_1.ButtonBuilder()
                    .setLabel('No!')
                    .setCustomId('restart/cancel')
                    .setEmoji('👎')
                    .setStyle(discord_js_1.ButtonStyle.Danger))]
        });
        const i = await message.awaitMessageComponent({
            filter: i => i.user.id === interaction.user.id,
            componentType: discord_js_1.ComponentType.Button,
            time: 60000
        }).catch(() => null);
        if (i && i.customId === 'restart/confirm') {
            await i.deferUpdate();
            // Low level access to guildVoice private fields
            guildVoice.reset(guildVoice.fullQueue.slice());
            if (guildVoice.fullQueue.length) {
                playNext(interaction.guildId);
                return i.editReply({ content: '✅ Successfully restarted the queue.', components: [] });
            }
            else {
                return i.editReply({ content: 'There is no queue.', components: [] });
            }
        }
        else {
            return interaction.client.deleteFollowUp(interaction, message);
        }
    }
};
//# sourceMappingURL=music_commands.js.map