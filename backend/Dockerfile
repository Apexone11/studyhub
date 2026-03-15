FROM node:20-bookworm-slim

WORKDIR /app

ENV NODE_ENV=production

RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/*

COPY package*.json ./
RUN npm ci

COPY prisma ./prisma
RUN npx prisma generate

COPY scripts ./scripts
COPY src ./src

EXPOSE 4000

CMD ["npm", "start"]
