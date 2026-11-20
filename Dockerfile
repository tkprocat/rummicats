# Rummicats has no dependencies, so the image is just Node and the game files.
FROM node:24-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=3000
COPY package.json server.js bot.js ./
COPY public ./public
USER node
EXPOSE 3000
# Rooms live in memory: restarting the container ends every game in progress.
# Optional: -e KAT_JOKE=1 (see README).
CMD ["node", "server.js"]
