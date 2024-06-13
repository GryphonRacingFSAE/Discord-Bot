use thiserror::Error;

#[derive(Debug, Error)]
pub enum BotError {
    #[error("Database is not reachable")]
    NoDB,
    #[error("Invalid date-time given")]
    InvalidDateTime,
    #[error("Poison error")]
    PoisonError,
    #[error("Incorrect flag type")]
    WrongFlagType,
}
