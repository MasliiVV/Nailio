# Multi-stage build
FROM node:20-alpine AS base
WORKDIR /app
COPY package*.json ./
COPY prisma ./prisma/

FROM base AS dependencies
RUN apk add --no-cache openssl1.1-compat
RUN npm ci --omit=dev
RUN npx prisma generate

FROM base AS build
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS production
RUN apk add --no-cache openssl
WORKDIR /app
COPY --from=dependencies /app/node_modules ./node_modules
COPY --from=build /app/dist ./dist
COPY --from=dependencies /app/prisma ./prisma
COPY package*.json ./

USER node
EXPOSE 3000
CMD ["node", "dist/main.js"]
