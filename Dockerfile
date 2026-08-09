# Ubuntu 24.04 @ 2026-08-07
ARG UBUNTU_VERSION="24.04"
ARG SHASUM="sha256:561618e2c15bf2397621dd04f96926663a3b5616c189cf7e38db7e82f5c538ea"
# NodeJS image
FROM ubuntu:${UBUNTU_VERSION}@${SHASUM} AS nodejs
SHELL ["/bin/bash", "-o", "pipefail", "-c"]
ARG DEBIAN_FRONTEND=noninteractive
LABEL org.opencontainers.image.source=https://github.com/KrammyGod/pingbot

# Install dependencies from apt that we may need in the container
RUN apt-get update && apt-get install -y --no-install-recommends \
    ca-certificates \
    curl \
    gnupg \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

# Install NodeJS
ARG NODE_MAJOR=24
ARG NODE_VERSION=24.19.0
# Must match the npm that generated package-lock.json.
ARG NPM_VERSION=11.5.1

RUN curl -fsSL https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key | gpg --dearmor -o /etc/apt/keyrings/nodesource.gpg \
  && echo "deb [signed-by=/etc/apt/keyrings/nodesource.gpg] https://deb.nodesource.com/node_${NODE_MAJOR}.x nodistro main" | tee /etc/apt/sources.list.d/nodesource.list \
  && apt-get update && apt-get install -y --no-install-recommends \
    nodejs="${NODE_VERSION}"-1nodesource1 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && npm install -g npm@${NPM_VERSION} \
  && npm cache clean --force

# Create user and home directory
RUN groupadd -g 2000 -r node \
  && useradd -u 2000 -r -m -g node node \
  && mkdir -p /home/node \
  && chown -R node:node /home/node

# Builder image
FROM nodejs AS builder
ARG DEBIAN_FRONTEND=noninteractive

# git                     -> github:* dependencies (pixiv.ts, play-dl)
# build-essential/python3 -> node-gyp, for sodium-native and friends
RUN apt-get update && apt-get install -y --no-install-recommends \
    git \
    build-essential \
    python3 \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /home/node

# Install packages separately for docker cache. NODE_ENV is deliberately unset
# here: typescript, tsc-alias and rimraf are devDependencies and are required.
COPY --chown=node:node package*.json ./
RUN npm ci

COPY --chown=node:node tsconfig.json ./
COPY --chown=node:node src ./src

# npm run build == rimraf ./dist && tsc --build && tsc-alias.
# Pruning in place keeps the native modules compiled above, so the final stage
# copies node_modules verbatim and never needs a compiler.
RUN npm run build \
  && npm prune --omit=dev

# Final image
FROM nodejs
ENV NODE_ENV=production
ARG DEBIAN_FRONTEND=noninteractive

# Bumped by the scheduled rebuild. A stale yt-dlp is the single most likely cause
# of playback breaking, since YouTube changes often.
ARG YTDLP_VERSION=2026.07.04
# YouTube's "n challenge" has to be solved in JavaScript or only storyboard images come
# back. yt-dlp needs both this solver distribution and a runtime enabled with
# --js-runtimes; the runtime is the node already in this image.
ARG YTDLP_EJS_VERSION=0.8.0

RUN apt-get update && apt-get install -y --no-install-recommends \
    tini \
    ffmpeg \
    python3 \
    python3-pip \
  && apt-get clean \
  && rm -rf /var/lib/apt/lists/* \
  && pip3 install --no-cache-dir --break-system-packages \
    "yt-dlp==${YTDLP_VERSION}" "yt-dlp-ejs==${YTDLP_EJS_VERSION}" \
  # Fail the build loudly if any of these assumptions break.
  && test -x /usr/bin/tini \
  && test -x /usr/bin/ffmpeg \
  && node --version \
  && yt-dlp --version \
  # Age gated playback silently degrades to "no formats" without the solver.
  && python3 -c "import yt_dlp_ejs" \
  && ffmpeg -version

# Point youtube-dl-exec at the pinned system yt-dlp rather than the copy it bundles,
# so the extractor is upgraded by rebuilding this image, not by a package release.
ENV YTDLP_PATH=/usr/local/bin/yt-dlp

# ffmpeg-static's binary is statically linked against a much older glibc, and static
# glibc cannot resolve hostnames here, so every stream fails. The distro build is
# dynamic and works; ffmpeg-static stays a dependency for local development.
ENV FFMPEG_BIN=/usr/bin/ffmpeg

WORKDIR /home/node

COPY --from=builder --chown=node:node /home/node/node_modules ./node_modules
COPY --from=builder --chown=node:node /home/node/dist ./dist

# package.json -> "main", and `npm run` for the collector/reset CronJobs
# files/       -> static assets read at runtime (lines.txt, *.png, *.gif)
# .env-cmdrc   -> env-cmd environments used by `npm run collect:*`
COPY --chown=node:node package.json ./
COPY --chown=node:node files ./files
COPY --chown=node:node .env-cmdrc ./

USER node

EXPOSE 5000

ENTRYPOINT ["/usr/bin/tini", "--"]

# Deliberately not `npm start`: npm as PID 1 does not forward SIGTERM
CMD ["node", "--enable-source-maps", "dist/index.js"]
