# Rummicats has no dependencies, so the image is just Node and the game files.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json server.js bot.js persist.js ./
COPY public ./public
# Games in progress are saved here at the start of every turn and restored after a restart. Mount a named volume
# on /data (see README) to keep them across updates too. The folder belongs to node, so a new volume is writable.
RUN mkdir -p /data && chown node:node /data
ENV DATA_DIR=/data
USER node
EXPOSE 3000
# Optional: -e KAT_JOKE=1 (see README).
CMD ["node", "server.js"]
