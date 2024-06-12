use std::env::var;

use chrono_tz::Tz;
use diesel_migrations::EmbeddedMigrations;
use dotenv::dotenv;
use log::warn;
use poise::serenity_prelude::CacheHttp;
use poise::PrefixFrameworkOptions;
use poise::{serenity_prelude as serenity, Framework, FrameworkContext};

use crate::discord::get_role_id_from_name;
use crate::services::countdowns::update_cycle::update_countdown_messages_periodically;
use crate::services::sections::{update_all_member_roles_periodically, update_member_section_role};
use crate::services::verification::verification_db::{
    merge_verifications_periodically, update_verification_roles_periodically,
};

mod build;
mod db;
mod discord;
mod embeds;
pub mod error;
pub mod schema;
mod services;

#[derive(Debug, Clone)]
pub struct Data {
    time_zone: Tz,
    #[allow(dead_code)]
    guild_id: serenity::GuildId,
    verified_role: Option<serenity::RoleId>,
}

unsafe impl Send for Data {}

unsafe impl Sync for Data {}

async fn on_error(error: poise::FrameworkError<'_, Data, anyhow::Error>) {
    // This is our custom error handler
    // They are many errors that can occur, so we only handle the ones we want to customize
    // and forward the rest to the default handler
    match error {
        poise::FrameworkError::Setup { error, .. } => panic!("Failed to start bot: {:?}", error),
        poise::FrameworkError::Command { error, ctx, .. } => {
            println!("Error in command `{}`: {:?}", ctx.command().name, error,);
        }
        error => {
            if let Err(e) = poise::builtins::on_error(error).await {
                println!("Error while handling error: {}", e)
            }
        }
    }
}

pub const MIGRATIONS: EmbeddedMigrations = diesel_migrations::embed_migrations!("./migrations");

#[tokio::main]
async fn main() {
    dotenv().ok();

    #[allow(deprecated)]
    let options = poise::FrameworkOptions {
        commands: vec![
            services::ping::ping(),
            services::countdowns::countdowns_commands::countdown(),
            services::fflags::fflags_commands::fflag(),
            services::verification::verification_commands::verification(),
            services::verification::verify_commands::verify(),
        ],
        on_error: |error| Box::pin(on_error(error)),
        pre_command: |ctx| {
            Box::pin(async move {
                println!("Executing command {}...", ctx.command().qualified_name);
            })
        },
        post_command: |ctx| {
            Box::pin(async move {
                println!("Executed command {}!", ctx.command().qualified_name);
            })
        },
        command_check: None,
        skip_checks_for_owners: false,
        allowed_mentions: None,
        reply_callback: None,
        manual_cooldowns: false,
        require_cache_for_guild_check: false,
        event_handler: |ctx: &serenity::Context,
                        event: &serenity::FullEvent,
                        framework: FrameworkContext<Data, anyhow::Error>,
                        _data| {
            Box::pin(async move {
                println!(
                    "Got an event in event handler: {:?}",
                    event.snake_case_name()
                );
                let guild_id: serenity::GuildId =
                    serenity::GuildId::new(var("GUILD_ID").unwrap().parse().unwrap());
                // Start up services
                if let serenity::FullEvent::Ready { .. } = event {
                    tokio::spawn(merge_verifications_periodically(
                        framework.user_data().await.time_zone,
                    ));
                    tokio::spawn(update_countdown_messages_periodically(
                        ctx.clone(),
                        framework.user_data().await.time_zone,
                    ));
                    tokio::spawn(update_verification_roles_periodically(
                        ctx.clone(),
                        framework.user_data().await.time_zone,
                        guild_id,
                    ));
                    tokio::spawn(update_all_member_roles_periodically(ctx.clone(), guild_id));
                } else if let serenity::FullEvent::Message { new_message } = event {
                    if let Err(e) =
                        services::verification::verification_event::handle_verification_message(
                            ctx,
                            new_message,
                        )
                        .await
                    {
                        println!(
                            "Error while handling event {}: {}",
                            event.snake_case_name(),
                            e
                        )
                    }
                } else if let serenity::FullEvent::GuildMemberUpdate {
                    old_if_available,
                    new,
                    ..
                } = event
                {
                    if let (Some(old), Some(new)) = (old_if_available, new) {
                        if old.roles != new.roles {
                            if let Err(e) = update_member_section_role(ctx, new).await {
                                println!(
                                    "Failed to update section role for {} due to: {e}",
                                    new.user.name
                                );
                            }
                        }
                    }
                }
                Ok(())
            })
        },
        listener: (),
        prefix_options: PrefixFrameworkOptions {
            prefix: None,
            additional_prefixes: vec![],
            dynamic_prefix: None,
            stripped_dynamic_prefix: None,
            mention_as_prefix: false,
            edit_tracker: None,
            execute_untracked_edits: false,
            ignore_edits_if_not_yet_responded: false,
            execute_self_messages: false,
            ignore_bots: false,
            ignore_thread_creation: false,
            case_insensitive_commands: false,
            __non_exhaustive: (),
        },
        owners: Default::default(),
        initialize_owners: false,
        __non_exhaustive: (),
    };

    let framework = Framework::builder()
        .setup(move |ctx, _ready, framework| {
            Box::pin(async move {
                println!("Logged in as {}", _ready.user.name);
                let global_commands = ctx.http().get_global_commands().await?;
                for command in global_commands {
                    ctx.http().delete_global_command(command.id).await?
                }
                let guild_id: serenity::GuildId = {
                    let guild_id = serenity::GuildId::new(
                        var("GUILD_ID")
                            .expect("Expected env variable `GUILD_ID`, got NULL.")
                            .parse()?,
                    );
                    let guild_commands = ctx.http().get_guild_commands(guild_id).await?;
                    for command in guild_commands {
                        ctx.http()
                            .delete_guild_command(guild_id, command.id)
                            .await?;
                    }
                    guild_id
                };
                let verified_role = get_role_id_from_name(ctx, &guild_id, "Verified").await;
                warn!("No verified role found.");

                poise::builtins::register_globally(ctx, &framework.options().commands).await?;
                println!("Data initialization complete!");
                Ok(Data {
                    time_zone: var("TIME_ZONE")
                        .unwrap_or("America/Toronto".to_string())
                        .parse()
                        .unwrap(),
                    guild_id,
                    verified_role,
                })
            })
        })
        .options(options)
        .build();

    let token = var("DISCORD_TOKEN").expect("Missing `DISCORD_TOKEN` env var");
    var("GUILD_ID").expect("Missing `GUILD_ID` env var");
    let intents = serenity::GatewayIntents::MESSAGE_CONTENT
        | serenity::GatewayIntents::GUILDS
        | serenity::GatewayIntents::DIRECT_MESSAGES
        | serenity::GatewayIntents::GUILD_MEMBERS
        | serenity::GatewayIntents::non_privileged();

    let client = serenity::ClientBuilder::new(token, intents)
        .framework(framework)
        .await;

    client.unwrap().start().await.unwrap()
}
