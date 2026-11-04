# Etapa 1: Compilación de Angular
FROM node:22-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build -- --configuration production

# Etapa 2: Servir con Nginx
FROM nginx:alpine
# Copiar configuración personalizada de Nginx
ENV PORT=80
ENV BACKEND_ORIGIN=https://fashionstore-si2-exam.cloud.run
ENV NGINX_ENVSUBST_FILTER="^(PORT|BACKEND_ORIGIN)$"
COPY nginx.conf /etc/nginx/templates/default.conf.template
# Copiar archivos compilados de Angular
COPY --from=builder /app/dist/fashionstore-web/browser /usr/share/nginx/html

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
