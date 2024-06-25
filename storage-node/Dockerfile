FROM rustlang/rust:nightly as poseidon2-bn256

RUN apt-get update && apt-get install -y \
  binaryen \
  curl \
  build-essential \
  pkg-config \
  libssl-dev \
  git \
  && rm -rf /var/lib/apt/lists/*

RUN curl https://rustwasm.github.io/wasm-pack/installer/init.sh -sSf | sh
WORKDIR /usr/src/poseidon2-bn256
COPY poseidon2-bn256 .
RUN sh build.sh

FROM node:22-alpine
WORKDIR /app

RUN corepack enable && corepack prepare pnpm@9.1.1 --activate

COPY pnpm-lock.yaml pnpm-workspace.yaml ./
COPY storage-node/package.json storage-node/package.json
COPY common common
COPY crypto-sdk crypto-sdk
COPY circuits circuits
COPY poseidon2-bn256 poseidon2-bn256
COPY tsconfig.json tsconfig.json
COPY --from=poseidon2-bn256 /usr/src/poseidon2-bn256/nodejs poseidon2-bn256/nodejs
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY storage-node storage-node
RUN pnpm install --recursive --frozen-lockfile
RUN pnpm --filter zpst-common build
RUN pnpm --filter zpst-crypto-sdk build
RUN pnpm -r build

EXPOSE 3000

WORKDIR /app/storage-node
CMD ["pnpm", "start"]
