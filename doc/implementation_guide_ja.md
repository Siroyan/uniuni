# uniuni 実装ガイド（日本語）

このドキュメントは、`uniuni` の現時点（MVP初期段階）の実装構造を、OSS コントリビューター向けに説明するものです。

## 1. プロジェクトの目的

`uniuni` は、ユニバーサル基板向けの配線設計をブラウザで行う CAD を目指しています。
現在は以下を優先しています。

- ブラウザで動く編集体験の土台
- 盤面座標系（screen/world/grid）の確立
- Rust コアによるドメインモデルとコマンド適用の骨組み

設計方針の元資料は [impl_brief.md](./impl_brief.md) を参照してください。

## 2. 現在の実装到達点

実装済み:

- `web`（React + TypeScript + Canvas 2D）
- `core`（Rust + wasm-bindgen）
- 盤面グリッド描画
- pan / zoom / snap の基本操作
- コマンド適用の最小実装（`CommitWire`, `AssignNetName`）
- 配線ルール検証（1グリッドの Manhattan 制約）
- 最小 DRC（異なるネットの同一点共有 = SHORT）

未実装（これから）:

- 部品配置・回転
- Undo/Redo
- IndexedDB 永続化
- Rust WASM と Web UI の実接続

## 3. ディレクトリ構成

```text
uniuni/
├─ web/                 # フロントエンド
│  ├─ src/
│  │  ├─ App.tsx
│  │  ├─ BoardCanvas.tsx
│  │  ├─ coords.ts
│  │  └─ types.ts
│  └─ package.json
├─ core/                # Rust コア
│  ├─ src/
│  │  ├─ lib.rs
│  │  └─ model.rs
│  └─ Cargo.toml
└─ doc/
   ├─ impl_brief.md
   ├─ progress.md
   └─ implementation_guide_ja.md
```

## 4. レイヤ構造と責務

### 4.1 `web` レイヤ（UI / 入力 / 描画）

- 役割:
  - ユーザー入力（ポインタ、ホイール）を受ける
  - Viewport（pan/zoom）を更新する
  - Canvas に描画する
- 代表実装:
  - [BoardCanvas.tsx](../web/src/BoardCanvas.tsx)

### 4.2 `core` レイヤ（状態 / ルール / コマンド）

- 役割:
  - プロジェクト状態の定義
  - コマンド適用とバリデーション
  - DRC 判定
- 代表実装:
  - [model.rs](../core/src/model.rs)

### 4.3 WASM ブリッジ（Web ↔ Rust）

- 役割:
  - JSON 文字列で状態とコマンドを受け渡す
- 公開関数:
  - `create_empty_project_json`
  - `apply_command_json`
  - `drc_json`
- 実装:
  - [lib.rs](../core/src/lib.rs)

## 5. 現在のデータフロー

現時点の意図的に単純なデータフローは以下です。

1. UI が入力を受ける
2. `web/src/coords.ts` で座標変換を行う
3. `BoardCanvas` が画面描画（グリッド・ボード境界・スナップ点）
4. 将来的に UI イベントを `Command` に変換して `core` に渡す
5. `core` が状態更新と DRC を実施し、結果を UI に返す

重要な点:

- 「編集ルールの真実」は `core` に寄せる設計です
- `web` は入力処理と可視化を担当します

## 6. 主要モジュール解説

### 6.1 座標変換（`web/src/coords.ts`）

- `screenToWorld`: ピクセル座標 → ワールド座標
- `worldToScreen`: ワールド座標 → ピクセル座標
- `worldToGrid`: ワールド座標 → グリッド点（四捨五入スナップ）
- `gridToWorld`: グリッド点 → ワールド座標
- `clampZoom`: ズーム範囲制限（`0.2`〜`4.0`）

### 6.2 Canvas 描画と操作（`web/src/BoardCanvas.tsx`）

- 2つの `useEffect` に責務分離:
  - 描画 effect
  - 入力イベント登録 effect
- 操作仕様:
  - pan: 中クリック / 右クリックドラッグ
  - zoom: ホイール（カーソル位置アンカー）
  - hover: 最寄りグリッド点を HUD 表示

### 6.3 ドメインモデル（`core/src/model.rs`）

- 主要型:
  - `ProjectState`
  - `Board`, `GridPt`, `Wire`, `Net`, `PartDef`, `PartInst`
- コマンド:
  - `CommitWire`
  - `AssignNetName`
- バリデーション:
  - `validate_wire_path` が Manhattan + 1ステップ制約を検証
- DRC:
  - `run_drc` が同一点の複数ネットを SHORT として検出

## 7. 開発・ビルド手順

### 7.1 Web

```bash
cd <repo-root>
npm install
npm run dev -w web
npm run build -w web
```

### 7.2 Rust Core

```bash
cd <repo-root>/core
cargo check
cargo build
```

## 8. 変更を入れるときの指針

### 8.1 新機能を追加する順序（推奨）

1. `core` 側に型・コマンド・検証ロジックを追加
2. WASM 公開関数で JSON 入出力を確認
3. `web` 側で UI イベントをコマンド化して接続
4. 表示（Canvas）を更新

### 8.2 コントリビューション時の観点

- 状態遷移は `core` 中心に保てているか
- 座標変換を `coords.ts` で一元化できているか
- DRC ルールが将来拡張しやすい関数分割になっているか
- UI が将来のレイヤ描画（部品/配線/ハイライト）に拡張可能か

## 9. 直近の実装候補（Issue化しやすい単位）

- `PartInst` の配置・移動・回転コマンド追加
- `CommitWire` の既存ワイヤとのマージ/重複処理
- `run_drc` に部品占有衝突と未接続ピン警告を追加
- Undo/Redo のためのコマンドログ構造導入
- `web` と `core`（WASM）を実配線

## 10. 参考ドキュメント

- 要件と設計方針: [impl_brief.md](./impl_brief.md)
- 進捗ログ: [progress.md](./progress.md)
- 起動方法: [README.md](../README.md)

## 11. 基本機能完成までの3Step提案

以下は「ユニバーサル基板CADとして最低限使える状態」までの実装を、3段階で進める提案です。

### Step 1: 部品配置と編集の基盤を完成させる

目的:

- 部品を配置・移動・回転できる状態を作る
- 配線前提となる盤面占有ルールを確立する

実装仕様:

- `core`:
  - `AddPartInst`, `MovePartInst`, `RotatePartInst`, `DeleteSelection` を追加
  - `PartDef.occupied` と `PartInst` から占有マップ（`occ_part_hard`）を再計算する関数を追加
  - 部品配置時にボード外配置と部品同士の重なりを検証
- `web`:
  - 部品選択・配置モードを追加
  - 選択中部品のプレビュー表示（スナップ追従）
  - 回転操作（例: `R` キー）と移動ドラッグを実装

完了条件:

- 画面上で部品の追加/移動/回転/削除ができる
- 重なり配置や盤面外配置が禁止される
- 状態変更はすべて `Command` 経由で反映される

### Step 2: 手動配線とネット編集を完成させる

目的:

- 基板設計に必要な最小の配線作業を成立させる
- ネット情報を編集し、配線との整合を取る

実装仕様:

- `core`:
  - `CommitWire` を中心に wire 追加/削除コマンドを整理
  - `AssignPinToNet`, `AssignNetName` をUIから使える形で拡張
  - 配線の制約（Manhattan・1ステップ・最小長）を引き続き厳格に検証
- `web`:
  - 配線ツール（クリックで1ステップずつ経路を確定）を実装
  - 配線プレビューをCanvasで表示し、確定時に `CommitWire` を送る
  - ネット名編集UIとピンへのネット割当UIを追加

完了条件:

- 手動でネット付き配線を作成・削除できる
- ピンへのネット割当とネット名編集ができる
- 不正配線は `core` 側で拒否され、UIにエラー表示される

### Step 3: DRC/UndoRedo/保存で「日常利用可能」へ仕上げる

目的:

- 設計の安全性と反復編集の操作性を確保する
- 作業内容を保存・再開できる状態にする

実装仕様:

- `core`:
  - DRC を拡張（部品衝突、wire vs part、SHORT、未接続ピン警告）
  - Undo/Redo のためのコマンドログを導入
- `web`:
  - DRC 結果パネル（Error/Warning一覧 + 該当座標ハイライト）を追加
  - Undo/Redo 操作（ショートカット含む）を接続
  - IndexedDB 保存/読込（プロジェクトJSON）を実装
  - 可能なら JSON Export/Import の最小版を実装

完了条件:

- DRC 実行で主要エラー/警告が確認できる
- Undo/Redo が主要操作（部品編集・配線編集）で機能する
- 保存→再読込で状態が復元される
