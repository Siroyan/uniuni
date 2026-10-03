# uniuni

Browser-based universal perfboard CAD (MVP bootstrap).

## Current Status
- Implemented architecture split:
  - `web`: React + TypeScript + Canvas 2D
  - `core`: Rust domain model + command application + DRC + wasm-bindgen bridge
- Implemented up to MVP Step 7 baseline:
  - part placement/move/rotate/delete
  - manual one-step Manhattan wiring + wire delete
  - net rename + pin-to-net assignment
  - DRC run and issue display
  - undo/redo (snapshot history)
  - IndexedDB autosave + JSON export/import
  - Part editor (pin / occupied / image)
  - Part library persistence in IndexedDB (PartDef + image assets)
  - ZIP export/import (`project.json` + `part-library.json` + `assets/*`)
  - WASM/fallback bridge mode detection + visibility
  - Hit-test priority (`pin -> wire -> occupied`) + Tab candidate cycle

## Dev Container でローカル実行

Docker Desktop（Linux では Docker Engine）、VS Code、Dev Containers 拡張機能を用意する。

1. このリポジトリをローカルに clone し、VS Code でフォルダーを開く。
2. コマンドパレットから **Dev Containers: Reopen in Container** を実行する。初回は Node 22、Rust、WASM ターゲット、`wasm-bindgen-cli` 0.2.114 のイメージを作成し、`npm ci` を実行するため時間がかかる。
3. コンテナー内のターミナルで次を実行する。

```bash
npm run dev -w web -- --host 0.0.0.0
```

4. VS Code の **ポート** タブで転送された `5173` をブラウザーで開く（通常は `http://localhost:5173`）。画面に `Core: WASM` と表示されれば起動できている。

コンテナー内で `npm run build -w web` と `cd core && cargo check` も実行できる。設計データは開いたブラウザーの IndexedDB に保存される。

## Local Run
1. Install dependencies (root workspace):
```bash
npm install
```

Web 開発・ビルドには Rust、`wasm32-unknown-unknown` ターゲット、
`wasm-bindgen-cli` 0.2.114 が必要です。初回のみ次を実行してください。
```bash
rustup target add wasm32-unknown-unknown
cargo install --locked wasm-bindgen-cli --version 0.2.114
```

`npm run dev -w web` と `npm run build -w web` は Rust Core の WASM を自動生成します。

2. Start the web app (Vite dev server):
```bash
npm run dev -w web
```

3. Open:
`http://localhost:5173`

## Build
Web production build:
```bash
npm run build -w web
```

Web E2E test (Playwright):
```bash
npm run e2e:install -w web
npm run test:e2e -w web
```

Rust core build/check:
```bash
cd core
cargo check
cargo build
```

## GitHub Pages で公開

1. GitHub のリポジトリ設定で **Pages → Build and deployment → Source: GitHub Actions** を選ぶ。
2. レビュー済みの変更を `main` にマージする。`.github/workflows/ci.yml` が Web・Rust・E2E を検証し、全件成功後に `web/dist` を Pages へデプロイする。
3. `https://siroyan.github.io/uniuni/` を開き、画面の `Core: WASM` 表示を確認する。Pages の URL は Actions の `deploy GitHub Pages` ジョブにも表示される。

Pages 向けビルドはリポジトリ名から `/uniuni/` を設定する。ローカルで同じ構成を確認するには次を実行する。

```bash
PAGES_BASE_PATH=/uniuni/ npm run build -w web
PAGES_BASE_PATH=/uniuni/ npm run preview -w web -- --host 127.0.0.1
```

プロジェクト、部品ライブラリ、画像はブラウザーの IndexedDB に保存される。ZIP の作成と読み込みもブラウザー内で行い、これらの内容をサーバーへ送信する機能はない。ページの Content Security Policy は外部への接続を許可しない。端末間同期はないため、必要なデータは ZIP でバックアップする。

## Notes
- 仕様は `doc/specification_ja.md` を参照。
- MVP Step1-7 roadmap is complete; next phase candidates are tracked in `doc/implementation_guide_ja.md`.
- CI（unit/build/core/e2e）は `.github/workflows/ci.yml` を参照。
