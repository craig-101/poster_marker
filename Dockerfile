# DAS 2026 Poster Scorer. No npm dependencies, so no install step.
# Render: add a Disk mounted at /var/data so scores survive restarts.
FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production \
    DATA_DIR=/var/data \
    PORT=3000
COPY package.json server.js index.html ./
EXPOSE 3000
CMD ["node", "server.js"]
