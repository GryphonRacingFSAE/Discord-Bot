#!/bin/zsh

# Install dependencies
npm install

# Transpile TypeScript to JavaScript
npm run build

# Register any new slash commands (if applicable)
node dist/deploy-commands.js

# Run Discord bot
node dist/index.js

