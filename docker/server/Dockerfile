# =============================================================================
# Stage 1: Build
# =============================================================================
FROM node:20-alpine AS builder

WORKDIR /app

# Copy dependency files first for better layer caching
COPY package.json package-lock.json ./

# Install all dependencies (including devDependencies for build)
RUN npm ci

# Copy source code and config files needed for build
COPY tsconfig.json tsconfig.server.json ./
COPY src/server/ src/server/
COPY src/shared/ src/shared/

# Build TypeScript server
RUN npx tsc -p tsconfig.server.json

# =============================================================================
# Stage 2: Production
# =============================================================================
FROM node:20-alpine AS production

WORKDIR /app

# Add non-root user for security
RUN addgroup -S appgroup && adduser -S appuser -G appgroup

# Create data directory for map uploads
RUN mkdir -p /app/data/maps && chown -R appuser:appgroup /app/data

# Copy dependency files
COPY package.json package-lock.json ./

# Install only production dependencies
RUN npm ci --omit=dev && npm cache clean --force

# Copy compiled output from builder
COPY --from=builder /app/dist/server ./dist/server

# Copy config files if needed at runtime
COPY config/ ./config/

# Switch to non-root user
USER appuser

# Expose Colyseus server port
EXPOSE 2567

# Health check
HEALTHCHECK --interval=30s --timeout=10s --start-period=10s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost:2567/health || exit 1

# Start the server
CMD ["node", "dist/server/server/index.js"]
