#!/bin/sh
set -e
# If a CA bundle is mounted (e.g. the Russian national root CA for the Max API), trust it.
if [ -z "$NODE_EXTRA_CA_CERTS" ] && [ -d /app/certs ]; then
  for f in /app/certs/*.pem /app/certs/*.crt; do
    if [ -f "$f" ]; then
      export NODE_EXTRA_CA_CERTS="$f"
      echo "Using extra CA certificate: $f"
      break
    fi
  done
fi
exec "$@"
