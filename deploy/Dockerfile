FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
COPY tsconfig.base.json ./
COPY apps/api/package.json apps/api/package.json
COPY apps/web/package.json apps/web/package.json
COPY apps/worker/package.json apps/worker/package.json
COPY packages/db/package.json packages/db/package.json

RUN npm ci

COPY apps ./apps
COPY packages ./packages

RUN npm run build

ENV NODE_ENV=production

CMD ["node", "apps/api/dist/index.js"]
