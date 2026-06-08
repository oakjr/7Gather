# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for Vite build)
RUN npm ci

# Copy source code and config files needed for build
COPY tsconfig.json vite.config.ts index.html ./
COPY src/ src/
COPY config/ config/

# Build client with Vite
RUN npm run build:client

# =============================================================================
# Stage 2: Serve with Nginx
# =============================================================================
FROM nginx:alpine AS production

# Remove default nginx config
RUN rm /etc/nginx/conf.d/default.conf

# Add custom nginx config for SPA routing
COPY docker/client/nginx.conf /etc/nginx/conf.d/default.conf

# Copy built assets from builder stage
COPY --from=builder /app/dist/client /usr/share/nginx/html

# Expose HTTP port
EXPOSE 80

# Nginx runs as root by default to bind to port 80,
# but worker processes run as nginx user (configured in nginx.conf)
HEALTHCHECK --interval=30s --timeout=5s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:80/ || exit 1

CMD ["nginx", "-g", "daemon off;"]
