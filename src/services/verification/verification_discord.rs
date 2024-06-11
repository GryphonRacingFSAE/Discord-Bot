use poise::serenity_prelude::CreateEmbed;

use crate::embeds::{default_embed, GuelphColors};
use crate::services::verification::GRYPHLIFE_LINK;
use crate::services::verification::verification_db::Verification;

/// Generates a basic embed error for verification
pub fn generate_embed_error() -> CreateEmbed {
    default_embed(GuelphColors::Red).description("If any of the below issues have not been resolved within 48 hours, please contact a `@Bot Developer`.")
}

/// Adds fields to any optionally pre-existing embed
///
/// If not embed is given, it will by default generate a new one using [`generate_embed_error`]
pub fn add_verification_error_fields(
    embed: Option<CreateEmbed>,
    verification_entry: &Verification,
) -> Option<CreateEmbed> {
    let mut embed: CreateEmbed = embed.unwrap_or(generate_embed_error());
    let mut has_error = false;
    if !verification_entry.in_gryphlife.unwrap_or(false) {
        embed = embed.field("Not paid", "You have not paid the club fee.", true);
        has_error = true;
    }
    if !verification_entry.in_gryphlife.unwrap_or(false) {
        embed = embed.field("Not in GryphLife", format!("You are not in the [GryphLife](<{}>).", GRYPHLIFE_LINK), true);
        has_error = true;
    }
    if verification_entry.name.as_deref().unwrap_or("").is_empty() {
        embed = embed.field(
            "No name",
            "Your name for whatever reason has not been registered yet.",
            true,
        );
        has_error = true;
    }
    if has_error {
        Some(embed)
    } else {
        None
    }
}
