FROM node:20-slim AS base
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*
COPY package.json ./
COPY prisma ./prisma
RUN npm install --no-audit --no-fund

FROM base AS dev
ENV NODE_ENV=development
COPY . .
EXPOSE 4000
CMD ["npm", "run", "dev"]

FROM base AS prod
ENV NODE_ENV=production
COPY . .
RUN mkdir -p /app/uploads
EXPOSE 4000
CMD ["./entrypoint.sh"]
