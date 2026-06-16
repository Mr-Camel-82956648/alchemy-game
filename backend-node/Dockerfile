FROM node:22-alpine

WORKDIR /app

COPY backend-node ./backend-node
COPY frontend ./frontend
COPY alchemy_intro_book ./alchemy_intro_book
COPY index.html ./index.html

WORKDIR /app/backend-node

ENV HOST=0.0.0.0
ENV PORT=18001
ENV ALCHEMY_SERVE_STATIC=1
ENV FORGE_REQUIRE_AI_AUTH=true

EXPOSE 18001

CMD ["npm", "start"]
