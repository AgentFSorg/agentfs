FROM node:22-slim
RUN corepack enable && corepack prepare pnpm@9.0.0 --activate
WORKDIR /app

# Copy workspace config
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml tsconfig.base.json ./

# Copy all package manifests
COPY packages/api/package.json packages/api/
COPY packages/shared/package.json packages/shared/
COPY packages/sdk/package.json packages/sdk/

# Install all deps
RUN pnpm install --frozen-lockfile

# Copy source
COPY packages/api/ packages/api/
COPY packages/shared/ packages/shared/
COPY packages/sdk/ packages/sdk/

# Build
RUN pnpm --filter @agentos/shared build && \
    pnpm --filter @agentos/sdk build && \
    pnpm --filter @agentos/api build

ENV NODE_ENV=production
ENV PORT=8080
EXPOSE 8080

CMD ["node", "--import", "tsx/esm", "packages/api/src/index.ts"]
