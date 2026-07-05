FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/scheduler ./services/scheduler
RUN npm install --workspaces --if-present --include-workspace-root
WORKDIR /app/packages/shared
RUN npx prisma generate
RUN npm run build
WORKDIR /app/services/scheduler
CMD ["npm", "run", "dev"]
