# OddsClub — production image (docs/DEPLOYMENT.md).
# Runs the normal `next start` server (one long-running process: the live chat keeps its connections in memory).
# The full app is kept in the image so the maintenance commands work inside it too:
#   docker exec -it <container> pnpm seed | pnpm chat:crypto | pnpm data:export
# Configuration comes from environment variables at run time (never baked into the image): see .env.example.

FROM node:22.23.5-alpine AS base
RUN apk add --no-cache libc6-compat && corepack enable && corepack prepare pnpm@10.33.0 --activate
WORKDIR /app

# 1. dependencies (cached while package.json / the lockfile don't change)
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

# 2. build
FROM base AS build
COPY --from=deps /app/node_modules ./node_modules
COPY . .
ENV NEXT_TELEMETRY_DISABLED=1
# the build only needs placeholders; the real values are given when the container starts
RUN PAYLOAD_SECRET=build-only DATABASE_URL=mongodb://127.0.0.1:27017/build-only OC_AUTO_SEED=false pnpm build

# 3. run
FROM base AS run
ENV NODE_ENV=production NEXT_TELEMETRY_DISABLED=1 PORT=3000 HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app ./
USER node
EXPOSE 3000
CMD ["pnpm", "start"]
