FROM oven/bun:1.2

WORKDIR /app

COPY . .

RUN bun install --frozen-lockfile

RUN bun run build

EXPOSE 6379

CMD ["bun", "run", "dist/bin.cjs"]
