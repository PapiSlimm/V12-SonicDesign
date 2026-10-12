# V12 media service — worker + browser ingress. ffmpeg with libx264 / libsvtav1 / libopus / aac / lame.
FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --no-audit --no-fund
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:22-alpine
RUN apk add --no-cache ffmpeg unzip
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install --omit=dev --no-audit --no-fund
COPY --from=build /app/dist ./dist
COPY sql ./sql
ENV NODE_ENV=production PORT=10000 MAX_JOBS=2 MEDIA_ROLE=all MEDIA_LOCAL_DIR=/data/media
VOLUME ["/data/media"]
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:10000/health || exit 1
CMD ["node", "dist/bin/service.js"]
