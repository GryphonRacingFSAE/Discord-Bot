# GRacingBot (Discord-Bot)

## About

A Discord bot used internally on our server to provide the following services:

- Monitor and backup audit logs (locally and on the server itself)
- Schedule events and countdown for events in specific chats
- Monitor our shop door(s) and update on whether the shop is open/closed
- Semi-automatic verification of members in the Discord server

## Setup

- Install [rustup](https://rustup.rs/)
- Ensure you have at least Rust `1.78` installed using rustup (`rustup install`)

There are certain environment variables we expect:

```ini
DISCORD_TOKEN=... # Discord bot token
TIME_ZONE=America/Toronto # Time zone
GUILD_ID=... # Guild ID of the server you're developing for


# Email services
EMAIL_USERNAME='...' # Email address
EMAIL_APP_PASSWORD='...' # Email password
SMTP_SERVER='...' # STMP server

# Database
MYSQL_ROOT_PASSWORD=... # Password
MYSQL_USER=... # MySQL username
MYSQL_PASSWORD=... # MySQL password
MYSQL_DATABASE=... # MySQL database
MYSQL_HOST=127.0.0.1 # MySQL host
DATABASE_URL=... # URL to the MySQL DB usually formatted as: mysql://{MYSQL_USER}:{MYSQL_PASSWORD}@{MYSQL_HOST}:3306/{MYSQL_DATABASE}
```

### Database

If you require a database see the following [guide](https://diesel.rs/guides/getting-started.html) for the most
information.

- tl;dr We recommend you run an Linux system ([WSL2](https://learn.microsoft.com/en-us/windows/wsl/install) if you're on
  windows) and install the following packages:
    - libmariadb-dev
    - pkg-config
- or whatever suitable mysql-dev package that is on your respective OS.
- After installing dependencies, run:

```bash
cargo install diesel --no-default-features --features mysql 
```

- If your install keeps failing here, you likely have a dependency issue and need to install your MySQL dev packages
    - If this issue still persists, you can in theory use docker compose to simply run your dev builds
    - You could also go into the `Dockerfile` and try to use the `sudo apt install` dependencies and install them on
      your system to resolve issues
- After a successful install, go into the project directory and:

```bash
diesel setup
diesel migration run
```

- After that, you're now free to develop. If you're touching the database's schema files or migration files,
  checkout [diesel-rs](https://diesel.rs/)

### Build + Run

To just simply run the bot in the project directory:

```bash
cargo run
```

However, we also make use of [Docker compose](https://docs.docker.com/compose/) so it is possible to also run the MySQL
server:

```bash
docker compose up
```

To stop:

```bash
docker compose down
```

We recommend you familiarize yourself with the basic Docker compose commands before diving too deep.

## Development

### Shop Status Monitoring - Evan

We have an ESP32 at the main shop entrance monitoring if it's open or closed, if the status changes, it sends a POST
request to an HTTP server with the Discord bot, which then sends a message to the server.

### Verification

To handle verification, we have a Docker volume `./resources`which contains a `verification.xlsx`. We do strictly **only
reads**
of this file. This data is fed into the MySQL database.

### Feature Flags

We don't have much unit testing, so we rely much more on being able to quickly disable broken features fast. Features
flags are stored in `./src/services/fflags`. For example usage
see: `crate::services::verification::verification_db::update_verification_roles`
All features flags are stored in a MySQL database.

### Countdown

The countdown service is responsible for simply maintaining a message that countdowns the time until a certain date.
All countdowns are stored in a MySQL database.

### diesel-rs

We use an ORM. Could we use some custom solution or just raw MySQL? Sure, but this is a bot that we don't
expect to handle absurd amounts of traffic. To view the schemas of all database objects: `./src/schema.rs`.
We generally prefer to create the migrations ourselves rather than relying on automatically generated ones.

### Subsection + Section Auto Assignment - Dallas

Assigns the Category role based on a users current role:

- Dynamics: Frame, Aerodynamics, Brakes, Suspension
- Electrical: Low Voltage, Embedded, Tractive System
- Business: Marketing, Purchasing, Sponsorship

### Deployment - Dallas

This bot is run on the Embedded subsection's shop computer, it's run in a docker container and locally saved files are
mounted onto the filesystem to ensure non-volatility.

## Resources

- [diesel-rs docs](https://docs.diesel.rs/master/diesel/index.html)
- [poise docs](https://docs.rs/poise/latest/poise/)
- [serenity docs](https://github.com/serenity-rs/serenity)
