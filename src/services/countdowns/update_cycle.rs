use std::time;

/// Deals with updating the countdown messages every 5 minutes
use anyhow::Result;
use chrono_tz::Tz;
use diesel::query_dsl::methods::FilterDsl;
use diesel::ExpressionMethods;
use diesel_async::{AsyncMysqlConnection, RunQueryDsl};
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::ChannelId;

use crate::db::establish_db_connection;
use crate::services::countdowns::countdown_db::{update_channel_message, Channel};

/// Update all countdown messages
pub async fn update_countdown_messages(ctx: &serenity::Context, time_zone: &Tz) -> Result<()> {
    let mut db: AsyncMysqlConnection = establish_db_connection().await?;
    let valid_channels = {
        use crate::schema::channels::dsl::*;
        channels
            .filter(message_id.ne(0))
            .load::<Channel>(&mut db)
            .await?
    };
    for channel in valid_channels {
        update_channel_message(ctx, &mut db, ChannelId::new(channel.id), time_zone).await?;
    }
    Ok(())
}

/// Update all countdown messages every minute
pub async fn update_countdown_messages_periodically(ctx: serenity::Context, time_zone: Tz) {
    loop {
        if let Err(e) = update_countdown_messages(&ctx, &time_zone).await {
            println!("Failed to update countdown messages: {e}");
        }
        tokio::time::sleep(time::Duration::from_secs(60)).await;
    }
}
