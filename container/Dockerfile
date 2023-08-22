FROM node:18-alpine as base
WORKDIR /app
RUN apk add --no-cache ffmpeg python3 alpine-sdk
COPY package.* tsconfig.json ./
RUN npm install

FROM base
WORKDIR /app
COPY redis_scripts ./redis_scripts
COPY src ./src
RUN npx tsc && rm -r ./src && npm prune --production
CMD ["node"]