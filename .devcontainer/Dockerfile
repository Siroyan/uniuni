# syntax=docker/dockerfile:1
FROM node:22-bookworm

ENV CARGO_HOME=/home/node/.cargo \
    RUSTUP_HOME=/home/node/.rustup \
    PATH=/home/node/.cargo/bin:$PATH

USER node
SHELL ["/bin/bash", "-o", "pipefail", "-c"]

# A build_ca secret can supply a combined CA bundle for networks with an HTTPS proxy.
# It is optional on ordinary local Docker installations and is never stored in the image.
RUN --mount=type=secret,id=build_ca,mode=0444,required=false \
    set -e; \
    if [ -r /run/secrets/build_ca ]; then \
      export SSL_CERT_FILE=/run/secrets/build_ca \
        CURL_CA_BUNDLE=/run/secrets/build_ca \
        CARGO_HTTP_CAINFO=/run/secrets/build_ca; \
    fi; \
    curl --proto '=https' --tlsv1.2 -fsSL https://sh.rustup.rs \
      | sh -s -- -y --no-modify-path --profile minimal --default-toolchain stable; \
    rustup target add wasm32-unknown-unknown; \
    cargo install --locked wasm-bindgen-cli --version 0.2.114

# Login shells reset PATH in the base image; keep Rust available in VS Code terminals.
RUN printf '\nexport PATH="$HOME/.cargo/bin:$PATH"\n' >> /home/node/.profile
