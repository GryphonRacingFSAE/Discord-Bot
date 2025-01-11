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

# Copy source code
COPY . .

# Build the dependencies only to cache them
RUN cargo build --release

# Install diesel_cli
RUN cargo install diesel_cli --no-default-features --features mysql

# Set environment variables
ENV MYSQLCLIENT_LIB_DIR=/usr/lib
ENV MYSQLCLIENT_INCLUDE_DIR=/usr/include/mysql
ENV MYSQLCLIENT_VERSION=8.0

# Ensure the entrypoint script is executable
RUN chmod +x entrypoint.sh

# Define the entrypoint
ENTRYPOINT ["sh", "-c", "diesel setup && diesel migration run && cargo run"]