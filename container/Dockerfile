FROM node:18-alpine

WORKDIR /app
RUN apk add --no-cache ffmpeg python3 alpine-sdk
COPY package.* tsconfig.json src/ ./
RUN npm install && \
    npx tsc && \
    npm prune --production && \
    rm -rf src
CMD ["node", "built/main.js"]