# Tests & Fixtures

This project ships with a lightweight test suite that covers both worker logic and front-end utilities. Some tests rely on X.509 artifacts that were generated locally for deterministic assertions.

## PKI Fixtures

The files under `tests/fixtures/` were produced with OpenSSL and are safe to commit for testing:

- `test-ca.cert.pem` / `test-ca.key.pem` – self-signed root certificate.
- `test-leaf.cert.pem` / `test-leaf.key.pem` – leaf certificate issued by the root.
- `test-leaf.cert.der` – DER encoding of the leaf certificate used for hashing tests.
- `test-leaf.csr.pem` – certificate signing request retained for reproducibility.

To regenerate the fixtures, run the following commands from the repository root:

```bash
openssl req -x509 -newkey rsa:2048 -keyout tests/fixtures/test-ca.key.pem -out tests/fixtures/test-ca.cert.pem -days 365 -nodes -sha256 -subj "/C=US/ST=Example/L=Example/O=Example Org/OU=Testing/CN=Test Root CA"
openssl req -new -newkey rsa:2048 -keyout tests/fixtures/test-leaf.key.pem -out tests/fixtures/test-leaf.csr.pem -nodes -sha256 -subj "/C=US/ST=Example/L=Example/O=Example Org/OU=Testing/CN=Leaf Certificate"
openssl x509 -req -in tests/fixtures/test-leaf.csr.pem -CA tests/fixtures/test-ca.cert.pem -CAkey tests/fixtures/test-ca.key.pem -CAcreateserial -out tests/fixtures/test-leaf.cert.pem -days 365 -sha256
openssl x509 -in tests/fixtures/test-leaf.cert.pem -outform der -out tests/fixtures/test-leaf.cert.der
```

The SHA-256 fingerprint of `test-leaf.cert.der` that the tests assert against can be verified with:

```bash
openssl dgst -sha256 tests/fixtures/test-leaf.cert.der
```

## Running Tests

Execute all tests with:

```bash
npm test
```

The suite exercises both back-end worker utilities (`src/http/json-response.ts`, `src/pki/format.ts`) and front-end helpers in `public/js/formatters.js` using a lightweight DOM from [`linkedom`](https://github.com/WebReflection/linkedom).
