# Little Rotors (/) and Little Defenders (/defense/) in one container.
FROM node:24-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
COPY packages/house/package.json packages/house/
COPY apps/toy-flight/package.json apps/toy-flight/
COPY apps/tower-defense/package.json apps/tower-defense/
RUN npm ci
COPY . .
RUN npm run build && npm prune --omit=dev

FROM node:24-alpine
ENV NODE_ENV=production PORT=2567
WORKDIR /app
COPY --from=build /app/node_modules ./node_modules
COPY --from=build /app/apps/toy-flight/dist ./dist
USER node
EXPOSE 2567
HEALTHCHECK --interval=30s --timeout=3s CMD node -e "fetch('http://localhost:' + process.env.PORT + '/health').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "dist/server/index.js"]
