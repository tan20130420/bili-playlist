FROM node:20-alpine

WORKDIR /app
COPY package.json ./
COPY wbi.mjs ./
COPY index.mjs ./

ENV PORT=8080
EXPOSE 8080

HEALTHCHECK --interval=30s --timeout=5s --start-period=5s \
  CMD wget -qO- http://127.0.0.1:8080/health || exit 1

CMD ["node", "index.mjs"]
