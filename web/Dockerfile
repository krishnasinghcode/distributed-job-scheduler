FROM node:20-alpine AS build
WORKDIR /app
COPY package.json ./
COPY web ./web
RUN npm install --workspaces --if-present --include-workspace-root || (cd web && npm install)
WORKDIR /app/web
ARG VITE_API_URL=http://localhost:4000
ENV VITE_API_URL=$VITE_API_URL
RUN npm run build

FROM nginx:alpine
COPY --from=build /app/web/dist /usr/share/nginx/html
COPY web/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
