# Builder container
FROM node:14-slim AS builder
WORKDIR /opt/app

COPY package.json package-lock.json ./
RUN npm install

COPY . .
RUN npx tsc


# Build prod container
FROM node:14-slim
ENV NODE_ENV=production
ENV TZ="Europe/Helsinki"
WORKDIR /opt/app

RUN apt update && apt install -y libgrib-api-tools && rm -rf /var/lib/apt/lists/*

COPY package.json package-lock.json marine-observation-stations.json ./
RUN npm install

COPY --from=builder /opt/app/built ./built

RUN mkdir -p /opt/app/gribs && chown node /opt/app/gribs

CMD ["node", "./built/App.js"]

USER node

EXPOSE 8000/tcp