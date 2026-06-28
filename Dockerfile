# Tada Web — local e2e harness image (dev mode).
# Runs `next dev` for fast local iteration — this image is for LOCAL e2e only,
# never the production deploy.
FROM node:22-bookworm-slim

WORKDIR /app

# Prisma needs openssl at runtime.
RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

# Install deps first (postinstall runs `prisma generate`, so schema must be present).
COPY package.json package-lock.json ./
COPY prisma ./prisma
RUN npm ci

# App source.
COPY . .

EXPOSE 3000
ENTRYPOINT ["./docker/entrypoint.sh"]
