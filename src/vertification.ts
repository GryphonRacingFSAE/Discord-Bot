import "fs";
import dotenv from "dotenv";
import { Client, EmbedBuilder, GuildMember, Message, TextChannel } from "discord.js";
import { createTransport } from "nodemailer";
import { createHash } from "crypto";
import { Mutex } from "async-mutex";
import xlsx from "xlsx";
import * as cron from "node-cron";
import fs from "node:fs";

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
type SpreadsheetQueue = {
    index: number; // Row to override
    row: Verification; // Data to override with
};
type SpreadsheetRow = {
    [key: string]: string | number;
};

const processing_members_code: Map<string, { email: string; id: string; time_stamp: number }> = new Map(); // Members and their codes
const FILE_PATH: string = "./onedrive/Verification Team Roster.xlsx";
const FORM_LINK: string = "https://forms.office.com/r/pTGwYxBTHq";
const GRYPHLIFE_LINK: string = "https://gryphlife.uoguelph.ca/organization/gryphonracing";
const PAYMENT_ACCEPT: string = "paid"; // What needs to be put in the payment_status column to be considered as paid
const GRYPHLIFE_ACCEPT: string = "yes"; // What needs to be put in the in_gryphlife column to be considered as accepted

export class SpreadsheetSingleton {
    private static instance: SpreadsheetSingleton;
    public mutex: Mutex;
    public _data: Array<Verification>;
    public _data_queue: Array<SpreadsheetQueue>;
    private constructor() {
        this.mutex = new Mutex();
        this._data = new Array<Verification>();
        this._data_queue = new Array<SpreadsheetQueue>();
    }

    public static getInstance(): SpreadsheetSingleton {
        if (!SpreadsheetSingleton.instance) {
            SpreadsheetSingleton.instance = new SpreadsheetSingleton();
        }
        return SpreadsheetSingleton.instance;
    }
}

// Since spreadsheets do not support appending well, we very easily run into overriding issues
// To counter this, we use a queue where any user_row anything pushed into it is set to override user_row
// (see: SpreadsheetQueue type)
// To push these changes, call pushSpreadsheet()
// It's highly recommended, if you are pushing multiple things at the same time, you batch them to best prevent
// overriding errors from occurring
const verification_spreadsheet = SpreadsheetSingleton.getInstance();
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

async function fileExists(filePath: string): Promise<boolean> {
    try {
        await fs.promises.access(filePath, fs.promises.constants.F_OK);
        return true;
    } catch {
        return false;
    }
}

// Pulls from the spreadsheet
export async function pullSpreadsheet(spreadsheet_singleton: SpreadsheetSingleton) {
    // Check if the main file exists
    await spreadsheet_singleton.mutex.runExclusive(async () => {
        if (!(await fileExists(FILE_PATH))) {
            const ws = xlsx.utils.aoa_to_sheet([
                ["Name", "Email", "Discord ID", "Has Paid", "In GryphLife"], // Column headers
            ]);
            const wb = xlsx.utils.book_new();
            xlsx.utils.book_append_sheet(wb, ws, "Sheet1");
            const buffer = xlsx.write(wb, {
                type: "buffer",
                bookType: "xlsx",
            });
            await fs.promises.writeFile(FILE_PATH, buffer);
            spreadsheet_singleton._data = [];
            return;
        }

        // Read from the chosen path
        const buffer = await fs.promises.readFile(FILE_PATH);
        const workbook = xlsx.read(buffer);
        const sheet_name_list = workbook.SheetNames;
        spreadsheet_singleton._data = (xlsx.utils.sheet_to_json(workbook.Sheets[sheet_name_list[0]]) as SpreadsheetRow[]).map((row: SpreadsheetRow) => {
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
    });
}

// Push to the spreadsheet file
export async function pushSpreadsheet(spreadsheet_singleton: SpreadsheetSingleton) {
    await pullSpreadsheet(spreadsheet_singleton).then(async () => {
        await spreadsheet_singleton.mutex.runExclusive(async () => {
            // Best way I could get it to only append
            while (verification_spreadsheet._data_queue.length) {
                const change = verification_spreadsheet._data_queue.pop();
                if (!change) {
                    break;
                }
                spreadsheet_singleton._data[change.index] = change.row;
            }

            const workbook = xlsx.utils.book_new();
            const translated_spreadsheet = spreadsheet_singleton._data.map((row: Verification) => {
                const new_row: SpreadsheetRow = {};
                for (const [key, value] of Object.entries(row)) {
                    const translated_key = COLUMN_NAME_MAPPING[key];
                    if (translated_key) {
                        new_row[translated_key as keyof SpreadsheetRow] = String(value);
                    }
                }
                return new_row;
            });
            const worksheet = xlsx.utils.json_to_sheet(translated_spreadsheet);

            xlsx.utils.book_append_sheet(workbook, worksheet, "Sheet1");

            const MAX_RETRIES: number = 10; // MAX RETRIES - 5
            let retries = 0;

            // Write the workbook to the filesystem
            while (retries < MAX_RETRIES) {
                try {
                    const buffer = xlsx.write(workbook, {
                        type: "buffer",
                        bookType: "xlsx",
                    });
                    await fs.promises.writeFile(FILE_PATH, buffer);
                    return true;
                } catch (err) {
                    // Failed to write to file usually due to something writing it already. Override it :D
                    retries += 1;
                    console.log(`Failed to write to ${FILE_PATH}. Due to: `, err);
                    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait 1 second before trying again
                }
            }
            return false;
        });
    });
}

// Checks the validity of verified members in the server
// This is what unverifies people if they're not part of GryphLife
async function checkMembershipVerified(client: Client) {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    if (!guild) return;
    const members = await guild.members.fetch();
    const verified_role = guild.roles.cache.find(role => role.name === "Verified");
    if (!verified_role) {
        console.log("No verified role found!");
        return;
    }
    await verification_spreadsheet.mutex.runExclusive(() => {
        Promise.allSettled(
            members.map(async member => {
                // Ignore all bots
                if (member.user.bot) {
                    return;
                }
                const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
                const user_row: Verification | undefined = verification_spreadsheet._data.find(data => data.discord_identifier === member.user.id);
                // ROLE REMOVAL IS TEMPORARILY DISABLED
                if (member.roles.cache.some(role => role.id === verified_role.id)) {
                    // Search for row in spreadsheet
                    if (!(user_row && validateMembership(user_row))) {
                        // User has Verified role + has not paid
                        //await member.roles.remove(verified_role);
                        // DM user that they have not paid and thus have been removed
                        //await member.send("You have been unverified from UofGuelph Racing due to not paying the club fee. Your user information may also be outdated, and you may need to re-verify again.");
                        //await member.send(
                        //    "You have **not** been unverified. However, this is a test, and we believe you are not properly entered into our system yet / have not paid membership fees & joined GryphLife. Please re-verify. You **do not need to sign up on GryphLife or redo the form**. Simply just follow through with the email verification.",
                        //);
                        console.log(`@${member.user.tag} will be unverified if they proceed with no action regarding verification.`);
                        try {
                            const channel = (await guild.channels.fetch(process.env.VERIFICATION_CHANNEL!)) as TextChannel;
                            await channel.send(`${member.user.tag} has been unverified.`);
                        } catch (err) {
                            console.log("Failed to send a un-verification message due to: ", err);
                        }
                    }
                } else if (user_row && validateMembership(user_row)) {
                    // User is valid member, but for some reason does not have their role...
                    await member.roles.add(verified_role);
                    try {
                        const channel = (await guild.channels.fetch(process.env.VERIFICATION_CHANNEL!)) as TextChannel;
                        await channel.send(`${member.user.tag} has been verified.`);
                    } catch (err) {
                        console.log("Failed to send a un-verification message due to: ", err);
                    }
                }
            }),
        ).catch(error => {
            console.log("Failed to un-verify user due to:\n", error);
        });
    });
    await pushSpreadsheet(verification_spreadsheet);
}

// Get all members in the guild who do not have the verification role
export async function verificationOnReady(client: Client) {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    if (!guild) {
        console.log("verification.ts could not find a guild!");
        return;
    }

    // Update spreadsheet
    await pullSpreadsheet(verification_spreadsheet);

    const verified_role = guild.roles.cache.find(role => role.name === "Verified");
    if (!verified_role) {
        console.log("No verified role found!");
        return;
    }
    await checkMembershipVerified(client);
    // Start a new cron task to de-verify everyone who hasn't paid or TODO: verify those whose status has changed
    cron.schedule("0 0 * * *", () => {
        checkMembershipVerified(client);
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
        return email.trim().endsWith("@uoguelph.ca");
    }
    return false;
}

// If it is between July-September, allow people who have not paid in. Otherwise,
// reject :D
function validateMembership(user_row: Verification): boolean {
    const current_month = new Date().getMonth();

    if (current_month >= 4 && current_month <= 8) {
        return true;
    }
    return user_row.payment_status.trim().toLowerCase() === PAYMENT_ACCEPT.trim().toLowerCase() && user_row.in_gryphlife.trim().toLowerCase() === GRYPHLIFE_ACCEPT.trim().toLowerCase();
}

// This handles the process of sending a verification message out to the user, but not processing if the code.
// Effectively, we check if a verification email could be sent out and if so, we send one
export async function handleVerification(client: Client, message: Message) {
    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    if (!guild) {
        return;
    }
    // Ignore bots
    if (message.author.bot) {
        return;
    }
    // Get guild member from author
    const guild_member = guild.members.cache.find(member => {
        return member.id === message.author.id;
    });
    if (guild_member === undefined) {
        await message.reply("You are not in the Gryphon racing server!");
        return;
    }
    // Allow for re-verification
    //if (guild_member.roles.cache.some(role => role.name === "Verified")) {
    //    await message.reply("You are already verified");
    //    return;
    //}

    // Make sure the email isn't already verified
    // If already verified make sure it's the same discord id
    await verification_spreadsheet.mutex.runExclusive(async () => {
        const entry = verification_spreadsheet._data.find(entry => entry.email === message.content);
        if (entry && entry.discord_identifier.length > 0 && entry.discord_identifier !== message.author.id) {
            await message.reply("Email is already registered with a different account's discord ID, please contact a `@Bot Developer` to resolve this issue.");
            return;
        }

        const email = message.content.toLowerCase(); // emails are not case-sensitive!!
        if (!validateEmail(email)) {
            await message.reply({ content: "Please send a valid email address. **Only @uoguelph.ca** domains are accepted." });
            return;
        }

        // Validate membership
        const user_row = verification_spreadsheet._data.find(data => data.email === email);
        console.log(message.author, "verifying with: ", user_row);

        if (!user_row) {
            await message.reply({
                content: `Your email is not yet registered. You may have not submitted your application to the [form](<${FORM_LINK}>), or your submission has not been reviewed yet.`,
            });
            return;
        }

        if (user_row.in_gryphlife.trim() !== GRYPHLIFE_ACCEPT) {
            await message.reply({ content: `You are not in the [GryphLife](<${GRYPHLIFE_LINK}>) organization, please wait to be accepted into the organization.` });
            return;
        }

        if (validateMembership(user_row)) {
            //processing_members.add(message.author.id);
            const verification_code = generateVerificationCode(message.author.id + message.author.tag);
            processing_members_code.set(message.author.id, {
                email: email,
                id: verification_code,
                time_stamp: Date.now(),
            });
            console.log("Attempting to send an email to:", user_row);
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
            return;
        } else if (user_row.payment_status.trim().toLowerCase() !== PAYMENT_ACCEPT.trim().toLowerCase()) {
            await message.reply({ content: "You may have not paid your team fee yet, this must be manually reviewed, please be patient." });
        } else if (user_row.in_gryphlife.trim().toLowerCase() !== GRYPHLIFE_ACCEPT.trim().toLowerCase()) {
            await message.reply({ content: "You may have not joined GrpyhLife yet, this must be manually reviewed, please be patient." });
        }
    });
}

// This deals with processing DMs.
// Ignores bots, users who are not trying to input their code (processing_members_code) will be dealt by
// handleVerification
// Users who are sending a code will be dealt with here
export async function handleVerificationDM(client: Client, message: Message) {
    if (!processing_members_code.has(message.author.id)) {
        await handleVerification(client, message);
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
    if (verification_code.id !== message.content) {
        await message.reply("The code you entered is not correct. Please enter the **7 digit code.**");
        return;
    }

    const guild = await client.guilds.fetch(process.env.DISCORD_GUILD_ID!);
    const member = await guild.members.fetch(message.author.id);
    const verified_role = guild.roles.cache.find(role => role.name === "Verified")!;
    await member.roles.add(verified_role);
    let USER_ROW_INDEX;
    let VERIFICATION_ROW;
    // Update spreadsheet
    await verification_spreadsheet.mutex.runExclusive(async () => {
        USER_ROW_INDEX = verification_spreadsheet._data.findIndex(data => data.email === verification_code.email)!;
        VERIFICATION_ROW = verification_spreadsheet._data[USER_ROW_INDEX];
        VERIFICATION_ROW.discord_identifier = message.author.id;
        verification_spreadsheet._data_queue.push({
            index: USER_ROW_INDEX,
            row: VERIFICATION_ROW,
        });
    });
    await pushSpreadsheet(verification_spreadsheet);
    processing_members_code.delete(message.author.id);

    if (fs.existsSync("./resources/verifications.txt")) {
        const verifications = fs.readFileSync("./resources/verifications.txt", "utf8");
        fs.writeFileSync("./resources/verifications.txt", verifications + verification_code.email + " " + message.author.tag + message.author.id + "\n");
        console.log(verifications + verification_code.email + " " + message.author.tag + " " + message.author.id + "\n");
    } else {
        fs.writeFileSync("./resources/verifications.txt", verification_code.email + " " + message.author.tag + " " + message.author.id + "\n");
        console.log(verification_code.email + " " + message.author.tag + " " + message.author.id + "\n");
    }

    await message.reply(`Verification successful! Welcome aboard, ${VERIFICATION_ROW!.name}.`);

    try {
        const channel = guild.channels.resolve(process.env.VERIFICATION_CHANNEL!) as TextChannel;
        await channel.send(`${message.author.tag} has been successfully verified.`);
    } catch (err) {
        console.log("Failed to send a message into verification channel due to:\n", err);
    }
}
