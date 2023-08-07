// Detects when a member is updated (i.e roles are added/removed)
// The purpose of this is to auto-assign Dynamics, Electrical, and Business roles

import { Events, GuildMember } from "discord.js";

function arrayNotUndefined<T>(value: (T | undefined)[]): value is T[] {
    return value.every(v => v !== undefined);
}

export async function updateSubsectionRoles(member: GuildMember) {
    console.log(`Updating subsection roles for ${member.user.tag}`);

    const category_mapping = {
        Dynamics: ["Frame", "Aerodynamics", "Suspension", "Brakes"],
        Electrical: ["Low Voltage", "Embedded", "Tractive System"],
        Business: ["Purchasing", "Marketing", "Sponsorship"],
    };

    for (const [category, subsections] of Object.entries(category_mapping)) {
        const category_role = member.guild.roles.cache.find(role => role.name === category);
        if (!category_role) {
            console.error(`Cannot find role ${category}`);
            continue;
        }

        const subsection_roles = subsections.map(subsection => member.guild.roles.cache.find(role => role.name === subsection));

        if (!arrayNotUndefined(subsection_roles)) {
            console.error(`Cannot find one or more of the following roles: ${subsections.join(", ")}`);
            continue;
        }

        // If the member has some subsection roles (and doesn't already have the category role)
        if (subsection_roles.some(subsection => member.roles.cache.has(subsection.id)) && !member.roles.cache.has(category_role.id)) {
            await member.roles.add(category_role);
        }
        // If the member doesn't have any of the subsection roles (and has the category role)
        else if (!subsection_roles.some(subsection => member.roles.cache.has(subsection.id)) && member.roles.cache.has(category_role.id)) {
            await member.roles.remove(category_role);
        }
    }

    console.log(`Done updating subsection roles for ${member.user.tag}`);
}

export default {
    name: Events.GuildMemberUpdate,
    once: false,
    async execute(old_member: GuildMember, new_member: GuildMember) {
        await updateSubsectionRoles(new_member);
    },
};
