FROM node:22-alpine
RUN apk add --no-cache ffmpeg unzip
WORKDIR /app
COPY package.json ./
RUN npm install --omit=dev --no-audit --no-fund
COPY server.js ./
ENV NODE_ENV=production PORT=10000 MAX_JOBS=2
EXPOSE 10000
HEALTHCHECK --interval=30s --timeout=5s CMD wget -qO- http://127.0.0.1:10000/health || exit 1
CMD ["node", "server.js"]
