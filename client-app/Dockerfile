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

FROM node:22-alpine AS build
WORKDIR /app

ARG PUBLIC_SEQUENCER_API_URL
ENV PUBLIC_SEQUENCER_API_URL $PUBLIC_SEQUENCER_API_URL

ARG PUBLIC_NODE_API_URL
ENV PUBLIC_NODE_API_URL $PUBLIC_NODE_API_URL

RUN corepack enable && corepack prepare pnpm@9.1.1 --activate
COPY ./pnpm-lock.yaml pnpm-workspace.yaml ./
COPY client-app/package.json client-app/package.json
COPY common common
COPY poseidon2-bn256 poseidon2-bn256
COPY --from=poseidon2-bn256 /usr/src/poseidon2-bn256/bundler poseidon2-bn256/bundler
RUN --mount=type=cache,id=pnpm,target=/root/.local/share/pnpm/store pnpm fetch
COPY client-app client-app
RUN pnpm install --recursive --frozen-lockfile
RUN pnpm -r build

FROM nginx:alpine
COPY client-app/nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/client-app/build /usr/share/nginx/html

EXPOSE 80 3002

CMD ["nginx", "-g", "daemon off;"]
