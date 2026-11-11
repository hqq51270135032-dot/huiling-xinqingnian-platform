#!/bin/sh
set -eu

mkdir -p "${UPLOAD_DIR:-/var/data/uploads}"

if [ "$(id -u)" = "0" ]; then
  chown -R node:node /var/data
  exec gosu node "$@"
fi

exec "$@"
