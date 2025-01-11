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

# Build the dependencies only to cache them
RUN cargo build --release
RUN rm -rf src/main.rs

# Copy the rest of the source code
COPY . .

# Install diesel_cli
RUN cargo install diesel_cli --no-default-features --features mysql

# Set environment variables
ENV MYSQLCLIENT_LIB_DIR=/usr/lib
ENV MYSQLCLIENT_INCLUDE_DIR=/usr/include/mysql
ENV MYSQLCLIENT_VERSION=8.0

# Ensure the entrypoint script is executable
RUN chmod +x entrypoint.sh

# Define the entrypoint
ENTRYPOINT ["sh", "-c", "./entrypoint.sh"]
