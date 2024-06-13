use chrono::{Datelike, NaiveDateTime};

/// Deals with anything regarding countdown dates

pub fn format_naive_datetime(date: NaiveDateTime) -> String {
    let day_suffix = match date.day() {
        1 | 21 | 31 => "st",
        2 | 22 => "nd",
        3 | 23 => "rd",
        _ => "th",
    };

    format!(
        "{} {}{}, {}",
        date.format("%B"),
        date.day(),
        day_suffix,
        date.year()
    )
}
