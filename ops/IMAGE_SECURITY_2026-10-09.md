# Container vulnerability evidence

Date: 9 October 2026. Trivy 0.75.0; database UpdatedAt 2026-10-09T13:10:00.476847953Z. Scope: HIGH/CRITICAL vulnerability findings with available fixes; this does not assert absence of other severities, unfixed vulnerabilities or undiscovered flaws. Counts refer to package/CVE occurrences.

## api

Image: `nudra-api:hardened`, digest `sha256:bd39da40911bd82c46faa880c88d80e855dae4792d26a83d2ed0cf058725a06e`. HIGH: 0; CRITICAL: 0.

## frontend

Image: `nudra-frontend:hardened`, digest `sha256:1f03f6aac9486b13c9d243b30d1235ca96bec974e9112aa7a2dcb4aa2487e2d2`. HIGH: 0; CRITICAL: 0.

## domain

Image: `nudra-domain-auth:hardened`, digest `sha256:f01c44c0cb8a019eb88ab31eaf86704692d1e18a312e02858ae04ba00c3ed1a4`. HIGH: 0; CRITICAL: 0.

## Historical mc image (removed from Compose)

Image: `nudra-mc:hardened`, digest `sha256:c00146fba4cc865363eaccf99a1ddbeb22f13af812b5c0df7d72e17a9f8e1baf`. HIGH: 24; CRITICAL: 1.

| Package | CVE / advisory | Severity | Installed | Fixed versions |
|---|---|---|---|---|
| github.com/prometheus/prometheus | CVE-2026-42151 | HIGH | v0.303.0 | 0.311.3 |
| github.com/prometheus/prometheus | CVE-2026-42154 | HIGH | v0.303.0 | 0.311.3, 0.305.2 |
| golang.org/x/crypto | CVE-2025-47913 | HIGH | v0.40.0 | 0.43.0 |
| golang.org/x/crypto | CVE-2026-39828 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39829 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39830 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39831 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39832 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39835 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-42508 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-46595 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-46597 | HIGH | v0.40.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-56854 | HIGH | v0.40.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-25681 | HIGH | v0.42.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-27136 | HIGH | v0.42.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-33814 | HIGH | v0.42.0 | 0.53.0 |
| golang.org/x/net | CVE-2026-39821 | HIGH | v0.42.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-46600 | HIGH | v0.42.0 | 0.56.0 |
| golang.org/x/text | CVE-2026-56852 | HIGH | v0.27.0 | 0.39.0 |
| google.golang.org/grpc | CVE-2026-33186 | CRITICAL | v1.71.0 | 1.79.3 |
| google.golang.org/grpc | CVE-2026-84304 | HIGH | v1.71.0 | 1.83.1 |
| google.golang.org/grpc | CVE-2026-84445 | HIGH | v1.71.0 | 1.82.2, 1.83.2, 1.84.0-dev.0.20260825144003-d5a41119e0e3, 1.85.0-dev.0.20260825072537-93e31b48545e |
| google.golang.org/grpc | GHSA-hrxh-6v49-42gf | HIGH | v1.71.0 | 1.82.1 |
| stdlib | CVE-2026-78667 | HIGH | v1.25.14 | 1.26.9, 1.27.2 |
| stdlib | CVE-2026-97031 | HIGH | v1.25.14 | 1.26.9, 1.27.2 |

## Historical MinIO image (removed from Compose)

Image: `nudra-minio:hardened`, digest `sha256:e9b4a787b896656c73a2e2a57ac432554c8e51f7b873c2226c7fd059e75ef4c8`. HIGH: 37; CRITICAL: 4.

| Package | CVE / advisory | Severity | Installed | Fixed versions |
|---|---|---|---|---|
| github.com/apache/thrift | CVE-2026-41602 | HIGH | v0.21.0 | 0.23.0 |
| github.com/apache/thrift | CVE-2026-43871 | HIGH | v0.21.0 | 0.24.0 |
| github.com/buger/jsonparser | CVE-2026-32285 | HIGH | v1.1.1 | 1.1.2 |
| github.com/go-jose/go-jose/v4 | CVE-2026-34986 | HIGH | v4.1.0 | 4.1.4 |
| github.com/prometheus/prometheus | CVE-2026-42151 | HIGH | v0.303.0 | 0.311.3 |
| github.com/prometheus/prometheus | CVE-2026-42154 | HIGH | v0.303.0 | 0.311.3, 0.305.2 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77405 | CRITICAL | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77408 | CRITICAL | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77411 | CRITICAL | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77403 | HIGH | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77404 | HIGH | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77406 | HIGH | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77407 | HIGH | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77410 | HIGH | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-77412 | HIGH | v1.10.0 | 1.13.0 |
| github.com/rabbitmq/amqp091-go | CVE-2026-79921 | HIGH | v1.10.0 | 1.13.0 |
| go.opentelemetry.io/otel/sdk | CVE-2026-24051 | HIGH | v1.35.0 | 1.40.0 |
| go.opentelemetry.io/otel/sdk | CVE-2026-39883 | HIGH | v1.35.0 | 1.43.0 |
| golang.org/x/crypto | CVE-2025-47913 | HIGH | v0.37.0 | 0.43.0 |
| golang.org/x/crypto | CVE-2026-39828 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39829 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39830 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39831 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39832 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-39835 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-42508 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-46595 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-46597 | HIGH | v0.37.0 | 0.52.0 |
| golang.org/x/crypto | CVE-2026-56854 | HIGH | v0.37.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-25681 | HIGH | v0.39.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-27136 | HIGH | v0.39.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-33814 | HIGH | v0.39.0 | 0.53.0 |
| golang.org/x/net | CVE-2026-39821 | HIGH | v0.39.0 | 0.55.0 |
| golang.org/x/net | CVE-2026-46600 | HIGH | v0.39.0 | 0.56.0 |
| golang.org/x/text | CVE-2026-56852 | HIGH | v0.24.0 | 0.39.0 |
| google.golang.org/grpc | CVE-2026-33186 | CRITICAL | v1.72.0 | 1.79.3 |
| google.golang.org/grpc | CVE-2026-84304 | HIGH | v1.72.0 | 1.83.1 |
| google.golang.org/grpc | CVE-2026-84445 | HIGH | v1.72.0 | 1.82.2, 1.83.2, 1.84.0-dev.0.20260825144003-d5a41119e0e3, 1.85.0-dev.0.20260825072537-93e31b48545e |
| google.golang.org/grpc | GHSA-hrxh-6v49-42gf | HIGH | v1.72.0 | 1.82.1 |
| stdlib | CVE-2026-78667 | HIGH | v1.25.14 | 1.26.9, 1.27.2 |
| stdlib | CVE-2026-97031 | HIGH | v1.25.14 | 1.26.9, 1.27.2 |

## Selected SILO release image

Image: `pgsty/silo@sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46`, content digest `sha256:635197cb9f36d01bee221d34d1c7d7960f6a95c48b0b6c01d99cd13bdae51a46`. This official release bundles both the `silo` server and `mcli`/`mc` client.

| Binary/package | CVE | Severity | Go version | Fixed version |
|---|---|---|---|---|
| `usr/bin/silo` and `usr/bin/mcli` | CVE-2026-78667 | HIGH | Go 1.27.1 | 1.27.2 |
| `usr/bin/silo` and `usr/bin/mcli` | CVE-2026-97031 | HIGH | Go 1.27.1 | 1.27.2 |

This means two CVE IDs occur in each of the two binaries (four package/CVE occurrences total), zero CRITICAL. Go 1.27.2 is published by the [official Go downloads page](https://go.dev/dl/). The selected image remains pinned in the local and production Compose files, and the CI scan fails until it is updated or rebuilt with a fixed Go toolchain. Do not report storage as vulnerability-free.

The API/frontend/domain runtime OS packages were upgraded and unused npm tooling removed. No CVE suppression was added to make scans pass. The MinIO server/client sections above are historical comparison images and are no longer selected by Compose.
