ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS base

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ffmpeg \
  && rm -rf /var/lib/apt/lists/*

FROM base AS prod-deps

COPY package*.json ./
COPY prisma ./prisma
RUN npm install --omit=dev && npx prisma generate

FROM base AS runtime

COPY package*.json ./
COPY prisma ./prisma
COPY --from=prod-deps /app/node_modules ./node_modules
COPY scripts ./scripts
COPY src ./src

RUN mkdir -p /app/uploads \
  && chown -R node:node /app

EXPOSE 4000

USER node

CMD ["npm", "start"]
