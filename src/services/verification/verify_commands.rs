use poise::serenity_prelude::CreateMessage;
use poise::{Context, CreateReply};

use crate::embeds::{default_embed, GuelphColors};
use crate::Data;

/// These commands are public facing that anyone can use without any issue
#[poise::command(slash_command, subcommands("help"), subcommand_required)]
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
