ARG NODE_IMAGE=node:24-bookworm-slim
FROM ${NODE_IMAGE} AS build

WORKDIR /app

COPY package*.json ./
RUN npm install --legacy-peer-deps

COPY . .
RUN npm run build

FROM ${NODE_IMAGE} AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
COPY scripts ./scripts
COPY --from=build /app/dist ./dist

RUN chown -R node:node /app

EXPOSE 8080

USER node

CMD ["node", "scripts/start.js"]
