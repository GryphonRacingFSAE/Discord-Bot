FROM node:latest

WORKDIR /usr/app

COPY . .

# Install dependencies and build the bot
RUN npm i
RUN npm run build

# Deploy all commands, then run the bot
CMD npm run deploy-commands && npm run preview
