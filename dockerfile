FROM denoland/deno:latest

ENV RUNNING_IN_DOCKER true
ENV DOCKERIZE_VERSION v0.7.0

WORKDIR /usr/app/

# Install minimal dependencies
RUN apt-get update && apt-get install -y \
    ca-certificates \
    wget \
    curl \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# Install dockerize
RUN wget --no-check-certificate -O - https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz | tar xzf - -C /usr/local/bin \
    || curl -L https://github.com/jwilder/dockerize/releases/download/$DOCKERIZE_VERSION/dockerize-linux-amd64-$DOCKERIZE_VERSION.tar.gz | tar xzf - -C /usr/local/bin

# Copy Deno configuration files
COPY deno.json deno.lock ./

# Copy source code
COPY . .

# Cache dependencies
RUN deno cache src/index.ts
RUN deno run generate
RUN deno run deploy-commands
RUN deno run migrate

RUN deno check src/index.ts