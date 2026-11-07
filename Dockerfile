FROM node:24.22.2-bookworm-slim
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts --no-audit --no-fund
COPY --chown=node:node server ./server
COPY --chown=node:node scripts ./scripts
COPY --chown=node:node shared ./shared
COPY --chown=node:node src ./src
COPY --chown=node:node styles ./styles
COPY --chown=node:node assets ./assets
COPY --chown=node:node index.html sw.js manifest.json version.json ./
COPY --chown=node:node *.png ./
RUN npm run build -- --reuse-version && chown -R node:node /app/public
RUN mkdir -p /app/var && chown node:node /app/var
ENV NODE_ENV=production HOST=0.0.0.0 PORT=3000 DATABASE_PATH=/app/var/deckhand.sqlite DATA_DIR=/app/var/data-sample
USER node
EXPOSE 3000
CMD ["node", "server/index.mjs"]
