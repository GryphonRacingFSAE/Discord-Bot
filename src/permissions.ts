/**
 * @description Utilities for manging command permissions
 */
import { Guild, GuildMember } from "discord.js";

/**
 * @description Determines of a guild member has permissions
 * @param member
 * @param roles Name of the roles they're expected to have AT LEAST
 */
export async function member_has_permission_or(member: GuildMember, roles: string[]): Promise<boolean> {
    for (const r of roles) {
        if (member.roles.cache.some(role => role.name === r)) {
            return true;
        }
    }
    return false;
}
