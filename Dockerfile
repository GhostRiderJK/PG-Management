# ---- build the React app ----
FROM node:20-alpine AS web
WORKDIR /app/frontend
COPY frontend/package*.json ./
RUN npm ci
COPY frontend/ ./
RUN npm run build

# ---- run the API (it also serves the built frontend) ----
FROM node:20-alpine
WORKDIR /app
ENV NODE_ENV=production
RUN apk add --no-cache ca-certificates wget \
  && wget -q https://truststore.pki.rds.amazonaws.com/global/global-bundle.pem \
     -O /etc/ssl/certs/rds-global-bundle.pem \
  && chmod 644 /etc/ssl/certs/rds-global-bundle.pem
ENV DB_SSL_CA=/etc/ssl/certs/rds-global-bundle.pem
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY backend/ backend/
COPY --from=web /app/frontend/dist frontend/dist
USER node
EXPOSE 5000
CMD ["node", "backend/src/server.js"]
