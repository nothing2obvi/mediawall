FROM node:22-alpine AS deps
WORKDIR /app
COPY package.json package-lock.json* ./
RUN npm install

FROM deps AS build
WORKDIR /app
COPY . .
RUN npm run build

FROM node:22-alpine AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY package.json package-lock.json* ./
RUN npm install --omit=dev
COPY --from=build /app/dist ./dist
COPY --from=build /app/public ./public
COPY --from=build /app/src/logos ./dist/public/logos
COPY --from=build /app/app/sounds ./sounds
COPY --from=build /app/app/custom_logo ./custom_logo
COPY config.yml ./config.yml
RUN mkdir -p /app/data /app/custom_logo
EXPOSE 1221
CMD ["node", "dist/server/index.js"]
