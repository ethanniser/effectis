FROM node:20

WORKDIR /app

COPY . .

RUN npm install -g pnpm

RUN pnpm install


RUN pnpm build

EXPOSE 6789

CMD ["pnpm", "start"]
