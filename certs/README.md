Optional. Place extra CA certificates (`*.pem` or `*.crt`) here only if you need Node to trust an
additional CA process-wide (e.g. a corporate proxy). The container entrypoint sets
`NODE_EXTRA_CA_CERTS` to the first file found here.

The Russian national root CA needed for the Max API is already bundled in `server/certs/` and is
trusted for Max requests only, so nothing is required here for Max.
