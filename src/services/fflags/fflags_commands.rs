use anyhow::Result;
use diesel::{ExpressionMethods, QueryDsl, RunQueryDsl};
use futures::StreamExt;
use poise::{Context, CreateReply};
use poise::futures_util::Stream;

use crate::Data;
use crate::db::establish_db_connection;
use crate::discord::user_has_roles_or;
use crate::embeds::{default_embed, GuelphColors};
use crate::services::fflags::feature_flags::{FeatureFlag, FeatureFlagBoolean};

#[poise::command(
    slash_command,
    subcommands("set_boolean", "get_boolean"),
    subcommand_required
)]
pub async fn fflag(_: Context<'_, Data, anyhow::Error>) -> Result<(), anyhow::Error> {
    Ok(())
}

async fn autocomplete_binary_flag_names<'a>(
    _ctx: Context<'_, Data, anyhow::Error>,
    partial: &'a str,
) -> impl Stream<Item=String> + 'a {
    let mut db = establish_db_connection().unwrap();
    let names = {
        use crate::schema::feature_flags::dsl::*;
        feature_flags
            .filter(flag_type.eq("BOOLEAN"))
            .select(name)
            .load::<String>(&mut db)
            .unwrap()
    };
    futures::stream::iter(names.into_iter())
        .filter(move |name| futures::future::ready(name.starts_with(partial)))
        .map(|name| name.to_string())
}

/// Sets the given fflag
#[poise::command(slash_command)]
pub async fn set_boolean(
    ctx: Context<'_, Data, anyhow::Error>,
    #[description = "Feature flag name"]
    #[autocomplete = "autocomplete_binary_flag_names"]
    fflag_name: String,
    #[description = "Feature flag value"] value: Option<bool>,
) -> Result<()> {
    if !user_has_roles_or(
        ctx.serenity_context(),
        &ctx.author().id,
        &["Bot Developer", "Leads"],
    )
        .await
    {
        return Ok(());
    }
    let mut db = establish_db_connection()?;
    match FeatureFlagBoolean::fetch_or_default(&mut db, &fflag_name, value) {
        Ok(mut flag) => {
            match flag.set_value(&mut db, value) {
                Ok(_) => {
                    ctx.send(
                        CreateReply::default()
                            .embed(
                                default_embed(GuelphColors::Blue)
                                    .description("Changed feature flag value"),
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
            };
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
    Ok(())
}

/// Gets the current fflag
#[poise::command(slash_command)]
pub async fn get_boolean(
    ctx: Context<'_, Data, anyhow::Error>,
    #[description = "Feature flag name"]
    #[autocomplete = "autocomplete_binary_flag_names"]
    fflag_name: String,
) -> Result<()> {
    if !user_has_roles_or(
        ctx.serenity_context(),
        &ctx.author().id,
        &["Bot Developer", "Leads"],
    )
        .await
    {
        return Ok(());
    }
    let mut db = establish_db_connection()?;
    match FeatureFlagBoolean::fetch(&mut db, &fflag_name) {
        Ok(flag) => {
            if let Some(flag) = flag {
                ctx.send(
                    CreateReply::default()
                        .embed(default_embed(GuelphColors::Blue).description(format!(
                            "Feature flag `{} = {:?}`",
                            fflag_name,
                            flag.value()
                        )))
                        .ephemeral(true),
                )
                   .await?;
            } else {
                ctx.send(
                    CreateReply::default()
                        .embed(default_embed(GuelphColors::Red).description(format!(
                            "Expected feature flag `{}`, got `None`",
                            fflag_name
                        )))
                        .ephemeral(true),
                )
                   .await?;
            }
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
    Ok(())
}
