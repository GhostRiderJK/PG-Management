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
COPY backend/package*.json backend/
RUN cd backend && npm ci --omit=dev
COPY backend/ backend/
COPY --from=web /app/frontend/dist frontend/dist
USER node
EXPOSE 5000
CMD ["node", "backend/src/server.js"]
