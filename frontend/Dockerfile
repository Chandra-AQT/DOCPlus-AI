# Stage 1: Build React app
FROM node:20-alpine AS builder

WORKDIR /app

# Declare build-time arg so Railway injects VITE_API_URL during docker build
ARG VITE_API_URL
ENV VITE_API_URL=$VITE_API_URL

# Copy package files and install
COPY package*.json ./
RUN npm ci

# Copy source
COPY . .

# Build — VITE_API_URL is baked in here
RUN npm run build

# Stage 2: Serve with Nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html
COPY nginx.conf /etc/nginx/templates/default.conf.template

EXPOSE $PORT

CMD ["/bin/sh", "-c", "envsubst '$PORT' < /etc/nginx/templates/default.conf.template > /etc/nginx/conf.d/default.conf && nginx -g 'daemon off;'"]
