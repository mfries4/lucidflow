# syntax=docker/dockerfile:1

# ---------- Étape 1 : construction du client React ----------
FROM node:24-alpine AS client
WORKDIR /app
COPY client/package.json client/package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY client/ ./
RUN npm run build

# ---------- Étape 2 : image d'exécution ----------
FROM node:24-alpine
ENV NODE_ENV=production \
    PORT=8080 \
    DATA_DIR=/data
WORKDIR /app

# Le serveur n'a aucune dépendance npm : SQLite vient du module natif `node:sqlite`.
COPY server/package.json ./package.json
COPY server/src ./src
COPY --from=client /app/dist ./public

RUN mkdir -p /data && chown -R node:node /data /app
USER node
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=4s --start-period=5s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:8080/api/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"

CMD ["node", "--disable-warning=ExperimentalWarning", "src/index.js"]
