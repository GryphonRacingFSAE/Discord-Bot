use diesel::prelude::*;
use diesel_async::RunQueryDsl;
use poise::{Context, CreateReply};
use poise::serenity_prelude::CreateMessage;

use crate::Data;
use crate::db::establish_db_connection;
use crate::embeds::{default_embed, GuelphColors};
use crate::services::verification::verification_db::update_verification_roles_from_members;

/// These commands are public facing that anyone can use without any issue
#[poise::command(slash_command, subcommands("help", "unlink"), subcommand_required)]
pub async fn verify(_: Context<'_, Data, anyhow::Error>) -> anyhow::Result<()> {
    Ok(())
}

/// Get help on the verification process
#[poise::command(slash_command)]
pub async fn help(ctx: Context<'_, Data, anyhow::Error>) -> anyhow::Result<()> {
    let embed =
        default_embed(GuelphColors::Blue)
            .title("UofG Student FSAE verification")
            .description("Welcome! We're happy to see you here. To get started, please verify
                your identity and link your discord account to your UofG email account.")

            .field("How?", "1. DM the bot your **@uoguelph.ca** email\n2. Send the bot the code sent to the email address\n3. Done!", false)
            .field("Code expiration", "Any code sent will expire within **5 minutes**.", false);
    ctx.author()
       .direct_message(ctx.http(), CreateMessage::default().embed(embed))
       .await?;
    ctx.send(
        CreateReply::default()
            .embed(default_embed(GuelphColors::Blue).description("Check your DMs!"))
            .ephemeral(true),
    )
       .await?;
    Ok(())
}

/// Unlink your discord account from your UofG email account
#[poise::command(slash_command)]
pub async fn unlink(ctx: Context<'_, Data, anyhow::Error>) -> anyhow::Result<()> {
    if !ctx
        .guild_id()
        .map(|gid| gid == ctx.data().guild_id)
        .unwrap_or(false)
    {
        return Ok(());
    }
    let msg = ctx
        .send(
            CreateReply::default()
                .embed(default_embed(GuelphColors::Blue).description("Unlinking..."))
                .ephemeral(true),
        )
        .await?;
    let mut db = establish_db_connection().await?;
    use crate::schema::verifications::dsl::*;
    match diesel::update(verifications.filter(discord_id.eq(ctx.author().id.get())))
        .set(discord_id.eq(None::<u64>))
        .execute(&mut db)
        .await
    {
        Ok(amount) => {
            if amount > 0 {
                let member = ctx.author_member().await;
                if let Some(member) = member {
                    update_verification_roles_from_members(
                        ctx.serenity_context(),
                        &mut db,
                        ctx.data().verified_role.as_ref().unwrap(),
                        &[member.into_owned()],
                    )
                        .await?;
                    msg.edit(
                        ctx,
                        CreateReply::default().embed(
                            default_embed(GuelphColors::Blue).description("Successfully unlinked."),
                        ),
                    )
                       .await?;
                }
            } else {
                msg.edit(
                    ctx,
                    CreateReply::default().embed(
                        default_embed(GuelphColors::Red).description("There is no account linked."),
                    ),
                )
                   .await?;
            }
        }
        Err(_) => {
            msg.edit(
                ctx,
                CreateReply::default()
                    .embed(default_embed(GuelphColors::Red).description("Internal error.")),
            )
               .await?;
        }
    }
    Ok(())
}
