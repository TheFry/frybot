#!/bin/bash
APP="frybot"
TAG="$(date +%Y-%m-%d_%H.%M.%S)"
REG="docker-reg.service.consul:5000"
PUSH="${PUSH:-0}"

DOCKER_BUILDKIT=1 docker build -t "$APP:$TAG" -t "$APP:latest" -f ./Dockerfile ..

if [ "$PUSH" = "1" ]; then
  docker tag "$APP:$TAG" "$REG/$APP:$TAG"
  docker push "$REG/$APP:$TAG"
  if [ "$DEBUG" == "1" ]; then 
    docker tag "$APP:$TAG" "$REG/$APP:dev"
    docker push "$REG/$APP:dev"
  else
    docker tag "$APP:$TAG" "$REG/$APP:latest"
    docker tag "$APP:$TAG" "$REG/$APP:prod"
    docker push "$REG/$APP:latest"
    docker push "$REG/$APP:prod"
  fi
fi