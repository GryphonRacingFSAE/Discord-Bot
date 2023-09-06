import fs from "node:fs";
import dotenv from "dotenv";
import { Client, EmbedBuilder, GuildMember, Message, TextChannel } from "discord.js";
import { createTransport } from "nodemailer";
import { createHash } from "crypto";
import xlsx from "xlsx";
const { readFile, writeFile, utils } = xlsx;
import * as cron from "node-cron";

dotenv.config(); // Load env parameters

const transporter = (() => {
    if (process.env.EMAIL_SERVICE) {
        return createTransport({
            service: process.env.EMAIL_SERVICE,
            port: Number(process.env.EMAIL_PORT),
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
    } else {
        return createTransport({
            host: process.env.EMAIL_HOST,
            port: Number(process.env.EMAIL_PORT),
            auth: {
                user: process.env.EMAIL_USERNAME,
                pass: process.env.EMAIL_PASSWORD,
            },
        });
    }
})();

type Verification = {
    name: string;
    email: string;
    discord_identifier: string;
    payment_status: string;
    in_gryphlife: string;
};
type SpreadsheetRow = {
    [key: string]: string | number;
};

export const members_to_monitor: Set<string> = new Set();
const processing_members_code: Map<string, { email: string; id: string; time_stamp: number }> = new Map(); // Members and their codes
const FILE_PATH = "./onedrive/Verification Team Roster.xlsx";
const FORM_LINK = "https://forms.office.com/r/pTGwYxBTHq";
const GRYPHLIFE_LINK = "https://gryphlife.uoguelph.ca/organization/gryphonracing";

let verification_spreadsheet: Array<Verification>;
// Spreadsheet column names are different from what we use internally, so we should convert between them
const COLUMN_NAME_MAPPING: { [key: string]: string } = {
    name: "Name",
    email: "Email",
    discord_identifier: "Discord ID",
    payment_status: "Has Paid",
    in_gryphlife: "In GryphLife",
};

// Reverse mapping for easier look-up
const REVERSE_COLUMN_NAME_MAPPING: { [key: string]: string } = {};
for (const [key, value] of Object.entries(COLUMN_NAME_MAPPING)) {
    REVERSE_COLUMN_NAME_MAPPING[value] = key;
}

// Pulls from the spreadsheet
function pullSpreadsheet() {
    // Check if the main file exists
    if (!fs.existsSync(FILE_PATH)) {
        const ws = utils.aoa_to_sheet([
            ["name", "email", "discord_identifier", "payment_status", "in_gryphlife"], // Column headers
        ]);
        const wb = utils.book_new();
        utils.book_append_sheet(wb, ws, "Sheet1");
        writeFile(wb, FILE_PATH);
        verification_spreadsheet = [];
        return;
    }

    // Read from the chosen path
    const workbook = readFile(FILE_PATH);
    const sheet_name_list = workbook.SheetNames;
    verification_spreadsheet = (utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]) as SpreadsheetRow[]).map((row: SpreadsheetRow) => {
        const new_row: Verification = {
            name: "",
            email: "",
            discord_identifier: "",
            payment_status: "",
            in_gryphlife: "",
        };
        for (const [key, value] of Object.entries(row)) {
            const translatedKey = REVERSE_COLUMN_NAME_MAPPING[key];
            if (translatedKey) {
                new_row[translatedKey as keyof Verification] = String(value);
            }
        }
        return new_row;
    });
}
pullSpreadsheet();
fs.watchFile(FILE_PATH, () => {
    pullSpreadsheet();
});

// Push to the spreadsheet file
async function pushSpreadsheet() {
    const workbook = utils.book_new();
    const translated_spreadsheet = verification_spreadsheet.map((row: Verification) => {
        const new_row: SpreadsheetRow = {};
        for (const [key, value] of Object.entries(row)) {
            const translated_key = COLUMN_NAME_MAPPING[key];
            if (translated_key) {
                new_row[translated_key as keyof SpreadsheetRow] = String(value);
            }
        }
        return new_row;
    });
    const worksheet = utils.json_to_sheet(translated_spreadsheet);

    utils.book_append_sheet(workbook, worksheet, "Sheet1");

    let retries: number = 0; // MAX RETRIES - 5

    // Write the workbook to the filesystem
    while (retries < 5) {
        try {
            writeFile(workbook, FILE_PATH);
            break;
        } catch (_) {
            // Failed to write to file usually due to something writing it already. Override it :D
            retries += 1;
            await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before trying again
        }
    }
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
    cron.schedule("0 0 * * *", () => {
        const current_month = new Date().getMonth();
        if (!(current_month >= 5 && current_month <= 8)) return;
        Promise.all(
            members.map(async member => {
                const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
                const channel = (await guild.channels.fetch(process.env.VERIFICATION_CHANNEL!)) as TextChannel;
                if (member.roles.cache.some(role => role.name === "Verified") && !member.user.bot) {
                    // Search for row in spreadsheet
                    const user_row = verification_spreadsheet.find(data => data.discord_identifier === member.user.tag);
                    if (!(user_row && validateMembership(user_row)) && member.roles.cache.has(verifiedRole.id)) {
                        // User has Verified role + has not paid
                        await member.roles.remove(verifiedRole);
                        // DM user that they have not paid and thus have been removed
                        await member.send("You have been unverified from UofGuelph Racing due to not paying the club fee.");
                        await channel.send(`${member.id} has been unverified.`);
                    }
                }
            }),
        );
    });
}

export async function sendVerificationMessage(member: GuildMember) {
    const embeds = new EmbedBuilder()
        .setTitle("UofG Racing Verification")
        .setDescription("Welcome! To gain access to the server, please verify yourself.")
        .addFields(
            { name: "How", value: `1. Apply to this [form](<${FORM_LINK}>).\n2. **DM the bot** the email given to the form.\n3. Follow the instructions given.` },
            { name: "Accepted emails", value: "**Only @uoguelph.ca** are accepted emails." },
            { name: "Code expiration", value: "Your code will **expire in 5 minutes**. If it has, please resend your email address and we will send you a new code." },
        )
        .setColor("#FFC72A")
        .setFooter({ text: "UofG Racing will not ask for passwords, credit card information, SSNs, ID, and/or tokens" });
    return member.send({
        embeds: [embeds],
    });
}

export function generateVerificationCode(user_id: string) {
    const hash = createHash("sha256");
    hash.update(user_id + Date.now().toString());

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

    if (current_month >= 4 && current_month <= 9) {
        return true;
    }

    return user_row.payment_status === "paid";
}

export async function handleVerification(message: Message) {
    // Ignore bots + users that are verified
    if (message.author.bot || !members_to_monitor.has(message.author.id)) {
        if (!message.author.bot) {
            await message.reply("You are already verified");
        }
        return;
    } else {
        // Make sure the email isn't already verified
        // If already verified make sure it's the same discord id
        const entry = verification_spreadsheet.find(entry => entry.email === message.content);
        if (entry && entry.discord_identifier !== message.author.tag) {
            await message.reply("Email is already registered with a different account's discord ID.");
            return;
        }
    }
    const email = message.content;
    if (!validateEmail(email)) {
        await message.reply({ content: "Please send a valid email address. **Only @uoguelph.ca** domains are accepted." });
        return;
    }
    // Validate membership
    const user_row = verification_spreadsheet.find(data => data.email === email);
    if (user_row && validateMembership(user_row) && user_row.in_gryphlife === "yes") {
        //processing_members.add(message.author.id);
        const verification_code = generateVerificationCode(message.author.id);
        processing_members_code.set(message.author.id, {
            email: email,
            id: verification_code,
            time_stamp: Date.now(),
        });
        await transporter
            .sendMail({
                from: process.env.EMAIL_USERNAME,
                to: email,
                subject: "UofG Racing Discord Verification Code",
                html: `Hello!<br>Here is your verification code: <strong>${verification_code}</strong>.<br>Your code will expire in 5 minutes.<br><strong>Do not share your verification code with others. We don't ask for passwords, addresses, credit card information, SSNs, and/or tokens.</strong>`,
            })
            .catch(err => {
                console.log("Error sending email", err);
                message.reply({ content: "Failed to send email address. Make sure your email address is valid." });
                return;
            });
        await message.reply({ content: "Please **DM the bot** with a 7 digit code sent to the email address. Type `cancel` if you wish to cancel the verification code." });
    } else if (!user_row) {
        await message.reply({ content: `Your email is not registered. You have not submitted your application to the [form](<${FORM_LINK}>).` });
    } else if (user_row.in_gryphlife !== "yes") {
        await message.reply({ content: `You are not in the [GryphLife](<${GRYPHLIFE_LINK}>) organization.` });
    } else {
        await message.reply({ content: "Your email is registered, but you have not paid yet." });
    }
}

export async function handleVerificationDM(client: Client, message: Message) {
    if (!processing_members_code.has(message.author.id)) {
        await handleVerification(message);
        return;
    } else if (message.author.bot) return;
    const verification_code = processing_members_code.get(message.author.id)!;
    // Give verification role if successful
    if (Date.now() - verification_code.time_stamp >= 1000 * 60 * 5) {
        await message.reply("Your code has expired. Please input your email address again to get a new code.");
        processing_members_code.delete(message.author.id);
        return;
    }
    if (message.content === "cancel") {
        // Verification cancelled
        processing_members_code.delete(message.author.id);
        await message.reply("Verification code cancelled. Please resend your email address to get a new one");
        return;
    }
    if (verification_code.id === message.content) {
        const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
        const member = await guild.members.fetch(message.author.id);
        const verified_role = guild.roles.cache.find(role => role.name === "Verified")!;
        await member.roles.add(verified_role);
        // Update spreadsheet
        const user_row = verification_spreadsheet.find(data => data.email === verification_code.email)!;
        user_row.discord_identifier = message.author.tag;
        await pushSpreadsheet();
        processing_members_code.delete(message.author.id);
        await message.reply(`Verification successful! Welcome aboard, ${user_row.name}.`);

        const channel = guild.channels.resolve(process.env.VERIFICATION_CHANNEL!) as TextChannel;
        await channel.send(`${message.author.tag} has been successfully verified`);
    } else {
        await message.reply("The code you entered is not correct. Please enter the **7 digit code.**");
    }
}
