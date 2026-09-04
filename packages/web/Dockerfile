# Qython web — build do React (Vite) e serve estático via nginx.
# Contexto de build é a RAIZ do monorepo, porque @qython/shared é um workspace.

FROM node:22-slim AS build

WORKDIR /repo

# Manifestos primeiro: a camada de dependências só invalida quando eles mudam.
COPY package.json package-lock.json turbo.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/

RUN npm ci

COPY packages/shared/ packages/shared/
COPY packages/web/ packages/web/

# O Vite lê VITE_* em tempo de BUILD, não de execução — daí virem como build args.
ARG VITE_API_URL=/api
ARG VITE_API_URL_FOR_STATIC_FILES=
ARG VITE_CLOUDFLARE_SITE_KEY=
ARG VITE_FIREBASE_API_KEY=
ARG VITE_FIREBASE_AUTH_DOMAIN=
ARG VITE_FIREBASE_PROJECT_ID=
ARG VITE_FIREBASE_STORAGE_BUCKET=
ARG VITE_FIREBASE_MESSAGING_SENDER_ID=
ARG VITE_FIREBASE_APP_ID=
ENV VITE_API_URL=$VITE_API_URL \
    VITE_API_URL_FOR_STATIC_FILES=$VITE_API_URL_FOR_STATIC_FILES \
    VITE_CLOUDFLARE_SITE_KEY=$VITE_CLOUDFLARE_SITE_KEY \
    VITE_FIREBASE_API_KEY=$VITE_FIREBASE_API_KEY \
    VITE_FIREBASE_AUTH_DOMAIN=$VITE_FIREBASE_AUTH_DOMAIN \
    VITE_FIREBASE_PROJECT_ID=$VITE_FIREBASE_PROJECT_ID \
    VITE_FIREBASE_STORAGE_BUCKET=$VITE_FIREBASE_STORAGE_BUCKET \
    VITE_FIREBASE_MESSAGING_SENDER_ID=$VITE_FIREBASE_MESSAGING_SENDER_ID \
    VITE_FIREBASE_APP_ID=$VITE_FIREBASE_APP_ID

RUN npm run build --workspace=packages/web


FROM nginx:alpine

COPY --from=build /repo/packages/web/build /usr/share/nginx/html
COPY docker/nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80
