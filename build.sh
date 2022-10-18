#!/bin/bash
APP="geeb-bot"

DOCKER_BUILDKIT=1 docker build -t "$APP":latest -t "$APP:$(date +%Y-%m-%d_%H.%M.%S)" .