# AGENTS.md

このファイルは、`uniuni` リポジトリで作業するエージェント向けのプロジェクト固有ルールです。

## 1. 基本方針

- `doc/impl_brief.md` を実装方針の一次情報とする
- MVP は「まず動く骨組み」を優先し、段階的に拡張する
- 編集ルール・整合性チェックは `core`（Rust）側に寄せる
- `web`（TypeScript/React）は入力処理と可視化に集中する

## 2. 現在のソフトウェア構造

```text
uniuni/
├─ web/                 # React + TypeScript + Canvas 2D
│  └─ src/
│     ├─ App.tsx
│     ├─ BoardCanvas.tsx
│     ├─ coords.ts
│     └─ types.ts
├─ core/                # Rust domain core + wasm-bindgen bridge
│  └─ src/
│     ├─ model.rs
│     └─ lib.rs
└─ doc/
   ├─ impl_brief.md
   ├─ implementation_guide_ja.md
   └─ progress.md
```

## 3. レイヤ責務

- `web`:
  - Canvas 描画
  - pan / zoom / snap などの UI インタラクション
  - 将来的に UI イベントを Command に変換
- `core`:
  - `ProjectState` と各種ドメイン型を定義
  - Command 適用（現状: `CommitWire`, `AssignNetName`）
  - バリデーション（配線 Manhattan 1ステップ制約）
  - DRC（現状: SHORT 検出）
- `core/src/lib.rs`:
  - wasm-bindgen で JSON API を公開
  - `create_empty_project_json`, `apply_command_json`, `drc_json`

## 4. 実装済み範囲（2026-03-07時点）

- Web 基盤（Vite + React + TypeScript）
- グリッド描画、ボード境界描画
- pan（中/右ドラッグ）、zoom（ホイール）、snap表示
- Rust コアの最小モデルとコマンド適用
- 最小 DRC（異なるネットの同一点共有）

## 5. 未実装の主要項目

- 部品配置・移動・回転
- Undo/Redo
- IndexedDB 永続化
- `web` と `core`（WASM）の実接続

## 6. 作業ルール（このリポジトリ）

- 変更前に関連ドキュメント（`doc/impl_brief.md` など）を確認する
- 仕様追加時は、可能な限り `core` に型・検証・コマンドを先に追加する
- `web/src/coords.ts` を座標変換の単一責務モジュールとして維持する
- 新規実装後は最低限のビルド確認を行う
  - `npm run build -w web`
  - `cd core && cargo check`（必要なら `cargo build`）
- 進捗・構造変更があれば `doc/` の関連文書を更新する

## 7. Git と成果物管理

- 以下の生成物は Git 管理しない
  - `node_modules/`
  - `web/dist/`
  - `core/target/`
  - `core/pkg/`
- 生成物が追跡対象に入っていないか、必要に応じて `git status --ignored` で確認する

## 8. 起動・検証コマンド

- Web 開発起動:
  - `npm install`
  - `npm run dev -w web`
  - ブラウザ: `http://localhost:5173`
- Web ビルド:
  - `npm run build -w web`
- Rust ビルド:
  - `cd core && cargo check && cargo build`

## 9. 参照ドキュメント

- 方針: `doc/impl_brief.md`
- 実装ガイド: `doc/implementation_guide_ja.md`
- 進捗: `doc/progress.md`
- 利用方法: `README.md`

## 10. Git関連ルール

- 機能実装/修正時は、`gh` コマンドを使って GitHub のプルリクエストを作成すること
- プルリクエストには、変更内容のサマリーと実装内容が分かる詳細を記載すること
- プルリクエストのレビュアーには `Siroyan` を設定すること
- 機能実装/修正時は、必ず `dev` ブランチから派生した feature ブランチを作成し、そのブランチで作業すること
- GitHub を利用したモダンな開発フロー（ブランチ運用、PR ベース開発、レビュー前提）に則ること
- `main` および `dev` へのマージは、必ず `Siroyan` のレビュー承認後に実施されるよう運用すること
- 機能実装/修正に着手する前に、必ず Draft PR を作成し、実装予定内容（目的・変更対象・完了条件）を記載すること
- 実装作業は Draft PR 作成後に開始し、進捗に応じて PR 本文を更新すること
