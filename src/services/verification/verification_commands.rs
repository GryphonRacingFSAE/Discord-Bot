use std::time;

use anyhow::Result;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use futures::TryFutureExt;
use log::warn;
use poise::serenity_prelude as serenity;
use poise::{Context, CreateReply};
use tokio::try_join;

use crate::db::establish_db_connection;
use crate::discord::{get_name_from_user_id, is_user_in_guild, user_has_roles_or};
use crate::embeds::{default_embed, GuelphColors};
use crate::services::verification::verification_db::{
    update_verification_roles, update_verification_roles_from_members, verification_entry_exists,
    Verification,
};
use crate::services::verification::verification_discord::{
    add_verification_error_fields, generate_embed_error,
};
use crate::Data;

#[poise::command(
    slash_command,
    subcommands("update", "status", "link"),
    subcommand_required
)]
pub async fn verification(_: Context<'_, Data, anyhow::Error>) -> Result<()> {
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
    let guild_id = ctx.data().guild_id;
    let verified_role = ctx.data().verified_role;
    let mut db = establish_db_connection().await?;
    if let Some(verified_role) = verified_role {
        match update_verification_roles(ctx.serenity_context(), &mut db, &guild_id, &verified_role)
            .await
        {
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

/// Get the verification status of a random member on the server
#[poise::command(slash_command)]
pub async fn status(
    ctx: Context<'_, Data, anyhow::Error>,
    #[description = "Member to check verification status of"] member: serenity::Member,
) -> Result<()> {
    let mut db = establish_db_connection().await?;
    use crate::schema::verifications::dsl::*;
    if let Ok(entry) = verifications
        .filter(discord_id.eq(member.user.id.get()))
        .first::<Verification>(&mut db)
        .await
    {
        match add_verification_error_fields(
            Some(
                generate_embed_error()
                    .description(format!(
                        "{} ({}) is not verified in our system.",
                        member.user.name, member.user.id
                    ))
                    .field(
                        "Does not exist",
                        "User has not yet linked their discord account to their UofG email",
                        false,
                    ),
            ),
            &entry,
        ) {
            None => {
                ctx.send(
                    CreateReply::default()
                        .embed(default_embed(GuelphColors::Blue).description(format!(
                            "{} ({}) is verified in our system.",
                            member.user.name, member.user.id
                        )))
                        .ephemeral(true),
                )
                .await?;
            }
            Some(embed) => {
                ctx.send(CreateReply::default().embed(embed).ephemeral(true))
                    .await?;
            }
        }
    } else {
        ctx.send(
            CreateReply::default()
                .embed(
                    generate_embed_error()
                        .description(format!(
                            "{} ({}) is not verified in our system.",
                            member.user.name, member.user.id
                        ))
                        .field(
                            "Does not exist",
                            "User has not yet linked their discord account to their UofG email",
                            false,
                        ),
                )
                .ephemeral(true),
        )
        .await?;
    }

    Ok(())
}

#[poise::command(slash_command)]
pub async fn link(
    ctx: Context<'_, Data, anyhow::Error>,
    #[description = "Email to change discord-email account link to"] email: String,
    #[description = "Member to check verification status of"] member: Option<serenity::Member>,
) -> Result<()> {
    if !user_has_roles_or(
        ctx.serenity_context(),
        &ctx.author().id,
        &["Bot Developer", "Leads"],
    )
    .await
    {
        return Ok(());
    } else if ctx.data().verified_role.is_none() {
        warn!("Expected role to exist named `Verified`, got NULL.");
        return Ok(());
    }
    let mut embed =
        default_embed(GuelphColors::Blue).description("Are you sure you want to do this?");
    let mut db = establish_db_connection().await?;
    let old_verification: Option<Verification> = match verification_entry_exists(&mut db, &email)
        .await?
    {
        None => {
            ctx.send(CreateReply::default().ephemeral(true).embed(
                default_embed(GuelphColors::Red).description(format!(
                    "Expected verification entry at email `{}`, got NULL.",
                    email
                )),
            ))
            .await?;
            return Ok(());
        }
        Some(data) => {
            if let Some(id) = data.discord_id {
                let name =
                    get_name_from_user_id(ctx.serenity_context(), serenity::UserId::new(id)).await;
                embed = embed
                    .field(
                        "WARNING",
                        format!(
                            "You will be replacing an existing link to user: {} ({id})",
                            name.as_deref().unwrap_or("")
                        ),
                        false,
                    )
                    .colour(GuelphColors::Red.to_colour());
                Some(data)
            } else {
                None
            }
        }
    };
    let yes_button = serenity::CreateButton::new("verification_link_yes")
        .style(serenity::ButtonStyle::Danger)
        .label("Yes");
    let no_button = serenity::CreateButton::new("verification_link_no")
        .style(serenity::ButtonStyle::Primary)
        .label("Cancel");
    let action_row = serenity::CreateActionRow::Buttons(vec![yes_button, no_button]);
    let msg = ctx
        .send(
            CreateReply::default()
                .ephemeral(true)
                .components(vec![action_row])
                .embed(embed),
        )
        .await?;
    let interactive_response = msg
        .message()
        .await?
        .await_component_interactions(ctx.serenity_context())
        .timeout(time::Duration::from_secs(30));
    let in_email: String = email;
    match interactive_response.await {
        None => {
            ctx.send(
                CreateReply::default()
                    .ephemeral(true)
                    .embed(default_embed(GuelphColors::Black).description("Response expired.")),
            )
            .await?;
        }
        Some(interaction) => match interaction.data.custom_id.as_str() {
            "verification_link_yes" => {
                let defer_future = interaction
                    .defer_ephemeral(ctx.http())
                    .map_err(anyhow::Error::from);
                let mut db = establish_db_connection().await?;
                let unlink_future = {
                    let member = member.clone();
                    db.transaction::<_, anyhow::Error, _>(|db| {
                        async move {
                            use crate::schema::verifications::dsl::*;
                            diesel::update(verifications.filter(email.eq(in_email)))
                                .set(discord_id.eq(member.as_ref().map(|m| m.user.id.get())))
                                .execute(db)
                                .await?;
                            Ok(())
                        }
                        .scope_boxed()
                    })
                };
                try_join!(defer_future, unlink_future)?;
                let mut changed_members: Vec<serenity::Member> = Vec::new();
                if let Some(member) = member {
                    changed_members.push(member);
                }
                if let Some(verification) = old_verification {
                    if is_user_in_guild(
                        ctx.serenity_context(),
                        ctx.data().guild_id,
                        serenity::UserId::new(verification.discord_id.unwrap()),
                    )
                    .await?
                    {
                        changed_members.push(
                            ctx.data()
                                .guild_id
                                .member(
                                    ctx.http(),
                                    serenity::UserId::new(verification.discord_id.unwrap()),
                                )
                                .await?,
                        );
                    }
                }
                update_verification_roles_from_members(
                    ctx.serenity_context(),
                    &mut db,
                    ctx.data().verified_role.as_ref().unwrap(),
                    &changed_members,
                )
                .await?;
                interaction
                    .edit_response(
                        ctx.http(),
                        serenity::EditInteractionResponse::new()
                            .embed(default_embed(GuelphColors::Blue).description("Done!"))
                            .components(vec![]),
                    )
                    .await?;
            }
            "verification_link_no" => {
                interaction
                    .create_response(
                        ctx.http(),
                        serenity::CreateInteractionResponse::UpdateMessage(
                            serenity::CreateInteractionResponseMessage::new()
                                .embed(
                                    default_embed(GuelphColors::Blue)
                                        .description("Task successfully cancelled"),
                                )
                                .components(vec![]),
                        ),
                    )
                    .await?;
            }
            _ => {}
        },
    }
    Ok(())
}
