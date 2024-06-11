use std::collections::HashMap;
use std::time;

use anyhow::Result;
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::CacheHttp;

use crate::discord::get_role_id_from_name;

/// Responsible for handing out roles to users who have existing requirements

/// Updates a member's role
///
/// This is also where we will hardcode the roles given out
pub ddasync fn update_member_section_role(
    ctx: &serenity::Context,
    member: &serenity::Member,
) -> Result<()> {
    let role_assigments: HashMap<String, Vec<String>> = HashMap::from([
        (
            String::from("Dynamics"),
            vec![
                String::from("Frame"),
                String::from("Aerodynamics"),
                String::from("Brakes"),
                String::from("Suspension"),
            ],
        ),
        (
            String::from("Electrical"),
            vec![
                String::from("Low Voltage"),
                String::from("Embedded"),
                String::from("Tractive System"),
            ],
        ),
        (
            String::from("Business"),
            vec![
                String::from("Marketing"),
                String::from("Purchasing"),
                String::from("Sponsorship"),
            ],
        ),
    ]);

    for (section, subsections) in role_assigments.into_iter() {
        let section: serenity::RoleId =
            match get_role_id_from_name(ctx, &member.guild_id, &section).await {
                None => continue,
                Some(section) => section,
            };
        // .any cannot work here since async blocks are not ready yet
        let mut has_subsection = false;
        for subsection in subsections.into_iter() {
            match get_role_id_from_name(ctx, &member.guild_id, &subsection).await {
                None => continue,
                Some(subsection) => {
                    if member.roles.contains(&subsection) {
                        has_subsection = true;
                        break;
                    }
                }
            };
        }
        if !has_subsection && member.roles.contains(&section) {
            member.remove_role(ctx.http(), &section).await?;
        } else if has_subsection && !member.roles.contains(&section) {
            member.add_role(ctx.http(), &section).await?;
        }
    }
    Ok(())
}

pub async fn update_all_member_roles_periodically(
    ctx: serenity::Context,
    guild_id: serenity::GuildId,
) {
    loop {
        tokio::time::sleep(time::Duration::from_secs(60)).await;
        let members = match guild_id.members(ctx.http(), None, None).await {
            Ok(iter) => iter,
            Err(e) => {
                println!("Failed to get members for section roles: {e}");
                continue;
            }
        };
        for member in members {
            if let Err(e) = update_member_section_role(&ctx, &member).await {
                println!("Failed to update section roles: {e}");
            }
        }
    }
}
