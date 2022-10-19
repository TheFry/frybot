#!/bin/bash
APP="sassy-bot"
TAG="$(date +%Y-%m-%d_%H.%M.%S)"
REG="docker-reg.service.consul:5000"
PUSH="${PUSH:-0}"

DOCKER_BUILDKIT=1 docker build -t "$APP":latest -t "$APP:$TAG" -f ./Dockerfile ..

if [ "$PUSH" = "1" ]; then
  docker tag "$APP:$TAG" "$REG/$APP:$TAG"
  docker tag "$APP:$TAG" "$REG/$APP:latest"
  docker push "$REG/$APP:$TAG"
  docker push "$REG/$APP:latest"
fi