# ---- Étape 1 : build (compile le TypeScript et regroupe le client avec Vite) ----
FROM node:24-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

# ---- Étape 2 : runtime (Nginx sert les fichiers statiques, sans Node ni sources) ----
FROM nginx:stable-alpine AS runtime
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
EXPOSE 80
