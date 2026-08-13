FROM node:22-alpine

WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY tracker.js ./
COPY src ./src

RUN mkdir -p /data && chown -R node:node /app /data
USER node

ENV STATE_FILE=/data/seenOrders.json
VOLUME ["/data"]

CMD ["npm", "start"]
