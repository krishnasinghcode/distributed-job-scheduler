FROM node:20-slim
RUN apt-get update -y && apt-get install -y openssl ca-certificates && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package.json ./
COPY packages/shared ./packages/shared
COPY services/api ./services/api
COPY services/worker ./services/worker
COPY services/scheduler ./services/scheduler
RUN npm install --workspaces --if-present --include-workspace-root
WORKDIR /app/packages/shared
RUN npx prisma generate
RUN npm run build
WORKDIR /app/services/worker
RUN npm run build
WORKDIR /app/services/scheduler
RUN npm run build
WORKDIR /app/services/api
EXPOSE 4000
CMD ["npm", "run", "dev"]
