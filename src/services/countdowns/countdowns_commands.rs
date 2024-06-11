use anyhow::Result;
use chrono::{NaiveDate, TimeZone, Utc};
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
use poise::{Context, CreateReply};

use crate::db::establish_db_connection;
use crate::discord::user_has_roles_or;
use crate::embeds::{default_embed, GuelphColors};
use crate::services::countdowns::countdown_db::{
    create_countdown, query_channel_or_default, update_channel_message, Countdown, CountdownWithId,
};
use crate::Data;

#[poise::command(
    slash_command,
    subcommands("add", "update", "delete"),
    subcommand_required
)]
pub async fn countdown(_: Context<'_, Data, anyhow::Error>) -> Result<(), anyhow::Error> {
    Ok(())
}

/// Adds a countdown
#[poise::command(slash_command)]
pub async fn add(
    ctx: Context<'_, Data, anyhow::Error>,
    #[description = "Title of the countdown"] title: String,
    #[description = "Date the countdown ends at (YYYY/MM/DD)"] date: String,
    #[description = "Url of the countdown"] url: Option<String>,
) -> Result<()> {
    if user_has_roles_or(
        ctx.serenity_context(),
        &ctx.author().id,
        &["Bot Developer", "Leads"],
    )
    .await
    {
        return Ok(());
    }
    let date = NaiveDate::parse_from_str(&date, "%Y/%m/%d");
    let date: NaiveDate =
        match date {
            Ok(date_time) => date_time,
            Err(e) => {
                println!("Failed to submit timestamp: {:?}", e);
                ctx.send(CreateReply::default().ephemeral(true).embed(
                    default_embed(GuelphColors::Red).description("Invalid timestamp given."),
                ))
                .await?;
                return Ok(());
            }
        };
    let date_time = date.and_hms_opt(0, 0, 0).unwrap();
    let dt = ctx
        .data()
        .time_zone
        .from_local_datetime(&date_time)
        .unwrap();
    let dt = dt.with_timezone(&Utc);
    let date_time = dt.naive_utc();

    query_channel_or_default(ctx.channel_id().get())?;
    create_countdown(Countdown {
        title,
        url: url.unwrap_or("https://www.youtube.com/watch?v=dQw4w9WgXcQ".to_string()),
        channel_id: ctx.channel_id().get(),
        date_time,
    })
    .await?;
    update_channel_message(
        ctx.serenity_context(),
        ctx.channel_id(),
        &ctx.data().time_zone,
    )
    .await?;
    ctx.send(
        CreateReply::default()
            .ephemeral(true)
            .embed(default_embed(GuelphColors::Blue).description("Created new countdown.")),
    )
    .await?;
    Ok(())
}

/// Updates the current countdown in channel
#[poise::command(slash_command)]
pub async fn update(ctx: Context<'_, Data, anyhow::Error>) -> Result<()> {
    if user_has_roles_or(
        ctx.serenity_context(),
        &ctx.author().id,
        &["Bot Developer", "Leads"],
    )
    .await
    {
        return Ok(());
    }
    update_channel_message(
        ctx.serenity_context(),
        ctx.channel_id(),
        &ctx.data().time_zone,
    )
    .await?;
    ctx.send(
        CreateReply::default()
            .ephemeral(true)
            .embed(default_embed(GuelphColors::Blue).description("Updated countdown.")),
    )
    .await?;
    Ok(())
}

#[poise::command(slash_command)]
pub async fn delete(
    ctx: Context<'_, Data, anyhow::Error>,
    #[description = "Position of the image in the countdown message"] countdown_index: u64,
) -> Result<()> {
    if user_has_roles_or(
        ctx.serenity_context(),
        &ctx.author().id,
        &["Bot Developer", "Leads"],
    )
    .await
    {
        return Ok(());
    }
    let mut db = establish_db_connection()?;
    use crate::schema::countdowns::dsl::*;
    let cds = countdowns
        .filter(channel_id.eq(ctx.channel_id().get()))
        .order_by(date_time)
        .load::<CountdownWithId>(&mut db)?;
    if cds.len() > countdown_index as usize {
        if let Some(cd) = cds.get(countdown_index as usize) {
            diesel::delete(countdowns.filter(id.eq(cd.id))).execute(&mut db)?;
            ctx.send(CreateReply::default().ephemeral(true).embed(
                default_embed(GuelphColors::Blue).description("Deleted countdown successfully."),
            ))
            .await?;
            update_channel_message(
                ctx.serenity_context(),
                ctx.channel_id(),
                &ctx.data().time_zone,
            )
            .await?;
            return Ok(());
        }
    }
    if cds.is_empty() {
        ctx.send(
            CreateReply::default()
                .ephemeral(true)
                .embed(default_embed(GuelphColors::Red).description("No countdown found.")),
        )
        .await?;
    } else {
        ctx.send(CreateReply::default().ephemeral(true).embed(
            default_embed(GuelphColors::Red).description(format!(
                "Invalid index provided. Expected in [0, {}], got: {}",
                cds.len() - 1,
                countdown_index
            )),
        ))
        .await?;
    }
    Ok(())
}
