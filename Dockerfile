FROM rust:1.81

# Install necessary dependencies
RUN apt-get update && apt-get install -y \
    libmariadb-dev \
    libssl-dev \
    libclang-dev \
    openssl \
    pkg-config \
    build-essential \
    cmake \
    g++ \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

COPY Cargo.toml Cargo.lock ./

RUN cargo install diesel_cli --no-default-features --features mysql

RUN cargo build --release

COPY .env .env

RUN chmod +x entrypoint.sh

ENV MYSQLCLIENT_LIB_DIR=/usr/lib
ENV MYSQLCLIENT_INCLUDE_DIR=/usr/include/mysql
ENV MYSQLCLIENT_VERSION=8.0

ENTRYPOINT ["sh", "-c", "diesel setup && diesel migration run && cargo run --release"]