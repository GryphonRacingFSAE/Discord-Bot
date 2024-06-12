use anyhow::Result;
use chrono::{NaiveDateTime, TimeDelta, TimeZone, Utc};
use chrono_tz::Tz;
use diesel::prelude::*;
use diesel_async::{AsyncMysqlConnection, RunQueryDsl};
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::{
    CacheHttp, ChannelId, CreateEmbed, CreateMessage, EditMessage, GetMessages, MessageId,
    Timestamp,
};

use crate::embeds::{default_embed, GuelphColors};
use crate::services::countdowns::countdown_date::format_naive_datetime;

#[derive(Queryable, Selectable, Insertable, AsChangeset)]
#[diesel(belongs_to(Channel, foreign_key = channel_id))]
#[diesel(table_name = crate::schema::countdowns)]
pub struct Countdown {
    pub title: String,
    pub url: String,
    pub channel_id: u64,
    pub date_time: NaiveDateTime,
}

#[derive(Queryable, Selectable, Insertable, AsChangeset)]
#[diesel(belongs_to(Channel, foreign_key = channel_id))]
#[diesel(table_name = crate::schema::countdowns)]
pub struct CountdownWithId {
    pub id: u64,
    pub title: String,
    pub url: String,
    pub channel_id: u64,
    pub date_time: NaiveDateTime,
}

/// Represents a discord channel and holds a snowflake the countdown message
#[derive(Queryable, Selectable, Insertable, AsChangeset)]
#[diesel(table_name = crate::schema::channels)]
pub struct Channel {
    pub id: u64,
    pub message_id: u64,
}

/// Queries for a channel and if it doesn't exist, creates a default one with a blank `message_id`
pub async fn query_channel_or_default(
    db: &mut AsyncMysqlConnection,
    channel_id: u64,
) -> Result<Channel> {
    use crate::schema::channels::dsl::*;

    match channels
        .filter(id.eq(channel_id))
        .first::<Channel>(db)
        .await
    {
        Ok(channel) => Ok(channel),
        Err(diesel::result::Error::NotFound) => {
            let new_channel = Channel {
                id: channel_id,
                message_id: 0,
            };
            diesel::insert_into(channels)
                .values(&new_channel)
                .execute(db)
                .await?;
            Ok(channels
                .filter(id.eq(channel_id))
                .first::<Channel>(db)
                .await
                .unwrap())
        }
        Err(e) => Err(anyhow::Error::from(e)),
    }
}

/// Creates or updates any existing channel
pub async fn update_channel(db: &mut AsyncMysqlConnection, channel: &Channel) -> Result<()> {
    use crate::schema::channels::dsl::*;
    diesel::update(channels.filter(id.eq(channel.id)))
        .set(channel)
        .execute(db)
        .await?;
    Ok(())
}

/// Generates the embed for the countdown message
pub async fn generate_countdown_message_embed(
    db: &mut AsyncMysqlConnection,
    channel: &Channel,
    time_zone: &Tz,
) -> Result<CreateEmbed> {
    use crate::schema::countdowns::dsl::*;
    let cds = countdowns
        .filter(channel_id.eq(channel.id))
        .load::<CountdownWithId>(db)
        .await?;
    let tz_now = Utc::now().with_timezone(time_zone);
    let mut countdowns_with_time_diff: Vec<(CountdownWithId, TimeDelta)> = cds
        .into_iter()
        .map(|cd| {
            let cd_tz = Utc
                .from_utc_datetime(&cd.date_time)
                .with_timezone(time_zone);
            let duration = cd_tz.signed_duration_since(tz_now);
            (cd, duration)
        })
        .collect();
    let mut embed = default_embed(GuelphColors::Gold).timestamp(Timestamp::now());
    countdowns_with_time_diff
        .sort_by(|(_, diff), (_, other_diff)| diff.num_seconds().cmp(&other_diff.num_seconds()));
    for (countdown, diff) in countdowns_with_time_diff.into_iter() {
        let dt_tz = Utc
            .from_utc_datetime(&countdown.date_time)
            .with_timezone(time_zone);
        let time_remaining = {
            if diff.num_seconds() <= 0 {
                String::from(":race_car::dash: :green_circle: **GO** :green_circle:")
            } else if (diff.num_weeks() as f64 / 4.0) >= 4.0 {
                format!("{} months left...", (diff.num_weeks() as f64 / 4.0).round())
            } else if diff.num_weeks() >= 2 {
                format!(
                    "{} weeks left...",
                    (diff.num_hours() as f64 * 10.0 / (7.0 * 24.0)).round() / 10.0
                )
            } else if diff.num_days() >= 3 {
                format!(
                    "{} days left...",
                    (diff.num_minutes() as f64 * 10.0 / (24.0 * 60.0)).round() / 10.0
                )
            } else {
                format!(
                    "{} hours left...",
                    (diff.num_seconds() as f64 * 100.0 / (60.0 * 60.0)).round() / 100.0
                )
            }
        };

        embed = embed.field(
            countdown.title.to_string(),
            format!(
                "[{}](<{}>)\nTime remaining: {}",
                format_naive_datetime(dt_tz.naive_local()),
                countdown.url,
                time_remaining
            ),
            false,
        );
    }

    Ok(embed)
}

/// Always create a new message no matter what
///
/// **Assumes that the channel already exists**
///
/// TODO: in theory, we could make deletion + message creation async but who tf cares??
pub async fn new_channel_message(
    ctx: &serenity::Context,
    db: &mut AsyncMysqlConnection,
    channel: &Channel,
    time_zone: &Tz,
) -> Result<()> {
    let embed = generate_countdown_message_embed(db, channel, time_zone).await?;
    if channel.message_id != 0 {
        let message = ctx
            .http()
            .get_message(
                ChannelId::new(channel.id),
                MessageId::new(channel.message_id),
            )
            .await;
        if let Ok(message) = message {
            // SAFETY: does not matter if we were able to delete the previous message or not
            unsafe {
                message.delete(ctx.http()).await.unwrap_unchecked();
            }
        }
    }
    let discord_channel = ChannelId::new(channel.id);
    let message = discord_channel
        .send_message(ctx.http(), CreateMessage::new().embed(embed))
        .await?;
    let channel = Channel {
        id: channel.id,
        message_id: message.id.get(),
    };
    update_channel(db, &channel).await?;
    Ok(())
}

/// Updates a channel's countdown message.
///
/// Updates if:
/// - No message was found
/// - Message is older than 7 days
/// - 100 messages have been sent since
/// Deletes if:
/// - There are no countdowns left
pub async fn update_channel_message(
    ctx: &serenity::Context,
    db: &mut AsyncMysqlConnection,
    c_id: ChannelId,
    time_zone: &Tz,
) -> Result<()> {
    use crate::schema::countdowns::dsl::*;
    let channel = query_channel_or_default(db, c_id.get()).await?;
    let mut new_countdown_message: bool = true;
    let countdown_empty: bool = countdowns
        .filter(channel_id.eq(c_id.get()))
        .execute(db)
        .await?
        == 0;
    // Delete pre-existing messages
    if channel.message_id != 0 {
        // No countdowns exist on current channel, delete message
        if countdown_empty {
            let message = ctx
                .http()
                .get_message(
                    ChannelId::new(channel.id),
                    MessageId::new(channel.message_id),
                )
                .await;
            if let Ok(message) = message {
                message.delete(ctx.http()).await?;
            }
            let new_channel = Channel {
                id: c_id.get(),
                message_id: 0,
            };
            update_channel(db, &new_channel).await?;
            return Ok(());
        }
        let message = ctx
            .http()
            .get_message(
                ChannelId::new(channel.id),
                MessageId::new(channel.message_id),
            )
            .await;
        if let Ok(message) = message {
            let diff = Utc::now().timestamp() - message.timestamp.unix_timestamp();
            if diff < 60 * 60 * 24 * 7 {
                new_countdown_message = false;
            }
            if new_countdown_message {
                let messages = c_id
                    .messages(ctx.http(), GetMessages::new().after(channel.message_id))
                    .await
                    .map_or(u32::MAX, |messages| messages.len() as u32);
                new_countdown_message = messages >= 48; // update every 48 messages sent
            }
        };
    }
    if countdown_empty {
        return Ok(());
    }

    if new_countdown_message {
        new_channel_message(ctx, db, &channel, time_zone).await?;
    } else {
        // simply edit the existing message
        let mut message = ctx
            .http()
            .get_message(
                ChannelId::new(channel.id),
                MessageId::new(channel.message_id),
            )
            .await?;
        message
            .edit(
                ctx.http(),
                EditMessage::new()
                    .embed(generate_countdown_message_embed(db, &channel, time_zone).await?),
            )
            .await?;
    }
    Ok(())
}

/// Creates a countdown
pub async fn create_countdown(
    db: &mut AsyncMysqlConnection,
    countdown_info: Countdown,
) -> Result<()> {
    use crate::schema::countdowns;
    diesel::insert_into(countdowns::table)
        .values(&countdown_info)
        .execute(db)
        .await?;
    Ok(())
}
