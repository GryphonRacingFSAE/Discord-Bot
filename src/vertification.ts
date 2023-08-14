import fs from "node:fs";
import dotenv from "dotenv";
import { Client, GuildMember, Message } from "discord.js";
import { createTransport } from "nodemailer";
import { createHash } from "crypto";
import xlsx from "xlsx";
const { readFile, writeFile, utils } = xlsx;
import * as cron from "node-cron";

dotenv.config(); // Load env parameters
if (!process.env.DISCORD_GUILD_ID || !process.env.EMAIL_USERNAME || !process.env.EMAIL_PASSWORD || !process.env.EMAIL_HOST || !process.env.EMAIL_PORT || !process.env.HASH_SECRET_KEY) {
    throw new Error("Environment tokens are not defined!");
}

const transporter = createTransport({
    host: process.env.EMAIL_HOST,
    port: 587,
    auth: {
        user: process.env.EMAIL_USERNAME,
        pass: process.env.EMAIL_PASSWORD,
    },
});

type Verification = {
    name: string;
    email: string;
    discord_identifier: string;
    payment_status: string;
};

export const members_to_monitor: Set<string> = new Set();
const processing_members_code: Map<string, { email: string; id: string }> = new Map(); // Members and their codes
const FILE_PATH = "./onedrive/verification.xlsx";
const FORM_LINK = "https://www.youtube.com/watch?v=fC7oUOUEEi4";

let verification_spreadsheet: Array<Verification>;
// Pulls from the spreadsheet
function pullSpreadsheet() {
    if (fs.existsSync(FILE_PATH)) {
        // Read the spreadsheet if it exists
        const workbook = readFile(FILE_PATH);
        const sheetNameList = workbook.SheetNames;
        verification_spreadsheet = utils.sheet_to_json(workbook.Sheets[sheetNameList[0]]);
    } else {
        // If the file doesn't exist, create it with the necessary columns
        const ws = utils.aoa_to_sheet([
            ["name", "email", "discord_identifier", "payment_status"], // Column headers
        ]);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Sheet1");
        writeFile(wb, FILE_PATH);
        verification_spreadsheet = [];
    }
}
pullSpreadsheet();

// Push to the spreadsheet file
function pushSpreadsheet() {
    const workbook = utils.book_new();
    const worksheet = utils.json_to_sheet(verification_spreadsheet);

    utils.book_append_sheet(workbook, worksheet, "Sheet1");

    // Write the workbook to the filesystem
    writeFile(workbook, FILE_PATH);
}

// Get all members in the guild who do not have the verification role
export async function verificationOnReady(client: Client) {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    if (!guild) return;

    const members = await guild.members.fetch();
    members.forEach(member => {
        if (!member.roles.cache.some(role => role.name === "Verified") && !member.user.bot) {
            members_to_monitor.add(member.id);
        }
    });

    const verifiedRole = guild.roles.cache.find(role => role.name === "Verified");
    if (!verifiedRole) return;
    // Start a new cron task to de-verify everyone who hasn't paid
    cron.schedule("0 0 * * SUN", () => {
        const current_month = new Date().getMonth();
        if (!(current_month >= 6 && current_month <= 8)) return;
        members.forEach(member => {
            if (member.roles.cache.some(role => role.name === "Verified") && !member.user.bot) {
                // Search for row in spreadsheet
                const user_row = verification_spreadsheet.find(data => data.discord_identifier === member.user.tag);
                if (!(user_row && validateMembership(user_row)) && member.roles.cache.has(verifiedRole.id)) {
                    // User has Verified role + has not paid
                    member.roles.remove(verifiedRole);
                }
            }
        });
    });
}

// Simply removes member of guild id from members to monitor
export function verifiedMember(member: GuildMember) {
    members_to_monitor.delete(member.id);
}

export async function sendVerificationMessage(member: GuildMember) {
    return member.send("Welcome to the server! Please indicate your email address to get verified.");
}

export function generateVerificationCode(user_id: string) {
    const hash = createHash("sha256");
    hash.update(user_id + Date.now().toString() + process.env.HASH_SECRET_KEY);

    const chars = "0123456789";
    const hash_value = hash.digest("hex");

    let code = "";
    for (let i = 0; i < 7; i++) {
        const index = parseInt(hash_value.substring(i * 2, i * 2 + 2), 16) % chars.length;
        code += chars[index];
    }

    return code;
}

// Validates the email and make sure it is in the db
/* eslint-disable no-useless-escape */
/* eslint-disable no-control-regex */
export function validateEmail(email: string): boolean {
    // https://stackoverflow.com/questions/201323/how-can-i-validate-an-email-address-using-a-regular-expression
    if (
        /(?:[a-z0-9!#$%&'*+/=?^_`{|}~-]+(?:\.[a-z0-9!#$%&'*+/=?^_`{|}~-]+)*|"(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21\x23-\x5b\x5d-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])*")@(?:(?:[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.)+[a-z0-9](?:[a-z0-9-]*[a-z0-9])?|\[(?:(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9]))\.){3}(?:(2(5[0-5]|[0-4][0-9])|1[0-9][0-9]|[1-9]?[0-9])|[a-z0-9-]*[a-z0-9]:(?:[\x01-\x08\x0b\x0c\x0e-\x1f\x21-\x5a\x53-\x7f]|\\[\x01-\x09\x0b\x0c\x0e-\x7f])+)\])/.test(
            email,
        )
    ) {
        return email.endsWith("@uoguelph.ca");
    } else {
        return false;
    }
}

// If it is between July-September, allow people who have not paid in. Otherwise,
// reject :D
function validateMembership(user_row: Verification): boolean {
    const current_month = new Date().getMonth();

    if (current_month >= 6 && current_month <= 8) {
        return true;
    }

    return user_row.payment_status === "paid";
}

export async function handleVerification(message: Message) {
    // Ignore bots + users that are verified
    if (message.author.bot || !members_to_monitor.has(message.author.id)) return;
    const email = message.content;
    if (validateEmail(email)) {
        // Validate membership
        const user_row = verification_spreadsheet.find(data => data.email === email);
        if (user_row && validateMembership(user_row)) {
            //processing_members.add(message.author.id);
            const verification_code = generateVerificationCode(message.author.id);
            processing_members_code.set(message.author.id, {
                email: email,
                id: verification_code,
            });
            await transporter
                .sendMail({
                    from: process.env.EMAIL_USERNAME,
                    to: email,
                    subject: "UofG Racing Discord Verification Code",
                    html: `Hello!<br>Here is your verification code: <strong>${verification_code}</strong>.<br><strong>Do not share your verification code with others. We don't ask for passwords, addresses, credit card information, SSNs, and/or tokens.</strong>`,
                })
                .catch(_ => {
                    message.reply({ content: "Failed to send email address. Make sure your email address is valid." });
                    return;
                });
            await message.reply({ content: "Please **DM the bot** with a 7 digit code sent to the email address." });
        } else if (!user_row) {
            await message.reply({content: `You have not submitted your application to the [form](<${FORM_LINK}>)`});
        } else {
            await message.reply({content: "Your email is registered, but you have not paid yet."});
        }
    } else {
        await message.reply({ content: "Please send a valid email address." });
    }
}

export async function handleVerificationDM(client: Client, message: Message) {
    if (!processing_members_code.has(message.author.id)) {
        await handleVerification(message);
        return;
    } else if (message.author.bot) return;
    const verification_code = processing_members_code.get(message.author.id)!;
    // Give verification role if successful
    if (verification_code.id === message.content) {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
        const member = await guild.members.fetch(message.author.id);
        const verified_role = guild.roles.cache.find(role => role.name === "Verified")!;
        await member.roles.add(verified_role);
        // Update spreadsheet
        const user_row = verification_spreadsheet.find(data => data.email === verification_code.email)!;
        user_row.discord_identifier = message.author.tag;
        pushSpreadsheet();
        processing_members_code.delete(message.author.id);
        await message.reply(`Verification successful! Welcome aboard, ${user_row.name}.`);
    } else {
        await message.reply("Incorrect code.");
    }
}