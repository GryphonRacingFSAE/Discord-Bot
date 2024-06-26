use std::collections::HashMap;
use std::path::Path;
use std::str::FromStr;

use anyhow::Result;
use calamine::{DataType, Reader};
use chrono::Utc;
use diesel::prelude::*;
use diesel_async::scoped_futures::ScopedFutureExt;
use diesel_async::{AsyncConnection, AsyncMysqlConnection, RunQueryDsl};
use poise::serenity_prelude as serenity;
use poise::serenity_prelude::{CacheHttp, CreateEmbed, CreateMessage, GuildId, RoleId, UserId};
use serde::Deserialize;

use crate::db::establish_db_connection;
use crate::discord::get_role_id_from_name;
use crate::embeds::{default_embed, GuelphColors};
use crate::services::fflags::feature_flags::{FeatureFlag, FeatureFlagBoolean};
use crate::services::verification::verification_discord::{
    add_verification_error_fields, generate_embed_error,
};
use crate::services::verification::SESSION_EXPIRATION_SECONDS;

/// Automatically handle reading/writing of database contents

pub const WORKSHEET_PATH: &str = "./resources/verification.xlsx";

#[derive(Debug, Queryable, Selectable, Insertable, AsChangeset, Deserialize)]
#[diesel(table_name = crate::schema::verifications)]
pub struct Verification {
    pub email: String,
    pub name: Option<String>,
    pub in_gryphlife: Option<bool>,
    pub has_paid: Option<bool>,
    pub discord_id: Option<u64>,
}

impl Verification {
    /// Checks if a verification is valid.
    ///
    /// Valid defined as:
    /// - name.is_some()
    /// - in_gryphlife = Some(true)
    /// - has_paid = Some(true)
    /// - discord_id is not none and > 0
    pub async fn is_verified(&self) -> bool {
        let mut db = establish_db_connection().await.unwrap();
        let paid_required =
            FeatureFlagBoolean::fetch(&mut db, "verification_verified_requires_paid")
                .await
                .ok()
                .map(|v| v.map(|v| v.value().unwrap_or(true)).unwrap_or(true))
                .unwrap_or(true);
        self.name.is_some()
            && self.in_gryphlife.unwrap_or(false)
            && self.has_paid.unwrap_or(false)
            && (self.discord_id.map(|id| id != 0).unwrap_or(false) || !paid_required)
    }

    /// Will check if the user is in the server still
    pub async fn is_in_server(&self, ctx: &serenity::Context, guild_id: GuildId) -> bool {
        if let Some(discord_id) = self.discord_id {
            return guild_id.member(ctx.http(), discord_id).await.is_ok();
        }
        false
    }
}

#[derive(Debug, Queryable, Selectable, Insertable, AsChangeset, Deserialize)]
#[diesel(belongs_to(Verification, foreign_key = email))]
#[diesel(table_name = crate::schema::verification_sessions)]
#[diesel(check_for_backend(diesel::mysql::Mysql))]
pub struct VerificationSession {
    pub email: String,
    pub discord_id: u64,
    pub code: u64,
    timestamp: u64,
}

impl VerificationSession {
    /// Get the timestamp when the verification session start
    pub fn get_timestamp(&self) -> u64 {
        self.timestamp
    }

    /// Checks if verification session is expired
    pub fn is_expired(&self) -> bool {
        Utc::now().timestamp() as u64 - self.timestamp > SESSION_EXPIRATION_SECONDS
    }

    /// Creates a new verification session and automatically timestamps it to Utc::now()
    pub fn new(email: String, discord_id: u64, code: u64) -> Self {
        Self {
            email,
            discord_id,
            code,
            timestamp: Utc::now().timestamp() as u64,
        }
    }
}

/// Reads the xlsx file contents and spits out as a vec of [`Verification`]
pub fn read_xlsx_file_contents() -> Result<Vec<Verification>> {
    let mut workbook = calamine::open_workbook_auto(Path::new(WORKSHEET_PATH))?;
    let range = workbook.worksheet_range("Sheet1")?;
    let verifications_vec: Vec<Verification> = range
        .rows()
        .skip(1)
        .filter_map(|row| {
            // only consider rows with an actual email
            let email: String = row.first().and_then(|c| c.get_string())?.to_string();
            let name: Option<String> = row
                .get(1)
                .and_then(|c| c.get_string())
                .map(|s| s.to_string());
            let in_gryphlife: Option<bool> = row.get(3).and_then(|c| c.get_bool());
            let has_paid: Option<bool> = row.get(2).and_then(|c| c.get_bool());
            Some(Verification {
                email,
                name,
                in_gryphlife,
                has_paid,
                discord_id: None,
            })
        })
        .collect();
    Ok(verifications_vec)
}

/// Merge the vector of verifications into the db aka do a massive update and purge all fields
/// not found in the spreadsheet
pub async fn merge_verifications(records: &[Verification]) -> Result<()> {
    let mut db = establish_db_connection().await?;
    // Start a transaction
    db.transaction::<_, anyhow::Error, _>(|db| async move {
        for record in records {
            diesel::sql_query(
                "INSERT INTO verifications (email, name, in_gryphlife, has_paid) VALUES (?, ?, ?, ?)
                 ON DUPLICATE KEY UPDATE
                 name = VALUES(name), in_gryphlife = VALUES(in_gryphlife), has_paid = VALUES(has_paid)",
            )
                .bind::<diesel::sql_types::VarChar, _>(&record.email)
                .bind::<diesel::sql_types::Nullable<diesel::sql_types::Text>, _>(&record.name)
                .bind::<diesel::sql_types::Nullable<diesel::sql_types::Bool>, _>(&record.in_gryphlife)
                .bind::<diesel::sql_types::Nullable<diesel::sql_types::Bool>, _>(&record.has_paid)
                .execute(db).await?;
        }

        let emails: Vec<String> = records.iter().map(|r| r.email.clone()).collect();
        if !emails.is_empty() {
            diesel::sql_query(
                format!(
                    "DELETE FROM verifications WHERE email NOT IN ({})",
                    emails.iter().map(|s| format!("'{}'", s)).collect::<Vec<_>>().join(",")
                )
            ).execute(db).await?;
        }

        Ok(())
    }.scope_boxed()).await?;

    Ok(())
}

async fn read_and_merge_verifications() -> Result<()> {
    let records = read_xlsx_file_contents()?;
    merge_verifications(&records).await?;
    Ok(())
}

pub async fn merge_verifications_periodically(time_zone: chrono_tz::Tz) {
    // Runs every minute
    let cron_expression = "0 */5 * * * *";
    let schedule = cron::Schedule::from_str(cron_expression).unwrap();
    loop {
        match read_and_merge_verifications().await {
            Ok(_) => {}
            Err(e) => println!("Unable to read and merge verification.xlsx due to: {e}"),
        }
        let next = schedule.upcoming(time_zone).next().unwrap();
        tokio::time::sleep(
            next.signed_duration_since(chrono::Local::now().with_timezone(&time_zone))
                .to_std()
                .unwrap(),
        )
        .await;
    }
}

/// Updates verification per members using a hashmap as a truth table
pub async fn update_verification_roles_from_hashmap(
    ctx: &serenity::Context,
    db: &mut AsyncMysqlConnection,
    verified_role: &RoleId,
    members: &[serenity::Member],
    verified_members: HashMap<UserId, Verification>,
) -> Result<()> {
    let allow_removals: bool =
        FeatureFlagBoolean::fetch_or_default(db, "verification_role_removal", Some(false))
            .await?
            .value()
            .unwrap_or(false);
    let allow_additions: bool =
        FeatureFlagBoolean::fetch_or_default(db, "verification_role_addition", Some(true))
            .await?
            .value()
            .unwrap_or(false);
    for member in members {
        if member.user.bot {
            continue;
        }
        let has_verified_role: bool = member.roles.contains(verified_role);
        let verified: bool = if let Some(verification) = verified_members.get(&member.user.id) {
            verification.is_verified().await
        } else {
            false
        };
        if !verified && has_verified_role {
            let mut embed = generate_embed_error();
            if allow_removals {
                member
                    .remove_role(ctx.http(), verified_role)
                    .await
                    .map_err(|e| println!("Failed to message {}: {e}", member.user.id))
                    .ok();
                embed = embed.field(
                    "Role removed",
                    "Your verification role is now removed.",
                    false,
                );
            } else {
                println!("Will un-verify {} - {}, but cannot due to disabled flag `verification_role_removal`.", member.user.id, member.user.name);
                continue;
            }
            match verified_members.get(&member.user.id) {
                None => {
                    member
                        .user
                        .direct_message(
                            ctx.http(),
                            CreateMessage::new().embed(embed.field(
                                "Not in system",
                                "You are not registered in our verification system.",
                                false,
                            )),
                        )
                        .await
                        .map_err(|e| println!("Failed to message {}: {e}", member.user.id))
                        .ok();
                }
                Some(verification) => {
                    let verification_embed: Option<CreateEmbed> =
                        add_verification_error_fields(Some(embed.clone()), verification);
                    if let Some(verification_embed) = verification_embed {
                        embed = verification_embed;
                    }
                    member
                        .user
                        .direct_message(ctx.http(), CreateMessage::new().embed(embed))
                        .await
                        .map_err(|e| println!("Failed to message {}: {e}", member.user.id))
                        .ok();
                }
            }
        } else if verified && !has_verified_role {
            let mut embed = default_embed(GuelphColors::Blue);
            if allow_additions {
                member
                    .add_role(ctx.http(), verified_role)
                    .await
                    .map_err(|e| println!("Failed to message {}: {e}", member.user.id))
                    .ok();
                embed = embed.field(
                    "Role added",
                    "Your verification role is now added. Welcome to the server.",
                    false,
                );
            } else {
                println!("Will verify {} - {}, but cannot due to disabled flag `verification_role_addition`.", member.user.id, member.user.name);
                continue;
            }
            member
                .user
                .direct_message(ctx.http(), CreateMessage::new().embed(embed))
                .await?;
        }
    }
    Ok(())
}

/// Updates verification roles based off of the database
pub async fn update_verification_roles(
    ctx: &serenity::Context,
    db: &mut AsyncMysqlConnection,
    guild_id: &GuildId,
    verified_role: &RoleId,
) -> Result<()> {
    let verified_members: HashMap<UserId, Verification> = {
        use crate::schema::verifications::dsl::*;
        let verifications_vec: Vec<Verification> = verifications
            .filter(discord_id.is_not_null())
            .load::<Verification>(db)
            .await?;
        verifications_vec
            .into_iter()
            .map(|v| (UserId::new(v.discord_id.unwrap()), v))
            .collect()
    };
    update_verification_roles_from_hashmap(
        ctx,
        db,
        verified_role,
        &guild_id.members(ctx.http(), None, None).await?,
        verified_members,
    )
    .await
}

pub async fn update_verification_roles_from_members(
    ctx: &serenity::Context,
    db: &mut AsyncMysqlConnection,
    verified_role: &RoleId,
    members: &[serenity::Member],
) -> Result<()> {
    let verified_members: HashMap<UserId, Verification> = {
        use crate::schema::verifications::dsl::*;
        let verifications_vec: Vec<Verification> = verifications
            .filter(
                discord_id.eq_any(
                    members
                        .iter()
                        .map(|m| m.user.id.get())
                        .collect::<Vec<u64>>(),
                ),
            )
            .load::<Verification>(db)
            .await?;
        verifications_vec
            .into_iter()
            .map(|v| (UserId::new(v.discord_id.unwrap()), v))
            .collect()
    };
    update_verification_roles_from_hashmap(ctx, db, verified_role, members, verified_members).await
}

pub async fn update_verification_roles_periodically(
    ctx: serenity::Context,
    time_zone: chrono_tz::Tz,
    guild_id: GuildId,
) {
    // daily at 18:00
    if let Ok(mut db) = establish_db_connection().await {
        let cron_expression = "0 0 18 * * *";
        let schedule = cron::Schedule::from_str(cron_expression).unwrap();
        let verified_role = get_role_id_from_name(&ctx, &guild_id, "Verified")
            .await
            .unwrap();
        loop {
            match update_verification_roles(&ctx, &mut db, &guild_id, &verified_role).await {
                Ok(_) => {}
                Err(e) => println!("Unable to update verification roles due to: {e}"),
            }
            let next = schedule.upcoming(time_zone).next().unwrap();
            tokio::time::sleep(
                next.signed_duration_since(chrono::Local::now().with_timezone(&time_zone))
                    .to_std()
                    .unwrap(),
            )
            .await;
        }
    }
}

/// Checks if a verification entry exists given an email address
pub async fn verification_entry_exists(
    db: &mut AsyncMysqlConnection,
    email_in: &str,
) -> Result<Option<Verification>> {
    use crate::schema::verifications::dsl::*;
    let res: Option<Verification> = verifications
        .filter(email.eq(email_in))
        .first::<Verification>(db)
        .await
        .optional()
        .unwrap_or(None);
    Ok(res)
}

/// If there is a valid verification session
pub fn valid_verification_session(session: &VerificationSession) -> bool {
    !session.is_expired()
}
