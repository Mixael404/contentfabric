`russian-trusted-root-ca.pem` is the public "Russian Trusted Root CA" certificate of the Russian
Ministry of Digital Development, downloaded from https://gu-st.ru/content/lending/russian_trusted_root_ca_pem.crt
(SHA-256 D2:6D:2D:02:31:B7:C3:9F:92:CC:73:85:12:BA:54:10:35:19:E4:40:5D:68:B5:BD:70:3E:97:88:CA:8E:CF:31).

The Max Bot API (`platform-api2.max.ru`) is served with a certificate issued by this CA. The Max
client trusts it **only for Max requests** (scoped undici Agent); it is not added to the global
Node trust store, so OpenAI, Telegram and image providers are unaffected.
