Place CA certificates (`*.pem` or `*.crt`) here to have them trusted by Node inside the container.

Needed for the Max Bot API (`platform-api2.max.ru`), which uses a certificate issued by the
Russian national CA. Download the root certificate from https://www.gosuslugi.ru/crt
("Russian Trusted Root CA", PEM format) and save it as `certs/russian_trusted_root_ca.pem`.

The container entrypoint sets `NODE_EXTRA_CA_CERTS` to the first file found here.
