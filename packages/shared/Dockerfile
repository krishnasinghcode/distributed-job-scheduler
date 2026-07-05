FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY packages/shared ./packages/shared
COPY services ./services
COPY web/package.json ./web/package.json
RUN npm install --workspaces --if-present --include-workspace-root
WORKDIR /app/packages/shared
RUN npx prisma generate
CMD ["sh", "-c", "npx prisma db push --accept-data-loss && npx ts-node src/seed.ts"]
