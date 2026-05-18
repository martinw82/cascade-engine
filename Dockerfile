FROM oven/bun:1 AS base
WORKDIR /app

# Install dependencies
COPY package.json bun.lock ./
RUN bun install --frozen-lockfile

# Copy source
COPY . .

# Build Next.js UI
RUN bun run build

# Expose ports
EXPOSE 3000 3001

# Start both servers
CMD ["sh", "-c", "bun run server & sleep 2 && HOST=0.0.0.0 bun dev"]
