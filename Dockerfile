FROM rust:1.82

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
COPY . .
RUN whoami

# I hate diesel-rs
ENV MYSQLCLIENT_LIB_DIR=/usr/lib
ENV MYSQLCLIENT_INCLUDE_DIR=/usr/include/mysql
ENV MYSQLCLIENT_VERSION=8.0
#ENV DATABASE_URL=$mysql


RUN cargo install diesel_cli --no-default-features --features mysql

RUN cargo build --release

ENTRYPOINT ["sh", "-c", "diesel setup && diesel migration run && cargo run"]
