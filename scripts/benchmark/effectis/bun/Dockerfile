FROM oven/bun:1.2

WORKDIR /app

COPY . .

RUN bun install

RUN bunx tsup

EXPOSE 6379

CMD ["bun", "run", "dist/bin.cjs"]
