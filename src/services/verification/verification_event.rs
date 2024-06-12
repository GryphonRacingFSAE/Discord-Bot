use std::env::var;
use std::str::FromStr;

use anyhow::Result;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, RunQueryDsl};
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::CacheHttp;

use crate::db::establish_db_connection;
use crate::discord::{
    get_guild_member_from_user, get_role_id_from_name, is_user_in_guild, member_has_role,
};
use crate::embeds::{default_embed, GuelphColors};
use crate::services::verification::verification_db::{
    valid_verification_session, verification_entry_exists, Verification, VerificationSession,
};
use crate::services::verification::verification_discord::add_verification_error_fields;
use crate::services::verification::verification_email::{generate_code, send_email};

/// A new verification was requested
///
/// **Assumes no other existing verification session. This must be validated prior.**
pub async fn new_verification(
    ctx: &serenity::Context,
    msg: &serenity::Message,
    guild_id: serenity::GuildId,
) -> Result<()> {
    let recipient = lettre::message::Mailbox::from_str(&msg.content.to_lowercase());
    let mut db = establish_db_connection().await?;
    if recipient.is_err() {
        msg.channel_id
            .send_message(
                ctx.http(),
                serenity::CreateMessage::new()
                    .embed(default_embed(GuelphColors::Red).description("Invalid email sent.")),
            )
            .await?;
        return Ok(());
    };
    let recipient = recipient.unwrap();
    if !recipient.to_string().ends_with("@uoguelph.ca") {
        msg.channel_id
            .send_message(
                ctx.http(),
                serenity::CreateMessage::new().embed(default_embed(GuelphColors::Red).description(
                    format!(
                        "Expected a `@uoguelph.ca` email address, got: {}",
                        recipient.email
                    ),
                )),
            )
            .await?;
        return Ok(());
    }
    // check if email is already in use?
    if let Some(verification_entry) =
        verification_entry_exists(&mut db, &recipient.to_string()).await?
    {
        if verification_entry.is_in_server(ctx, guild_id).await {
            msg.channel_id
                .send_message(
                    ctx.http(),
                    serenity::CreateMessage::new().embed(
                        default_embed(GuelphColors::Red)
                            .description("This email is already registered."),
                    ),
                )
                .await?;
            return Ok(());
        }
    } else {
        msg.channel_id.send_message(ctx.http(), serenity::CreateMessage::new().embed(
            default_embed(GuelphColors::Red).description("This email is not registered yet. If this problem persists beyond 48 hours, please contact anyone with `@Bot Developer`")
        )).await?;
        return Ok(());
    }
    // start verification process
    let verification_code = generate_code();
    let mut db = establish_db_connection().await?;
    db.transaction::<_, anyhow::Error, _>(|db| async move {
        let new_session = VerificationSession::new(
            recipient.to_string(),
            msg.author.id.get(),
            verification_code,
        );
        diesel::sql_query(
            "INSERT INTO verification_sessions (email, discord_id, code, timestamp) VALUES (?, ?, ?, ?) \
            ON DUPLICATE KEY UPDATE discord_id = VALUES(discord_id), code = VALUES(code), timestamp = VALUES(timestamp)"
        )
            .bind::<diesel::sql_types::Varchar, _>(new_session.email.clone())
            .bind::<diesel::sql_types::Unsigned<diesel::sql_types::Bigint>, _>(new_session.discord_id)
            .bind::<diesel::sql_types::Unsigned<diesel::sql_types::Bigint>, _>(new_session.code)
            .bind::<diesel::sql_types::Unsigned<diesel::sql_types::Bigint>, _>(new_session.get_timestamp())
            .execute(db)
            .await?;

        send_email(recipient.clone(), verification_code).await?;
        msg.channel_id.send_message(ctx.http(), serenity::CreateMessage::new().embed(
            default_embed(GuelphColors::Blue).description(format!("We have sent an email to you at `{}` containing your **7 digit** verification code. Please respond back with the code. **Do not share this code with anyone else.**", recipient))
                                             .field("Cancelling verification session", "To cancel the current verification session, type `quit`.", false)
        )).await.map_err(anyhow::Error::from)?;
        Ok(())
    }.scope_boxed()).await?;

    Ok(())
}

/// Handles existing verification sessions
pub async fn handle_verification_code(
    ctx: &serenity::Context,
    msg: &serenity::Message,
) -> Result<()> {
    if msg.content.parse::<u64>().is_err() {
        msg.channel_id
            .send_message(
                ctx.http(),
                serenity::CreateMessage::new().embed(
                    default_embed(GuelphColors::Red)
                        .description("Please submit a valid verification code."),
                ),
            )
            .await?;
        return Ok(());
    }
    let mut db = establish_db_connection().await?;
    let verification_lock_entry: Option<VerificationSession> = {
        use crate::schema::verification_sessions::dsl::*;
        verification_sessions
            .filter(discord_id.eq(msg.author.id.get()))
            .first::<VerificationSession>(&mut db)
            .await
            .ok()
    };
    if verification_lock_entry.is_none() {
        msg.channel_id
            .send_message(
                ctx.http(),
                serenity::CreateMessage::new().embed(
                    default_embed(GuelphColors::Red)
                        .description("No active verification session found."),
                ),
            )
            .await?;
        return Ok(());
    }
    let verification_lock_entry: VerificationSession = verification_lock_entry.unwrap();
    if verification_lock_entry.is_expired() {
        msg.channel_id
            .send_message(
                ctx.http(),
                serenity::CreateMessage::new().embed(
                    default_embed(GuelphColors::Red).description(
                        "Expired verification session. Please try re-submit your email.",
                    ),
                ),
            )
            .await?;
        use crate::schema::verification_sessions::dsl::*;
        diesel::delete(verification_sessions.filter(email.eq(&verification_lock_entry.email)))
            .execute(&mut db)
            .await?;
        return Ok(());
    } else if verification_lock_entry.code != msg.content.parse::<u64>().unwrap() {
        msg.channel_id
            .send_message(
                ctx.http(),
                serenity::CreateMessage::new()
                    .embed(default_embed(GuelphColors::Red).description("Incorrect code.")),
            )
            .await?;
        return Ok(());
    }
    use crate::schema::verifications::dsl::*;
    let verification_entry = verifications
        .filter(email.eq(verification_lock_entry.email.clone()))
        .first::<Verification>(&mut db)
        .await?;

    if let Some(embed) = add_verification_error_fields(None, &verification_entry) {
        msg.channel_id
            .send_message(ctx.http(), serenity::CreateMessage::new().embed(embed))
            .await?;
        return Ok(());
    }
    let guild_id = serenity::GuildId::new(var("GUILD_ID").unwrap().parse()?);
    let member: Option<serenity::Member> =
        get_guild_member_from_user(ctx, guild_id, msg.author.id).await?;
    if member.is_none() {
        msg.channel_id
            .send_message(
                ctx.http(),
                serenity::CreateMessage::new().embed(
                    default_embed(GuelphColors::Red)
                        .description("You are not in the Gryphon FSAE discord server."),
                ),
            )
            .await?;
        return Ok(());
    }
    let member: serenity::Member = member.unwrap();
    let verification_role_id = get_role_id_from_name(ctx, &guild_id, "Verified")
        .await
        .unwrap(); // this situation should be impossible (if it is, what the fuck)
    let has_role: bool = member_has_role(ctx, &member, &guild_id, "Verified").await;
    db.transaction::<_, anyhow::Error, _>(|db| {
        async move {
            {
                use crate::schema::verification_sessions::dsl::*;
                diesel::delete(
                    verification_sessions.filter(email.eq(&verification_lock_entry.email)),
                )
                .execute(db)
                .await?;
            }
            diesel::update(verifications.filter(email.eq(verification_lock_entry.email.clone())))
                .set(discord_id.eq(msg.author.id.get()))
                .execute(db)
                .await?;
            if !has_role {
                member.add_role(ctx.http(), verification_role_id).await?;
            }
            msg.channel_id
                .send_message(
                    ctx.http(),
                    serenity::CreateMessage::new().embed(
                        default_embed(GuelphColors::Gold).description(
                            "You have been verified successfully. Welcome to Gryphon FSAE!",
                        ),
                    ),
                )
                .await?;
            Ok(())
        }
        .scope_boxed()
    })
    .await?;

    Ok(())
}

/// Handles the incoming
pub async fn handle_verification_message(
    ctx: &serenity::Context,
    msg: &serenity::Message,
) -> Result<()> {
    if msg.author.bot || msg.guild_id.is_some() {
        return Ok(());
    }
    let guild_id: serenity::GuildId = serenity::GuildId::new(
        var("GUILD_ID")
            .expect("Expected env var `GUILD_ID`, got NULL.")
            .parse()?,
    );
    // check if in guild
    if !is_user_in_guild(ctx, guild_id, msg.author.id).await? {
        return Ok(());
    }
    let mut db = establish_db_connection().await?;
    let already_verifying: bool = {
        use crate::schema::verification_sessions::dsl::*;
        verification_sessions
            .filter(discord_id.eq(msg.author.id.get()))
            .first::<VerificationSession>(&mut db)
            .await
            .ok()
            .map(|v| valid_verification_session(&v))
            .unwrap_or(false)
    };
    if !already_verifying {
        new_verification(ctx, msg, guild_id).await?;
    } else if msg.content == *"quit" {
        // drop existing verification
        {
            use crate::schema::verification_sessions::dsl::*;
            diesel::delete(verification_sessions.filter(discord_id.eq(msg.author.id.get())))
                .execute(&mut db)
                .await?;
        }
        msg.channel_id
            .send_message(
                ctx.http(),
                serenity::CreateMessage::new().embed(
                    default_embed(GuelphColors::Blue).description("Stopped verification session."),
                ),
            )
            .await?;
    } else {
        handle_verification_code(ctx, msg).await?;
    }
    Ok(())
}
