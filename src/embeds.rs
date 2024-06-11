use poise::serenity_prelude::{Colour, CreateEmbed, CreateEmbedFooter};

/// Deals with standardization of embeds to keep them consistent throughout the bot

/// https://guides.uoguelph.ca/guides/brand-guide/colour-palette/
pub enum GuelphColors {
    Red,
    Black,
    Gold,
    Blue,
}

impl GuelphColors {
    /// Convert to rgb colors
    pub fn to_colour(&self) -> Colour {
        match self {
            GuelphColors::Red => Colour::from_rgb(194, 4, 48),
            GuelphColors::Black => Colour::from_rgb(0, 0, 0),
            GuelphColors::Gold => Colour::from_rgb(255, 199, 42),
            GuelphColors::Blue => Colour::from_rgb(105, 163, 185),
        }
    }
}

/// Generate a default embed
pub fn default_embed(color: GuelphColors) -> CreateEmbed {
    CreateEmbed::new()
        .footer(CreateEmbedFooter::new(
            "The UoFG FSAE bot will never ask for your personal information.",
        ))
        .colour(color.to_colour())
}
