use std::env::var;

use anyhow::Result;
use poise::serenity_prelude as serenity;
use poise::{Context, CreateReply};

use crate::discord::{get_role_id_from_name, user_has_roles_or};
use crate::embeds::{default_embed, GuelphColors};
use crate::services::verification::verification_db::update_verification_roles;
use crate::Data;

#[poise::command(slash_command, subcommands("update"), subcommand_required)]
pub async fn verification(ctx: Context<'_, Data, anyhow::Error>) -> Result<()> {
    Ok(())
}

/// Updates the **entire server's** verification status
#[poise::command(slash_command)]
pub async fn update(ctx: Context<'_, Data, anyhow::Error>) -> Result<()> {
    if !user_has_roles_or(
        ctx.serenity_context(),
        &ctx.author().id,
        &["Bot Developer", "Leads"],
    )
    .await
    {
        return Ok(());
    }
    let guild_id = serenity::GuildId::new(var("GUILD_ID").unwrap().parse().unwrap());
    let verified_role = get_role_id_from_name(ctx.serenity_context(), &guild_id, "Verified").await;
    if let Some(verified_role) = verified_role {
        match update_verification_roles(ctx.serenity_context(), &guild_id, &verified_role).await {
            Ok(_) => {
                ctx.send(
                    CreateReply::default()
                        .embed(
                            default_embed(GuelphColors::Blue)
                                .description("Updated everyone's verification status."),
                        )
                        .ephemeral(true),
                )
                .await?;
            }
            Err(e) => {
                ctx.send(
                    CreateReply::default()
                        .embed(
                            default_embed(GuelphColors::Red)
                                .description(format!("Failed to set feature flag due to {e}")),
                        )
                        .ephemeral(true),
                )
                .await?;
            }
        }
    } else {
        ctx.send(
            CreateReply::default()
                .embed(
                    default_embed(GuelphColors::Red).description("No `Verification` role found."),
                )
                .ephemeral(true),
        )
        .await?;
    }
    Ok(())
}
