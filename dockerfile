FROM node:latest

WORKDIR /usr/app

COPY . .

# Install dependencies and build the app
RUN npm i
RUN npm run build

# Run/display the app
CMD ["npm", "run", "preview"]
