// Detects when a member is updated (i.e roles are added/removed)
// The purpose of this is to auto-assign Dynamics, Electrical, and Business roles

import { Events, GuildMember } from "discord.js";

function arrayNotUndefined<T>(value: (T | undefined)[]): value is T[] {
    return value.every(v => v !== undefined);
}

export async function updateSubsectionRoles(member: GuildMember) {
    console.log(`Updating subsection roles for ${member.user.tag}`);

    const dynamics = member.guild.roles.cache.find(role => role.name === "Dynamics");
    const electrical = member.guild.roles.cache.find(role => role.name === "Electrical");
    const business = member.guild.roles.cache.find(role => role.name === "Business");

    if (!dynamics || !electrical || !business) {
        console.error("Cannot find one or more of the following roles: Dynamics, Electrical, Business");
        return;
    }

    const dynamics_subsections = ["Frame", "Aerodynamics", "Suspension", "Brakes"];
    const electrical_subsections = ["Low Voltage", "Embedded", "Tractive System"];
    const business_subsections = ["Purchasing", "Marketing", "Sponsorship"];

    const dynamics_subsection_roles = dynamics_subsections.map(subsection => member.guild.roles.cache.find(role => role.name === subsection));
    const electrical_subsection_roles = electrical_subsections.map(subsection => member.guild.roles.cache.find(role => role.name === subsection));
    const business_subsection_roles = business_subsections.map(subsection => member.guild.roles.cache.find(role => role.name === subsection));

    if (!arrayNotUndefined(dynamics_subsection_roles) || !arrayNotUndefined(electrical_subsection_roles) || !arrayNotUndefined(business_subsection_roles)) {
        console.error("Cannot find the role for a subsection.");
        return;
    }

    // If the member has the Dynamics role
    if (dynamics_subsection_roles.some(subsection => member.roles.cache.has(subsection.id)) && !member.roles.cache.has(dynamics.id)) {
        await member.roles.add(dynamics);
    } else if (!dynamics_subsection_roles.some(subsection => member.roles.cache.has(subsection.id)) && member.roles.cache.has(dynamics.id)) {
        // If the member has the Dynamics role but no subsection roles
        await member.roles.remove(dynamics);
    }

    // If the member has the Electrical role
    if (electrical_subsection_roles.some(subsection => member.roles.cache.has(subsection.id)) && !member.roles.cache.has(electrical.id)) {
        await member.roles.add(electrical);
    } else if (!electrical_subsection_roles.some(subsection => member.roles.cache.has(subsection.id)) && member.roles.cache.has(electrical.id)) {
        // If the member has the Electrical role but no subsection roles
        await member.roles.remove(electrical);
    }

    // If the member has the Business role
    if (business_subsection_roles.some(subsection => member.roles.cache.has(subsection.id)) && !member.roles.cache.has(business.id)) {
        await member.roles.add(business);
    } else if (!business_subsection_roles.some(subsection => member.roles.cache.has(subsection.id)) && member.roles.cache.has(business.id)) {
        // If the member has the Business role but no subsection roles
        await member.roles.remove(business);
    }
    console.log(`Done updating subsection roles for ${member.user.tag}`);
}

export default {
    name: Events.GuildMemberUpdate,
    once: false,
    async execute(old_member: GuildMember, new_member: GuildMember) {
        await updateSubsectionRoles(new_member);

        // If the role(s) are present on the old member object but no longer on the new one (i.e role(s) were removed)
        const removedRoles = old_member.roles.cache.filter(role => !new_member.roles.cache.has(role.id));
        if (removedRoles.size > 0) {
            console.log(`The roles ${removedRoles.map(r => r.name)} were removed from ${old_member.displayName}.`);
        }

        // If the role(s) are present on the new member object but are not on the old one (i.e role(s) were added)
        const addedRoles = new_member.roles.cache.filter(role => !old_member.roles.cache.has(role.id));
        if (addedRoles.size > 0) {
            console.log(`The roles ${addedRoles.map(r => r.name)} were added to ${old_member.displayName}.`);
        }
    },
};
