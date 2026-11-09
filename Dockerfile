
FROM node:24-bookworm-slim

WORKDIR /app

COPY package*.json ./

RUN npm ci

COPY . .

ENV NODE_ENV=production
ENV PORT=5173
ENV HOSTNAME=0.0.0.0

RUN npm run build

EXPOSE 5173

CMD ["npm", "run", "start"]
