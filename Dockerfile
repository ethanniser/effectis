FROM node:20

WORKDIR /app

COPY . .

RUN npm install -g bun

RUN bun install

RUN bun run build

EXPOSE 6789

CMD ["bun", "start"]
