FROM node:20

WORKDIR /app

COPY . .

RUN npm install -g bun

RUN bun install

RUN bun run build

EXPOSE 6379

CMD ["bun", "start"]
