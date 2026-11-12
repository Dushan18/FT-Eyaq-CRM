# ft-crm: Next.js 16 (App Router + BFF). Imagen para Dokploy (o cualquier Docker).
# Build en dos etapas con `output: "standalone"`: la imagen final solo lleva server.js, los archivos
# que usa, .next/static y public; sin código fuente ni dependencias de desarrollo, y sin root.
# La configuración del servidor (CRM_BACKEND_URL, CRM_TRUST_PROXY...) llega por variables de entorno
# al arrancar; .env y .env.local no entran en la imagen.

FROM node:24-bookworm-slim AS build
WORKDIR /app
ENV NEXT_TELEMETRY_DISABLED=1
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
# Las NEXT_PUBLIC_* se fijan en el build (van en el JavaScript del navegador). Opcionales: sin ellas
# se usan los valores por defecto de src/lib/config.ts. En Dokploy van en "Build Args".
ARG NEXT_PUBLIC_INBOX_POLL_MS
ARG NEXT_PUBLIC_CHAT_POLL_MS
RUN npm run build

FROM node:24-bookworm-slim
WORKDIR /app
ENV NODE_ENV=production
ENV NEXT_TELEMETRY_DISABLED=1
ENV PORT=5173
ENV HOSTNAME=0.0.0.0
COPY --from=build --chown=node:node /app/.next/standalone ./
COPY --from=build --chown=node:node /app/.next/static ./.next/static
COPY --from=build --chown=node:node /app/public ./public
USER node
EXPOSE 5173
# /api/salud responde si el proceso vive (no consulta el backend; para eso está /api/listo).
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:'+(process.env.PORT||5173)+'/api/salud').then(r=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["node", "server.js"]
