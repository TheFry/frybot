FROM node:18-alpine

WORKDIR /app
RUN apk add --no-cache ffmpeg
COPY package.* tsconfig.json src/ .
RUN npm install && npx tsc && rm -rf src
CMD ["node", "built/main.js"]