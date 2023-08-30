#!/bin/bash
APP="frybot"
TAG="$(date +%Y-%m-%d_%H.%M.%S)"
REG="docker-reg.service.consul:5000"
PUSH="${PUSH:-0}"
JOBFILE="v2.hcl"

pushd "$(dirname "${BASH_SOURCE[0]}")" >> /dev/null

sudo APP=$APP TAG=$TAG DOCKER_BUILDKIT=1 docker build -t "$APP:$TAG" -t "$APP:latest" -f ./Dockerfile ..

sudoDocker () {
  sudo TAG=$TAG APP=$APP REG=$REG docker "$@"
}

if [ "$PUSH" = "1" ] || [ "$DEPLOY" = "1" ]; then
  sudoDocker tag "$APP:$TAG" "$REG/$APP:$TAG"
  sudoDocker push "$REG/$APP:$TAG"
  if [ "$DEBUG" == "1" ]; then 
    sudoDocker tag "$APP:$TAG" "$REG/$APP:dev"
    sudoDocker push "$REG/$APP:dev"
  else
    sudoDocker tag "$APP:$TAG" "$REG/$APP:latest"
    sudoDocker tag "$APP:$TAG" "$REG/$APP:prod"
    sudoDocker push "$REG/$APP:latest"
    sudoDocker push "$REG/$APP:prod"
  fi
fi

if [ "$DEPLOY" = 1 ]; then
  if ["$DEBUG" == "1" ]; then JOBFILE="v2.hcl"; fi
  nomad job run $JOBFILE
fi

popd