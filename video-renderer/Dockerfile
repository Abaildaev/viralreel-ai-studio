FROM node:20-slim

# Install wait-for-it or just ffmpeg
RUN apt-get update && apt-get install -y ffmpeg && rm -rf /var/lib/apt/lists/*

WORKDIR /usr/src/app

# Install app dependencies
COPY package*.json ./
RUN npm ci --only=production

# Bundle app source
COPY . .

# Expose port
ENV PORT=8080
ENV NODE_ENV=production
EXPOSE 8080

# Command to run the app
CMD [ "node", "server.js" ]
