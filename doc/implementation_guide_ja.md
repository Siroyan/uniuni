# uniuni 実装ガイド（日本語）

最終更新日: 2026-03-12
対象バージョン: MVP Step1〜Step7 完了時点

## 1. この文書の位置づけ
この文書は `uniuni` の実装構造と実装上の判断基準を共有するためのガイドである。

- 仕様そのもの（機能要件・操作仕様）は [specification_ja.md](./specification_ja.md) を参照
- 作業履歴は [progress.md](./progress.md) を参照

本書は「どう実装されているか」「どこを編集すべきか」に焦点を当てる。

## 2. 現在の到達点
MVP Step1〜Step7 は完了している。

実装済みの主要機能:
- 部品配置/移動/回転/削除
- 手動配線（1ステップ Manhattan）と配線削除
- Net 追加/改名、Pin への Net 割当
- DRC（`PART_COLLISION`, `WIRE_PART_COLLISION`, `SHORT`, `UNCONNECTED_PIN`）
- Undo/Redo（履歴スナップショット）
- IndexedDB 自動保存/復元
- Part Editor（Pin / Occupied / 画像 / プレビュー）
- Part ライブラリ永続化（画像アセット分離保存）
- ZIP Import/Export（`project.json` + `part-library.json` + `assets/*`）
- WASM/Fallback 接続モード表示
- ヒットテスト優先順位（Pin > Wire > Occupied）と Tab サイクル選択

## 3. システム構成

```text
uniuni/
├─ web/                 # React + TypeScript UI
│  └─ src/
│     ├─ App.tsx        # 画面状態・操作ハンドリング・UI
│     ├─ BoardCanvas.tsx# Canvas描画とポインタイベント
│     ├─ coreBridge.ts  # Web ↔ Core(JSON API) 接続
│     ├─ partLibrary.ts # Partライブラリ IndexedDB
│     ├─ persistence.ts # プロジェクトスナップショット IndexedDB
│     ├─ projectPackage.ts # ZIP 入出力
│     ├─ parts.ts       # 幾何ユーティリティ・ヒットテスト候補
│     ├─ coords.ts      # 座標変換
│     └─ types.ts       # Web側型定義
├─ core/                # Rust domain core + wasm-bindgen
│  └─ src/
│     ├─ model.rs       # 状態・コマンド・検証・DRC
│     └─ lib.rs         # wasm公開関数
└─ doc/
   ├─ specification_ja.md
   ├─ implementation_guide_ja.md
   └─ progress.md
```

## 4. レイヤ責務

### 4.1 `web` レイヤ
- ユーザー入力の解釈（クリック、キー、ドラッグ、ホイール）
- 描画（Canvas）
- UI状態管理（選択、ツールモード、編集中フォーム）
- Coreへ渡すコマンド生成
- 永続化/入出力（IndexedDB, ZIP）

### 4.2 `core` レイヤ
- ドメインモデル定義
- コマンド適用と不正状態拒否
- DRC判定
- JSON API（wasm-bindgen）公開

### 4.3 設計原則
- 編集ルールの真実は `core` に置く
- `web` は入力と可視化に集中する
- 座標変換は `coords.ts` に集約する

## 5. 実行時データフロー

### 5.1 起動フロー
1. `detectCoreBridgeMode()` で `wasm/fallback` 判定
2. Partライブラリ読込（失敗時は既定PartDefへフォールバック）
3. スナップショット読込
4. スナップショットがあれば PartDef 差し替え適用
5. 復元失敗時は新規 state を作成して起動継続
6. DRC実行

### 5.2 編集フロー
1. UI操作を `App.tsx` で解釈
2. コマンドJSONを生成
3. `applyCoreCommandJson()` で適用
4. Core state JSON を再同期
5. 履歴更新（Undo/Redo）
6. DRC再評価
7. 遅延自動保存

### 5.3 PartDef更新フロー
1. Part Editor で `partDefs` を更新
2. `replacePartDefsInStateJson()` を実行
3. `core` 側 `ReplacePartDefs` で一括検証
4. 成功時のみ画面反映とライブラリ保存

### 5.4 ZIP Importフロー
1. ZIPを展開して `project.json` を取得
2. `part-library.json` と `assets/*` から PartDef 復元
3. `replacePartDefsInStateJson()` で state と PartDef を整合
4. state置換、選択/履歴リセット、DRC再評価

## 6. Coreドメイン実装

### 6.1 公開JSON API（`core/src/lib.rs`）
- `create_empty_project_json()`
- `apply_command_json(state_json, cmd_json)`
- `drc_json(state_json)`

### 6.2 主要型（`core/src/model.rs`）
- `ProjectState`
- `Board`, `GridPt`
- `PartDef`, `PartInst`, `PinDef`, `Rot`
- `Net`, `Wire`
- `Command`
- `DrcIssue`, `IssueLevel`

### 6.3 コマンド
- `ReplacePartDefs`
- `AddPartInst`
- `MovePartInst`
- `RotatePartInst`
- `DeletePartInst`
- `CommitWire`
- `DeleteWire`
- `AssignNetName`
- `AssignPinToNet`

### 6.4 主要検証
- PartDef整合:
  - ID重複、名前重複/空文字
  - Pin/Occupied最小件数
  - Pin名/Pin座標/Occupied座標の重複
- Part配置整合:
  - ボード外配置禁止
  - Part間衝突禁止
- Wire整合:
  - 最短長（2点以上）
  - 1ステップ Manhattan
  - ボード内
- `ReplacePartDefs` は失敗時ロールバック

### 6.5 DRC
- `PART_COLLISION` (Error)
- `WIRE_PART_COLLISION` (Error)
- `SHORT` (Error)
- `UNCONNECTED_PIN` (Warning)

## 7. Web実装の要点

### 7.1 `App.tsx`
- アプリケーション状態の中心
- 操作モード（`select/place/wire`）管理
- キーボードショートカット処理
- Core state 同期、履歴管理、DRC呼び出し
- Part Editor UI とライブラリUI管理

### 7.2 `BoardCanvas.tsx`
- Canvas描画（グリッド、ボード境界、配線、部品、プレビュー）
- ポインタイベント処理
- Pan/Zoom/Hover座標
- 部品画像キャッシュ（PartDef ID単位）

### 7.3 `parts.ts`
- 幾何計算:
  - `rotateRelative`
  - `absolutePins`
  - `absoluteOccupied`
  - `canPlacePart`
- 選択候補:
  - `buildHitCandidates`
  - `nextHitCandidateIndex`

### 7.4 `coords.ts`
- `screen -> world -> grid` と逆変換
- `clampZoom(0.2..4.0)`

## 8. 永続化と入出力

### 8.1 プロジェクト自動保存（`persistence.ts`）
- DB: `uniuni-db`
- Store: `project_snapshots`
- Key: `active_project`
- 保存内容:
  - `schemaVersion`
  - `coreStateJson`
  - `selectedNetId`

### 8.2 Partライブラリ保存（`partLibrary.ts`）
- DB: `uniuni-db`
- Store: `part_library`
- Snapshot key: `default_library`
- 画像は `asset:<assetId>` キーで分離保存
- 同一画像はハッシュIDで重複排除
- 未参照アセットはクリーンアップ
- 旧スキーマ（v1）読込時は v2 へ移行

### 8.3 プロジェクトZIP（`projectPackage.ts`）
- Export:
  - `project.json`
  - `part-library.json`
  - `assets/<assetId>`
- Import:
  - `project.json` 必須
  - `part-library schemaVersion: 1/2` 対応

## 9. Core接続モード（WASM/Fallback）

### 9.1 判定方針
- まず `core/pkg/uniuni_core.js` の動的importを試行
- 成功時: `wasm`
- 失敗時: fallback許可なら `fallback`
- fallback不許可時: 初期化エラー

### 9.2 fallback制御
優先順:
1. `UNIUNI_CORE_FORCE_FALLBACK=1` で強制許可
2. `UNIUNI_CORE_DISABLE_FALLBACK=1` で無効化
3. `VITE_CORE_DISABLE_FALLBACK=1` で無効化
4. `VITE_CORE_ALLOW_FALLBACK` 明示設定
5. 未指定時は許可（WASM優先）

## 10. テスト方針

### 10.1 方針
- 仕様に根ざしたテストを優先
- 公開API経由で検証し、内部実装への過度な依存を避ける
- 回帰しやすい「整合性崩れ」「移行」「入出力失敗」を重点的にテスト

### 10.2 現在の自動テスト
- `core/src/model.rs`
  - `ReplacePartDefs` の正常/異常/ロールバック
- `web/test/coreBridge.test.ts`
  - bridgeのコマンド適用
  - fallback判定
- `web/test/partLibrary.test.ts`
  - 画像アセット分離、重複排除、移行
- `web/test/projectPackage.test.ts`
  - ZIP構成、互換読込、異常ZIP
- `web/test/partsSelection.test.ts`
  - ヒット優先順位、候補サイクル

### 10.3 実行コマンド
```bash
npm run test -w web
npm run build -w web
cd core && cargo check
cd core && cargo test
```

## 11. 変更時チェックリスト
- `core` の検証責務を壊していないか
- `web` 側が直接状態を書き換えていないか（コマンド経由か）
- `coords.ts` 以外に座標変換ロジックを散らしていないか
- PartDef更新が `ReplacePartDefs` 経由になっているか
- ZIP/IndexedDBの互換性（schemaVersion）を維持しているか
- 最低限の検証コマンドを通したか

## 12. 今後の改善候補
- ZIP Importの進捗表示とエラー詳細化
- E2Eテスト整備（主要ショートカット、配置・配線回帰）
- 大規模データ時の描画/ヒットテスト性能最適化

## 13. 参照
- 仕様: [specification_ja.md](./specification_ja.md)
- 進捗: [progress.md](./progress.md)
- 利用方法: [README.md](../README.md)
