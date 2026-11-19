# Антология игр — прод-образ
FROM node:22-alpine

ENV NODE_ENV=production
WORKDIR /app

# Зависимости отдельным слоем: пересобираются только при изменении package*.json
COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY . .

EXPOSE 3000

HEALTHCHECK --interval=30s --timeout=5s --start-period=10s --retries=3 \
  CMD wget -q --spider http://127.0.0.1:3000/api/games || exit 1

CMD ["node", "api/server.js"]
