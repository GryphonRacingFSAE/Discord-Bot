/**
 * Roses are red, violets have bled, spreadsheets is really bad.
 * We connect to Drizzle ORM to figure out which users have paid, in gryphlife, and etc.
 */

import { APIEmbedField, Client, EmbedBuilder, GuildMember, Role } from "discord.js";
import { eq, sql } from "drizzle-orm";
import * as schema from "@/schema.ts";
import { format_embed } from "@/util.ts";
import { db } from "@/db.ts";
import { isFeatureEnabled } from "@/posthog.ts";

// Error codes to make it easier for us to scream at the user
// No email? 🗿 No discord? 🗿 No gryphlife? 🗿 And most importantly no payment? 🗿🗿🗿
/**
 * @description Indicates the reason why the user is getting their access revoked
 */
export enum UserStatus {
    success = 0,
    noEmail = 1 << 0, // 1
    noDiscord = 1 << 1, // 2
    noGryphLife = 1 << 2, // 4
    noPayment = 1 << 3, // 8
    noDataBase = 1 << 4, // 16
}

const FAQ_SECTION = format_embed(
    new EmbedBuilder().setTitle("Frequently asked Questions").addFields(
        {
            name: "No email?",
            value: "For some reason beyond our human comprehension, you do not have an email associated with your account. Please contact `@Bot Developer` for assistance.",
        },
        { name: "No Discord?", value: "You have not completed the process for verifying your discord account." },
        { name: "No GryphLife?", value: "You have not joined the UoG GryphLife club." },
        { name: "No payment?", value: "You have not paid your clue fees yet." },
        { name: "No database?", value: "You have not been registered **yet** on our database. See the next section." },
        {
            name: "I did do these things, but I'm still not in!",
            value: "Please be patient our servers are either dead or super bogged down with requests. Wait at most 24 hours before contacting a `@Bot Developer` for assistance.",
        },
    ),
    "yellow",
);

// Commonly used prepared sql queries
export const user_by_email = db !== undefined ? db.query.users.findFirst({ where: eq(schema.users.email, sql.placeholder("email")) }).prepare() : undefined;

export const user_by_discord_id = db !== undefined ? db.query.users.findFirst({ where: eq(schema.users.discordId, sql.placeholder("discord_id")) }).prepare() : undefined;

// We consolidate checking of user fields in here to see if users should be allowed or not
function user_allowed(user: schema.User | undefined): UserStatus {
    // SHOUT OUT TO DISCRETE MATH RAHHHHH
    return user
        ? 0 |
              (user.email && user.email.length > 0 ? 0 : UserStatus.noEmail) |
              (user.discordId && user.discordId.length > 0 ? 0 : UserStatus.noDiscord) |
              (user.gryphLife ? 0 : UserStatus.noGryphLife) |
              (user.paymentStatus ? 0 : UserStatus.noPayment)
        : UserStatus.noDataBase;
}

/**
 * @description Builds a denial message including why they were revoked given a status
 */
function build_denial_message(status: UserStatus): EmbedBuilder[] {
    const fields: APIEmbedField[] = [];
    if (status & UserStatus.noEmail) {
        fields.push({ name: "No email", value: "You do not have an email account associated. " });
    }
    if (status & UserStatus.noDiscord) {
        fields.push({ name: "No discord", value: "You do not have an associated discord account." });
    }
    if (status & UserStatus.noPayment) {
        fields.push({ name: "No payment", value: "You have not paid the club fees due." });
    }
    if (status & UserStatus.noGryphLife) {
        fields.push({ name: "No GryphLife", value: "You have not joined the GryphLife club." });
    }
    if (status & UserStatus.noDataBase) {
        fields.push({ name: "No database entry", value: "You are not in our database." });
    }

    return [
        format_embed(
            new EmbedBuilder().setTitle("Removal").setDescription("Your access to the server has been revoked. We have provided the reasons below why your access was removed.").addFields(fields),
            "red",
        ),
        FAQ_SECTION,
    ];
}

/**
 * @description Responsible for removing the permissions role + sending a message to users passed in
 * @returns Array of users unverified
 */
export async function prune_members(_client: Client, users: { discord: GuildMember; reason: UserStatus }[], verified_role: Role) {
    // Check if role removal is enabled via feature flag
    const canRemoveRoles = await isFeatureEnabled("VERIFICATION_ROLE_REMOVE");
    
    return Promise.all(
        users.map(async user => {
            if (!user.discord.roles.cache.has(verified_role.id) || user.discord.id !== "676195749800968192") return undefined;
            
            if (canRemoveRoles) {
                try {
                    await user.discord.roles.remove(verified_role);
                    await user.discord.send({ embeds: build_denial_message(user.reason) });
                    return user;
                } catch (err) {
                    console.error(`Failed to remove verification role for ${user.discord.user.tag}: ${err}`);
                    return undefined;
                }
            } else {
                console.log(`Would remove access from ${user.discord.user.tag} (reason: ${user.reason}), but role removal is disabled by feature flag`);
                return undefined;
            }
        }),
    );
}

/**
 * @description Checks members in the server whether they're actually verified or not.
 * @returns List of people removed
 **/
export async function check_members(client: Client, members: GuildMember[]) {
    // we first find all database occurances of the discord id. if it doesn't exist, get them out of here
    const guild = await client.guilds.fetch(Deno.env.get("DISCORD_GUILD_ID")!);
    const verified_role = guild.roles.cache.find(role => role.name === "Verified");
    if (verified_role === undefined) {
        // permissions role... doesn't exist?
        return [];
    }
    
    // Check if database connection is available
    if (user_by_discord_id === undefined) {
        console.warn("Database connection not available, skipping member checks");
        return [];
    }
    
    // we will be pruning this
    return Promise.all(
        members.map(async member => {
            try {
                // get all db users that have the same discord id
                return await user_by_discord_id.execute({ discord_id: member.user.id });
            } catch (error) {
                console.error(`Failed to query user ${member.user.id}:`, error);
                return undefined;
            }
        }),
    )
        .then(results => {
            // POSSIBLE OPTIMIZATION: we store index rather than guild member (unsure of benefits)
            const dbUsers: { db: schema.User; discord: GuildMember }[] = [];
            const invalidUsers = results.reduce((acc: { discord: GuildMember; reason: UserStatus }[], result, index) => {
                if (result !== undefined) {
                    dbUsers.push({ db: result, discord: members[index] });
                } else {
                    acc.push({
                        discord: members[index],
                        reason: UserStatus.noDataBase,
                    });
                }
                return acc;
            }, []);

            // Process further based on valid and invalid members
            return { dbUsers, invalidUsers };
        })
        .then(async ({ dbUsers, invalidUsers }) => {
            // we simply check for basic requirements here for users with a db
            const usersToProcess = [];
            const canAddRoles = await isFeatureEnabled("VERIFICATION_ROLE_ADD");
            for (const user of dbUsers) {
                // is user not allowed? then include them
                const status = user_allowed(user.db);
                const has_verification_role = user.discord.roles.cache.has(verified_role.id);
                if (status !== UserStatus.success && has_verification_role) {
                    usersToProcess.push({
                        discord: user.discord,
                        reason: status,
                    });
                } else if (status === UserStatus.success && !has_verification_role) {
                    // Check if role addition is enabled via feature flag
                    if (canAddRoles) {
                        // somehow meet the requirements but don't have the role...
                        user.discord.roles.add(verified_role.id).then(_ => {
                            return user.discord.send({
                                embeds: [format_embed(new EmbedBuilder().setTitle("Access granted").setDescription("You now have access to the UoG FSAE discord server."), "yellow")],
                            });
                        });
                    } else {
                        console.log(`Would grant access to ${user.discord.user.tag}, but role addition is disabled by feature flag`);
                    }
                }
            }
            
            return [...invalidUsers, ...usersToProcess];
        })
        .then(users => prune_members(client, users, verified_role));
}
