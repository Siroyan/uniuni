# 開発進捗

※このファイルの今後の追記は日本語で行う。

## 2026-03-07
`doc/impl_brief.md` に基づく実装を開始。

実装内容:
- ブラウザファースト構成のプロジェクト雛形を作成。
- `web` の Canvas プロトタイプを実装:
  - グリッド描画
  - ボード境界描画
  - pan（中/右ドラッグ）
  - zoom（ホイール、カーソル位置アンカー）
  - スナップ座標 HUD 表示
- `core` の Rust プロトタイプを実装:
  - ドメイン構造体（`Board`, `GridPt`, `Wire`, `Net`, `PartDef`, `PartInst`）
  - コマンド列挙（`CommitWire`, `AssignNetName`）
  - 配線パス検証（Manhattan 1ステップ）
  - 最小 DRC（同一点の異ネット共有 = SHORT）
  - wasm-bindgen JSON ブリッジ（`create_empty_project_json`, `apply_command_json`, `drc_json`）

検証:
- `npm run build -w web` 成功。
- `cargo check` は環境に toolchain が無く未実行。

## 2026-03-08
実装内容:
- Web-core コマンドブリッジ（`web/src/coreBridge.ts`）を追加。
  - `core` の JSON API（`/core/pkg/uniuni_core.js`）が利用可能ならそれを使用
  - wasm 生成物が無い環境向けにローカル fallback を実装
- `web/src/App.tsx` の配線確定をローカル直接追加から core の `CommitWire` 適用に変更。
- Net 追加時に core へ `AssignNetName` を発行するフローへ変更。
- DRC 実行（`Run DRC`）とツールバーへの結果表示を追加。
- core スキーマ整合のため、web 側 Net ID を UUID 化。
- `web/src/App.tsx` の Part 操作（`Add/Move/Rotate/Delete`）を core コマンド経由に統一し、適用後に core JSON から UI state を再同期。
- 初期化時に `part_defs` を core state へ投入し、組み込み PartDef の ID を UUID に変更。
- fallback ブリッジを拡張し、Part コマンドと配置検証をサポート。
- core state スナップショット履歴（`past`/`future`）による最小 Undo/Redo を追加。
  - Undo: `Ctrl/Cmd + Z`
  - Redo: `Ctrl/Cmd + Y` / `Ctrl/Cmd + Shift + Z`
- Undo/Redo の選択復元ポリシーを改善。
  - 履歴エントリに `selectedPartId` を保持
  - 復元先 state に対象 Part が存在する場合は選択を復元
  - 存在しない場合は選択をクリア
- IndexedDB 永続化の最小実装を追加（`web/src/persistence.ts`）。
  - 保存対象: `coreStateJson`, `selectedNetId`
  - 起動時: 保存スナップショットがあれば復元し、無ければ新規初期化
  - 実行中: 状態変更後に自動保存（短い遅延付き）
- `project.json` のエクスポート/インポート機能を追加。
  - Export: 現在の `coreStateJson` を JSON ファイルとしてダウンロード
  - Import: JSON ファイル読込後に state を再同期し、履歴・選択・DRC を再初期化
- Wire 選択と削除を追加。
  - グリッドクリックで Wire を選択可能（Part が優先されない場合）
  - 選択中 Wire はハイライト表示
  - `Delete Selected` で `DeleteWire` コマンドを発行
  - `Delete` / `Backspace` キーでも削除可能
  - Undo/Redo 履歴にも `selectedWireId` を保存して復元
- Net 名変更 UI を追加。
  - 選択中 Net の名前を入力して `Rename Net` で `AssignNetName` を発行
  - core state へ反映後、一覧と DRC 表示を再同期
- `core` の DRC と配線検証を強化。
  - `CommitWire` 時にボード外座標を拒否（`wire path is outside board`）
  - DRC に `WIRE_PART_COLLISION` を追加
    - Wire 点が Part の occupied セルと重なる場合に Error
    - ただし Part の pin 位置に一致する点は許可
- `AssignPinToNet` を web UI から実行可能にした。
  - 選択中 Part の pin を選択し、選択中 Net へ割当可能
  - コマンド適用後に state / DRC を再同期
- `web` 側 `PartInst` に `netAssign` を保持するように更新。
  - `coreBridge` の状態変換で `net_assign` を取り込み
  - fallback 実装にも `AssignPinToNet` を追加

検証:
- `npm run build -w web` 成功。
- `cd core && cargo check` 成功。

## 2026-03-09
実装内容:
- 仕様書・ガイド類に Step4〜Step7 計画を反映。
  - `doc/impl_brief.md` の実装順序を Step1〜Step7 ロードマップへ更新
  - `doc/implementation_guide_ja.md` の到達点/未実装項目/ロードマップを最新化
  - `README.md` の Current Status と次フェーズ案内を更新

検証:
- ドキュメント更新のみ（ビルド影響なし）。
