use std::env::var;

use anyhow::Result;
use diesel_async::{AsyncConnection, AsyncMysqlConnection};

pub async fn establish_db_connection() -> Result<AsyncMysqlConnection> {
    let database_url = {
        let user = var("MYSQL_USER").expect("MYSQL_USER must be set");
        let password = var("MYSQL_PASSWORD").expect("MYSQL_PASSWORD must be set");
        let host = var("MYSQL_HOST").expect("MYSQL_HOST must be set");
        let database = var("MYSQL_DATABASE").expect("MYSQL_DATABASE must be set");
        format!("mysql://{}:{}@{}/{}", user, password, host, database)
    };
    match AsyncMysqlConnection::establish(&database_url).await {
        Ok(db) => Ok(db),
        Err(e) => Err(anyhow::Error::from(e)),
    }
}
