#!/bin/sh
set -eu
# Existing Coolify volumes may have been created by the old root-run image.
# Repair only our data directory and own files, then drop privileges.
citymart_data_dir=${DATA_DIR:-/data}
if [ "$(id -u)" = "0" ]; then
  mkdir -p "$citymart_data_dir"
  chown node:node "$citymart_data_dir"
  for citymart_file in "$citymart_data_dir"/giveaways.json "$citymart_data_dir"/giveaways.json.legacy.bak; do
    if [ -f "$citymart_file" ]; then chown node:node "$citymart_file"; chmod 600 "$citymart_file"; fi
  done
  exec su-exec node "$@"
fi
exec "$@"
