FROM node:20

WORKDIR /app

COPY . .

RUN npm install -g bun

RUN bun install

RUN bunx tsup

EXPOSE 6379

CMD ["node", "dist/bin.cjs"]
