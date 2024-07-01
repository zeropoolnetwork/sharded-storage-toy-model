FROM rustlang/rust:nightly as poseidon2-bn256

RUN apt-get update && apt-get install -y \
  binaryen \
  curl \
  build-essential \
  pkg-config \
  libssl-dev \
  git

RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
WORKDIR /usr/src/poseidon2-bn256
COPY poseidon2-bn256 .
RUN sh build.sh

# There is no noir or bb for arm64
FROM --platform=linux/amd64 node:22
WORKDIR /app
SHELL ["/bin/bash", "-c"]

RUN apt update && apt install -y curl bash git tar gzip libc++-dev jq
RUN corepack enable && corepack prepare pnpm@9.1.1 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY sequencer/package.json sequencer/package.json
COPY common common
COPY crypto-sdk crypto-sdk
COPY circuits circuits

# Install Noir, barretenberg, and build circuits
RUN curl -L https://raw.githubusercontent.com/noir-lang/noirup/main/install | bash
ENV PATH="/root/.nargo/bin:$PATH"
RUN noirup
RUN curl -L https://raw.githubusercontent.com/AztecProtocol/aztec-packages/master/barretenberg/cpp/installation/install | bash
ENV PATH="/root/.bb:$PATH"
RUN bbup -v 0.41.0
WORKDIR /app/circuits
RUN nargo compile
RUN bb write_vk -b ./target/circuits.json -o ./target/vk

WORKDIR /app
COPY poseidon2-bn256 poseidon2-bn256
COPY tsconfig.json tsconfig.json
COPY --from=poseidon2-bn256 /usr/src/poseidon2-bn256/nodejs poseidon2-bn256/nodejs
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY sequencer sequencer
RUN pnpm install --recursive --frozen-lockfile

WORKDIR /app/sequencer
CMD ["pnpm", "start"]
