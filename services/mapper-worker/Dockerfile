FROM node:22-bookworm-slim
WORKDIR /app
RUN apt-get update && apt-get install -y --no-install-recommends ca-certificates gdal-bin && rm -rf /var/lib/apt/lists/*
COPY services/mapper-worker/package*.json ./
RUN npm ci --omit=dev && npm install --no-save tsx@4.23.1 typescript@5.6.3
COPY services/mapper-worker/src ./src
COPY services/mapper-worker/tsconfig.json ./tsconfig.json
RUN mkdir -p /work
ENV NODE_ENV=production MAPPER_WORK_DIR=/work NODEODM_URL=http://nodeodm NODEODM_PORT=3000
CMD ["npm","start"]
