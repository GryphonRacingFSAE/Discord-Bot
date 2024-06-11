use std::env::var;

use anyhow::Result;
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::{CacheHttp, GuildId, Member, RoleId, UserId};

/// Random utility stuff for discord

/// If user is in a given GuildID
pub async fn is_user_in_guild(
    ctx: &serenity::Context,
    guild_id: GuildId,
    user_id: UserId,
) -> Result<bool> {
    if let Some(guild) = guild_id.to_guild_cached(&ctx.cache) {
        if guild.members.contains_key(&user_id) {
            return Ok(true);
        }
    }

    match guild_id.members(&ctx.http, None, None).await {
        Ok(members) => {
            if members.iter().any(|member| member.user.id == user_id) {
                return Ok(true);
            }
        }
        Err(err) => {
            return Err(err.into());
        }
    }

    Ok(false)
}

pub async fn get_role_id_from_name(
    ctx: &serenity::Context,
    guild_id: &GuildId,
    role_name: &str,
) -> Option<RoleId> {
    let roles = guild_id.roles(ctx.http()).await.ok()?;
    roles
        .iter()
        .find(|(_, role)| role.name == role_name)
        .map(|(role_id, _)| *role_id)
}

/// Will search for the first role
pub async fn member_has_role(
    ctx: &serenity::Context,
    member: &Member,
    guild_id: &GuildId,
    role_name: &str,
) -> bool {
    if let Some(role_id) = get_role_id_from_name(ctx, guild_id, role_name).await {
        member.roles.contains(&role_id)
    } else {
        false
    }
}

/// User has either OR roles
pub async fn user_has_roles_or(
    ctx: &serenity::Context,
    user: &UserId,
    role_names: &[&str],
) -> bool {
    let guild_id: GuildId = match var("GUILD_ID") {
        Ok(guild_id_str) => match guild_id_str.parse::<u64>() {
            Ok(id) => GuildId::new(id),
            Err(_) => return false,
        },
        Err(_) => return false,
    };

    let member: Member = match guild_id.member(ctx.http(), *user).await {
        Ok(member) => member,
        Err(_) => return false,
    };

    for name in role_names.iter() {
        if let Some(id) = get_role_id_from_name(ctx, &guild_id, name).await {
            if member.roles.contains(&id) {
                return true;
            }
        }
    }
    false
}

pub async fn get_guild_member_from_user(
    ctx: &serenity::Context,
    guild_id: GuildId,
    user: UserId,
) -> Result<Option<Member>> {
    Ok(guild_id
        .members(ctx.http(), None, None)
        .await?
        .iter()
        .find(|member| member.user.id == user)
        .cloned())
}
