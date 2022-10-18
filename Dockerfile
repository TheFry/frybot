FROM node:16-alpine

WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package.* .
RUN npm install
COPY src/ .
CMD ["node", "main.js"]