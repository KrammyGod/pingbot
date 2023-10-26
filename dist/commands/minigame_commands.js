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
exports.flip = exports.guess = exports.desc = exports.name = void 0;
const DB = __importStar(require("../modules/database"));
const Utils = __importStar(require("../modules/utils"));
const exceptions_1 = require("../classes/exceptions");
const discord_js_1 = require("discord.js");
exports.name = 'Minigames';
exports.desc = 'This category is for commands that allow you to play fun games with your precious brons.';
class Cooldown {
    /**
     * Creates a singular cooldown.
     * @param rate The amount of times the command can be used per cooldown.
     * @param per The cooldown in seconds.
     */
    constructor(rate, per) {
        if (rate < 0)
            throw new Error('Rate cannot be negative.');
        if (per < 0)
            throw new Error('Cooldown cannot be negative.');
        this.rate = rate;
        this.per = per;
        // Amount of times it has been used.
        this.used = 0;
        this.last = Date.now();
    }
    force_cd() {
        this.used = this.rate;
        this.last = Date.now();
    }
    is_ready() {
        const next_ready_on = this.next_ready();
        // Cooldown rate has passed, reset.
        if (next_ready_on === '') {
            this.used = 1;
            this.last = Date.now();
            return '';
        }
        else if (this.used < this.rate) {
            ++this.used;
            return '';
        }
        return next_ready_on;
    }
    tries_left() {
        if (this.used >= this.rate) {
            return `No more attempts\nleft, more available\n${this.next_ready()}`;
        }
        const left = this.rate - this.used;
        return `${left}/${this.rate} attempt${left === 1 ? '' : 's'} left.`;
    }
    next_ready() {
        const next_ready = this.last + (this.per * 1000);
        if (next_ready < Date.now()) {
            // Already ready.
            return '';
        }
        return Utils.timestamp(next_ready, 'R');
    }
    get_ready_rate() {
        const is_ready = this.is_ready();
        if (is_ready === '')
            return '';
        const rate = this.rate === 1 ? '' : ` for ${this.rate} times`;
        return `currently on cooldown${rate}.\nMore available ${is_ready}`;
    }
}
/**
 * A mapping of any ID to a cooldown.
 * This allows global cooldowns, per-user cooldowns, per-guild cooldowns, etc.
 * If has more use, can be included as a separate module.
 */
class CooldownMapping {
    /**
     * Creates a mapping of any ID to a cooldown.
     * @param rate The amount of times the command can be used per cooldown.
     * @param per The cooldown in seconds.
     */
    constructor(rate, per) {
        if (rate < 0)
            throw new Error('Rate cannot be negative.');
        if (per < 0)
            throw new Error('Cooldown cannot be negative.');
        this.per = per;
        this.rate = rate;
        this.cooldowns = new Map();
    }
    get(key) {
        if (!this.cooldowns.has(key)) {
            this.cooldowns.set(key, new Cooldown(this.rate, this.per));
        }
        return this.cooldowns.get(key);
    }
}
function on_cd(name, cd) {
    const next_ready = cd.get_ready_rate();
    if (next_ready === '')
        return {};
    // Send an error message.
    const embed = new discord_js_1.EmbedBuilder({
        title: `${name} is ${next_ready}`,
        color: discord_js_1.Colors.Red
    });
    return { embeds: [embed] };
}
const num_docs = `Guess a number between 1 and 10 (inclusive) to win brons. You must have an account.
Cost: -1 bron per guess.
Cooldown: 75 seconds every 5 guesses.
__Prizes:__ 
> +5 brons (including cost) for guessing a number 1 away from the actual number.
> +10 brons (including cost) for guessing the actual number.

For the +5 brons prize, for example, if the number was 5, guessing 4 or 6 would award 5 brons.

Protip: You have higher chances of winning guessing middle numbers.`;
const guess_number = {
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('number')
        .setDescription('Guess a random number between 1 and 10')
        .addIntegerOption(option => option
        .setName('num')
        .setDescription('The number to guess')
        .setMinValue(1)
        .setMaxValue(10)
        .setRequired(true)),
    desc: `${num_docs}\n\n` +
        'Usage: `/guess number num: <number>`\n\n' +
        '__**Options**__\n' +
        '*num:* The number you choose to guess. (Required)\n\n' +
        'Example: `/guess number num: 5`',
    // Cooldown of 5 per 75 seconds.
    cds: new CooldownMapping(5, 75),
    async execute(interaction, client) {
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const cd = this.cds.get(interaction.user.id);
        const ret = on_cd(rich_cmd, cd);
        // Exists embeds to send.
        if (ret.embeds)
            return interaction.editReply(ret);
        // Generate a random number from 1 to 10.
        const embed = new discord_js_1.EmbedBuilder();
        const num = Math.floor(Math.random() * 10) + 1;
        const num_guess = interaction.options.getInteger('num');
        let title = '';
        let change = 0;
        // Jackpot
        if (num_guess === num) {
            embed.setColor(discord_js_1.Colors.Gold);
            title = 'Jackpot!';
            change = 10;
            // Guess within range
        }
        else if (num_guess === num - 1 || num_guess === num + 1) {
            embed.setColor(discord_js_1.Colors.Green);
            title = 'You were close.';
            change = 1;
            // Guess out of range
        }
        else {
            embed.setColor(discord_js_1.Colors.Red);
            title = 'Not my number.';
            change = -1;
        }
        // Will throw if user doesn't have enough brons.
        const success = await DB.addBrons(interaction.user.id, change).then(uid => uid === interaction.user.id).catch(err => {
            if (err instanceof exceptions_1.DatabaseMaintenanceError)
                throw err;
            return false;
        });
        if (!success) {
            const daily_cmd = await Utils.get_rich_cmd('daily');
            cd.force_cd();
            // On error:
            const embed = new discord_js_1.EmbedBuilder({
                title: 'You guessed wrong and you are poor. How dare you guess.\n' +
                    `You are now on cooldown. More available ${cd.next_ready()}`,
                description: `(Pssst try ${daily_cmd})`,
                color: discord_js_1.Colors.Red
            });
            return interaction.editReply({ embeds: [embed] });
        }
        embed.setTitle(`${title} ${change > 0 ? '+' : ''}${change} ${client.bot_emojis.brons}`)
            .setDescription(this.cds.get(interaction.user.id).tries_left())
            .setImage(`attachment://${num}.png`)
            .setFooter({ text: `My number was ${num}!` });
        return interaction.editReply({ embeds: [embed], files: [`files/${num}.png`] });
    }
};
// Guess Character here
exports.guess = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('guess')
        .addSubcommand(guess_number.data)
        .setDescription('Guess base command'),
    desc: 'Guess base command',
    subcommands: new Map()
        .set(guess_number.data.name, guess_number),
    async execute(interaction, client) {
        await interaction.deferReply();
        const cmd = this.subcommands.get(interaction.options.getSubcommand());
        return cmd.execute(interaction, client);
    }
};
const coin_docs = `Flip a coin and guess a side! You have a 2/3 chance of winning (unbalanced coin).

__Rules:__
> Your bet must be between 10-500 brons (subject to change)
> Cooldown is 5 flips every 3 hours.

Guessing correctly awards you your bet, and incorrectly will take away your bet.`;
async function generate_flip(client, interaction, side, bet) {
    // 2/3 chance of winning.
    const sides = ["heads" /* Coin.Heads */, "tails" /* Coin.Tails */, side];
    const chosen = sides[Math.floor(Math.random() * sides.length)];
    let title = '';
    let change = bet;
    const embed = new discord_js_1.EmbedBuilder();
    if (side === chosen) {
        embed.setColor(discord_js_1.Colors.Gold);
        title += `Bingo! It's ${chosen}!`;
    }
    else {
        embed.setColor(discord_js_1.Colors.Red);
        title += `Oof, it's ${chosen}.`;
        change = -bet;
    }
    // Will throw if user doesn't have enough brons.
    const res = await DB.addBrons(interaction.user.id, change).then(uid => uid === interaction.user.id).catch(err => {
        if (err instanceof exceptions_1.DatabaseMaintenanceError)
            throw err;
        return false;
    });
    embed.setTitle(`${title}\n${change > 0 ? '+' : ''}${change} ${client.bot_emojis.brons}`)
        .setImage(`attachment://${chosen}.png`);
    return [embed, [`files/${chosen}.png`], res];
}
const flip_heads = {
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('heads')
        .setDescription('Flip a coin and guess heads')
        .addIntegerOption(option => option
        .setName('bet')
        .setDescription('The amount of brons to bet')
        .setMinValue(10)
        .setMaxValue(500)
        .setRequired(true)),
    desc: `${coin_docs}\n\n` +
        'Usage: `/flip heads bet: <bet>`\n\n' +
        '__**Options**__\n' +
        '*bet:* The amount of brons you would like to bet. (Required)\n\n' +
        'Example: `/flip heads bet: 100`',
    // Unneded function; defined for typing
    async execute() { }
};
const flip_tails = {
    data: new discord_js_1.SlashCommandSubcommandBuilder()
        .setName('tails')
        .setDescription('Flip a coin and guess tails')
        .addIntegerOption(option => option
        .setName('bet')
        .setDescription('The amount of brons to bet')
        .setMinValue(10)
        .setMaxValue(500)
        .setRequired(true)),
    desc: `${coin_docs}\n\n` +
        'Usage: `/flip tails bet: <bet>`\n\n' +
        '__**Options**__\n' +
        '*bet:* The amount of brons you would like to bet. (Required)\n\n' +
        'Example: `/flip tails bet: 100`',
    // Unneded function; defined for typing
    async execute() { }
};
exports.flip = {
    data: new discord_js_1.SlashCommandBuilder()
        .setName('flip')
        .addSubcommand(flip_heads.data)
        .addSubcommand(flip_tails.data)
        .setDescription('Flip base command'),
    desc: 'Flip general command.',
    cds: new CooldownMapping(5, 3 * 60 * 60),
    subcommands: new Map()
        .set(flip_heads.data.name, flip_heads)
        .set(flip_tails.data.name, flip_tails),
    async execute(interaction, client) {
        await interaction.deferReply();
        const bet = interaction.options.getInteger('bet');
        const rich_cmd = await Utils.get_rich_cmd(interaction);
        const cd = this.cds.get(interaction.user.id);
        const ret = on_cd(rich_cmd, cd);
        if (ret.embeds)
            return interaction.editReply(ret);
        const cmd = interaction.options.getSubcommand();
        const [embed, files, success] = await generate_flip(client, interaction, cmd, bet);
        if (!success) {
            const daily_cmd = await Utils.get_rich_cmd('daily');
            cd.force_cd();
            // On error:
            const embed = new discord_js_1.EmbedBuilder({
                title: 'You guessed wrong and you are poor. How dare you guess.\n' +
                    `You are now on cooldown. More available ${cd.next_ready()}`,
                description: `(Pssst try ${daily_cmd})`,
                color: discord_js_1.Colors.Red
            });
            return interaction.editReply({ embeds: [embed] });
        }
        embed.setDescription(cd.tries_left());
        return interaction.editReply({ embeds: [embed], files });
    }
};
//# sourceMappingURL=minigame_commands.js.map