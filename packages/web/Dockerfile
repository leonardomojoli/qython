# Qython web — build do React (Vite) e serve estático via nginx.
# Contexto de build é a RAIZ do monorepo, porque @qython/shared é um workspace.

FROM node:22-slim AS build

WORKDIR /repo

# Manifestos primeiro: a camada de dependências só invalida quando eles mudam.
# Os TRÊS workspaces precisam estar presentes — a raiz declara "packages/*" e o
# npm valida o lockfile contra o conjunto inteiro; faltando um, o ci recusa por
# dessincronia. Só o manifesto do mobile entra, nunca o código dele.
COPY package.json package-lock.json turbo.json ./
COPY packages/web/package.json packages/web/
COPY packages/shared/package.json packages/shared/
COPY packages/mobile/package.json packages/mobile/

# Instala a árvore inteira do lockfile, incluindo as dependências do mobile que
# esta imagem não usa. Passar --workspace aqui NÃO poda nada: o npm ci monta o
# lockfile todo de qualquer forma (verificado). É o preço de um único lockfile
# na raiz, e a razão de esta etapa levar alguns minutos.
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
