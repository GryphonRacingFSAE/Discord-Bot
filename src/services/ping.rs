use std::time::Instant;

use poise::{Context, CreateReply};

use crate::Data;

/// Pings the bot
#[poise::command(slash_command)]
pub async fn ping(ctx: Context<'_, Data, anyhow::Error>) -> Result<(), anyhow::Error> {
    let start = Instant::now();
    let msg = ctx.reply("Pinging...").await?;
    let end = Instant::now();
    let dt = end.duration_since(start).as_millis();
    msg.edit(
        ctx,
        CreateReply {
            content: Some(format!("Pong! In {dt} ms...")),
            embeds: vec![],
            attachments: vec![],
            ephemeral: None,
            components: None,
            allowed_mentions: None,
            reply: false,
            __non_exhaustive: (),
        },
    )
       .await?;
    Ok(())
}
