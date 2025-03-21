start: build
    bun run dist/bin.cjs

build:
    bunx tsup

clean:
    rm -rf dist

check:
    tsc -b tsconfig.json

fmt: 
    prettier --write \"**/*.{ts,mjs}\"

fmt-check: 
    prettier --check .

test:
    bun vitest run

benchmark:
    bun run scripts/benchmark.ts
