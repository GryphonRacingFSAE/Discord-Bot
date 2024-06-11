use std::fmt::Debug;

use anyhow::Result;
use diesel::{
    AsChangeset, ExpressionMethods, Insertable, MysqlConnection, OptionalExtension, Queryable,
    QueryDsl, RunQueryDsl, Selectable,
};
use diesel::associations::HasTable;
use serde::Deserialize;

use crate::error::BotError;
use crate::schema::feature_flags::dsl::feature_flags;

/// We gave up testing, so we just roll out feature flags

/// Represents a specific feature flag type we expect. This helps us obtain type-safety
pub trait FeatureFlag: Debug + Clone {
    type RustType: Default + Debug + Clone;

    /// Runs [`Self::fetch`], if none is found, it will create a new feature flag in the db
    fn fetch_or_default(
        db: &mut MysqlConnection,
        name: &str,
        default_value: Option<Self::RustType>,
    ) -> Result<Self>;

    /// Attempts to fetch a pre-existing feature flag
    ///
    /// [`None`] if not feature flag exists
    ///
    /// [`Some(Self)`] if one already exists
    fn fetch(db: &mut MysqlConnection, name: &str) -> Result<Option<Self>>;

    /// Sets the feature flag value to the db
    fn set_value(&mut self, db: &mut MysqlConnection, value: Option<Self::RustType>) -> Result<()>;

    /// Fetches feature flag value from the db
    #[allow(dead_code)]
    fn fetch_value(&mut self, db: &mut MysqlConnection) -> Result<Option<Self::RustType>>;

    /// Get the cached value
    fn value(&self) -> Option<Self::RustType>;
}

/// Represents the actual underlying data stored in the db
#[derive(Debug, Clone, Queryable, Selectable, Insertable, AsChangeset, Deserialize)]
#[diesel(table_name = crate::schema::feature_flags)]
struct FeatureFlagModel {
    name: String,
    value: Option<String>,
    /// Flag type as SQL type name
    flag_type: String,
}

/// A boolean feature flag
#[derive(Clone, Debug)]
pub struct FeatureFlagBoolean {
    inner: FeatureFlagModel,
}

impl FeatureFlag for FeatureFlagBoolean {
    type RustType = bool;

    fn fetch_or_default(
        db: &mut MysqlConnection,
        flag_name: &str,
        default_value: Option<Self::RustType>,
    ) -> Result<Self> {
        Self::fetch(db, flag_name)?.map_or_else(
            || {
                let res = Self {
                    inner: FeatureFlagModel {
                        name: flag_name.to_string(),
                        value: default_value.map(|v| {
                            if v {
                                String::from("1")
                            } else {
                                String::from("0")
                            }
                        }),
                        flag_type: String::from("BOOLEAN"),
                    },
                };
                diesel::insert_into(feature_flags::table())
                    .values(&res.inner)
                    .execute(db)?;
                Ok(res)
            },
            Ok,
        )
    }

    fn fetch(db: &mut MysqlConnection, flag_name: &str) -> Result<Option<Self>> {
        use crate::schema::feature_flags::dsl::*;
        feature_flags
            .filter(name.eq(flag_name))
            .first::<FeatureFlagModel>(db)
            .optional()?
            .map(|inner| {
                if inner.flag_type == "BOOLEAN" {
                    Ok(Self { inner })
                } else {
                    Err(anyhow::Error::from(BotError::WrongFlagType))
                }
            })
            .transpose()
    }

    fn set_value(
        &mut self,
        db: &mut MysqlConnection,
        in_value: Option<Self::RustType>,
    ) -> Result<()> {
        use crate::schema::feature_flags::dsl::*;
        self.inner.value = in_value.map(|v| {
            if v {
                String::from("1")
            } else {
                String::from("0")
            }
        });
        diesel::update(feature_flags.filter(name.eq(self.inner.name.clone())))
            .set(value.eq(self.inner.value.clone()))
            .execute(db)?;
        Ok(())
    }

    fn fetch_value(&mut self, db: &mut MysqlConnection) -> Result<Option<Self::RustType>> {
        use crate::schema::feature_flags::dsl::*;
        self.inner.value = feature_flags
            .filter(name.eq(self.inner.name.clone()))
            .first::<FeatureFlagModel>(db)?
            .value;
        Ok(self.value())
    }

    fn value(&self) -> Option<Self::RustType> {
        Some(if self.inner.value.as_deref()? == "0" {
            false
        } else if self.inner.value.as_deref()? == "1" {
            true
        } else {
            panic!(
                "Feature flag {} encountered an impossible value!",
                self.inner.name
            )
        })
    }
}
