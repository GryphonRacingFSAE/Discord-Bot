// @generated automatically by Diesel CLI.

diesel::table! {
    channels (id) {
        id -> Unsigned<Bigint>,
        message_id -> Unsigned<Bigint>,
    }
}

diesel::table! {
    countdowns (id) {
        id -> Unsigned<Bigint>,
        title -> Text,
        url -> Text,
        channel_id -> Unsigned<Bigint>,
        date_time -> Datetime,
    }
}

diesel::table! {
    feature_flags (name) {
        #[max_length = 128]
        name -> Varchar,
        value -> Nullable<Text>,
        flag_type -> Text,
    }
}

diesel::table! {
    verification_sessions (email) {
        #[max_length = 64]
        email -> Varchar,
        discord_id -> Unsigned<Bigint>,
        code -> Unsigned<Bigint>,
        timestamp -> Unsigned<Bigint>,
    }
}

diesel::table! {
    verifications (email) {
        #[max_length = 64]
        email -> Varchar,
        name -> Nullable<Text>,
        in_gryphlife -> Nullable<Bool>,
        has_paid -> Nullable<Bool>,
        discord_id -> Nullable<Unsigned<Bigint>>,
    }
}

diesel::joinable!(countdowns -> channels (channel_id));
diesel::joinable!(verification_sessions -> verifications (email));

diesel::allow_tables_to_appear_in_same_query!(
    channels,
    countdowns,
    feature_flags,
    verification_sessions,
    verifications,
);
