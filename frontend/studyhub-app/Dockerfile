FROM node:20-bookworm-slim AS build

WORKDIR /app

COPY package*.json ./
RUN npm ci

COPY . .
RUN npm run build

FROM node:20-bookworm-slim AS runtime

WORKDIR /app

ENV NODE_ENV=production
ENV PORT=8080

COPY package.json ./
COPY scripts ./scripts
COPY --from=build /app/dist ./dist

EXPOSE 8080

CMD ["node", "scripts/start.js"]
