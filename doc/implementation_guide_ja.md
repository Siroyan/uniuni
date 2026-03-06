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
