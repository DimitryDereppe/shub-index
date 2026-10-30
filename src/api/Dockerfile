# ---- Étape 1 : build (compile le TypeScript, a besoin des devDependencies) ----
FROM node:22-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Étape 2 : runtime (image finale allégée, sans devDependencies ni sources TS) ----
FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package*.json ./
RUN npm ci --omit=dev
COPY --from=build /app/dist ./dist

# l'image node fournit un utilisateur "node" sans privilèges : en cas de faille dans l'API,
# l'attaquant n'est pas root dans le conteneur (l'API n'écrit rien sur le disque)
USER node

EXPOSE 4000
CMD ["node", "dist/index.js"]
