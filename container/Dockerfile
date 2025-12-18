FROM node:24.12-alpine AS base
WORKDIR /app
RUN apk add --no-cache ffmpeg python3 alpine-sdk
COPY package.json package-lock.json tsconfig.json ./
RUN npm ci

FROM base
WORKDIR /app
COPY redis_scripts ./redis_scripts
COPY src ./src
RUN npx tsc && rm -r ./src && npm prune --production
CMD ["node"]