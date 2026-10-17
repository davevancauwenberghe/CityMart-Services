FROM node:26-alpine AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src ./src
RUN npm run build

FROM node:26-alpine AS production
WORKDIR /app
RUN apk add --no-cache tini su-exec
ENV NODE_ENV=production PORT=8080 DATA_DIR=/data
COPY package*.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY --from=build /app/dist ./dist
COPY --chmod=755 docker-entrypoint.sh /usr/local/bin/citymart-entrypoint
EXPOSE 8080
HEALTHCHECK --interval=30s --timeout=5s --start-period=90s --retries=3 \
  CMD node -e 'fetch("http://127.0.0.1:"+(process.env.PORT||8080)+"/ready",{signal:AbortSignal.timeout(4000)}).then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))'
ENTRYPOINT ["/sbin/tini", "--", "/usr/local/bin/citymart-entrypoint"]
CMD ["node", "dist/main.js"]
