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

## 2026-03-11 (Step4継続)
実装内容:
- Part Editor の画像設定UIを整理。
  - 画像設定を `Pin設定` / `Occupied設定` と同じ粒度のブロックに分離
  - `Scale` / `Offset X` / `Offset Y` を各1行に分離
  - 各項目を `スライダー + 数値入力` の操作形式に変更
- 画像削除時のCAD反映不具合を修正。
  - PartDef の `imageDataUrl` が空になったとき、`BoardCanvas` の画像キャッシュから即時削除
  - 削除済み PartDef ID のキャッシュもクリーンアップ
  - 画像削除後に既配置部品へ画像が残る問題と、新規配置に古い画像が再利用される問題を解消
- 部品回転時の画像描画を修正。
  - 部品の `rot` に合わせて画像も回転
  - 回転時に画像アスペクト比が崩れる問題を修正（ローカルoccupied寸法基準で描画サイズを算出）
- PartDef 検証の `core` 側移管を実施。
  - `core` に `ReplacePartDefs` コマンドを追加
  - PartDef 一括更新時に以下を検証:
    - PartDef ID 重複、部品名重複、空の部品名
    - pin/occupied の最小件数
    - pin 名重複、pin 座標重複、occupied 座標重複
    - 既存 PartInst の参照整合（def 存在、net_assign の pin 存在）
    - 既存配置が新 PartDef でも盤面内・非衝突を満たすこと
  - 検証失敗時は更新前の `part_defs` を保持（ロールバック）
- `web` の PartDef 同期を `ReplacePartDefs` コマンド経由へ変更。
  - `replacePartDefsInStateJson` を `apply_command_json` 経由へ切替
  - 初期化時の PartDef 反映も同コマンド経由へ統一
  - 不正 PartDef が core 検証に失敗した場合、ライブラリ保存を行わない順序へ変更

検証:
- `npm run build -w web` 成功。
- `cd core && cargo check` 成功。

## 2026-03-12 (Step4仕上げ)
実装内容:
- `core` に `ReplacePartDefs` のユニットテストを追加。
  - 正常系: 妥当な PartDef 更新を受理
  - 異常系: 部品名重複を拒否
  - ロールバック系: pin 削除で既存 `net_assign` が不正化する更新を拒否し、更新前 `part_defs` を保持
  - ロールバック系: 既存配置が盤面外になる更新を拒否し、更新前 `part_defs` を保持
- `web` fallback (`coreBridge`) の整合テストを追加。
  - `ReplacePartDefs` の代表ケース（正常/重複/参照不整合/衝突）を Node テストで検証
  - 内部ヘルパー直叩きではなく `applyCoreCommandJson`（公開API）経由で検証
  - テスト実行基盤として `tsx` を devDependency に追加
- Step4 完了に合わせて実装ガイドを更新。
  - Step4 ステータスを `完了` に変更
  - 未実装項目から「PartDef 編集に対する core 側検証移管」を削除

検証:
- `cd core && cargo test` 成功（4件 pass）
- `npm run test -w web` 成功
- `npm run build -w web` 成功
- `cd core && cargo check` 成功

## 2026-03-09
実装内容:
- 仕様書・ガイド類に Step4〜Step7 計画を反映。
  - `doc/impl_brief.md` の実装順序を Step1〜Step7 ロードマップへ更新
  - `doc/implementation_guide_ja.md` の到達点/未実装項目/ロードマップを最新化
  - `README.md` の Current Status と次フェーズ案内を更新

検証:
- ドキュメント更新のみ（ビルド影響なし）。

## 2026-03-09 (Step4着手)
実装内容:
- Step4 用ブランチ/ドラフトPRを作成。
- PartDef を固定定数から編集可能 state に移行。
- Part editor の最小 UI を追加。
  - PartDef 名変更
  - pin 追加/削除
  - occupied セル追加/削除
- Part ライブラリ永続化を追加（`web/src/partLibrary.ts`）。
  - IndexedDB から PartDef ライブラリを読込
  - 変更時に自動保存
- PartDef 編集結果を core state の `part_defs` へ同期する処理を追加。
- メニュー部 UI/UX を改善。
  - ツールバーを機能別カード（編集操作 / 配線とネット / Part Editor）に再構成
  - Part Editor 内で `Pin設定` と `Occupied設定` を明確に分離
  - 既存機能を維持したまま視認性を改善
- レイアウトをサイドバー型に変更。
  - メニューを画面上部から左サイドバーへ移設
  - キャンバス領域を広く確保
  - 画面幅が狭い場合は縦積みに切り替えるレスポンシブ対応を追加
- 部品配置導線を修正。
  - `Place` ボタン押下で配置対象を確実にアーム
  - 1回配置後も `place` モードを維持して連続配置可能に変更
  - 配置対象 PartDef を選択するセレクタを追加
- メイン領域下段に部品ライブラリ表示を追加。
  - カード形式で部品サムネイル・部品名・ピン数・occupied数を表示
  - カードクリックで配置対象をアーム可能
- Part Editor から新規部品作成を追加。
  - `New Part` で PartDef を作成
  - 作成直後に下部部品ライブラリへ表示
  - 既存の Part ライブラリ永続化フローで保存対象になる
- Part Editor から部品削除を追加。
  - `Delete Part` で PartDef を削除可能
  - 配置済み部品で使用中の PartDef は削除不可
  - PartDef が1件のみのときは削除不可
- キーボード操作仕様の修正。
  - 既存部品（デフォルト/オリジナル問わず）の選択中・ホバー中に `R` を押すと、その部品を回転
  - 配置アーム中の `R` は配置対象を回転
  - それ以外の `R` は抵抗配置開始
- PartDef 画像対応を追加。
  - Part Editor で `Set Image` / `Clear Image` が可能
  - 画像は PartDef の `imageDataUrl` として保存
  - 下部部品ライブラリカードで画像サムネイル表示
- Part Editor に視覚プレビューを追加。
  - occupied セルと pin をグリッド上で可視化
  - origin / occupied / pin の凡例表示を追加
- Part Editor プレビューを固定領域 + Zoom方式へ変更。
  - プレビュー領域サイズを固定
  - `Fit / + / -` で倍率調整
  - pin/occupied変更時は自動で Fit 倍率へ戻して全体表示
- Part Editor の Pin/Occ 一覧を表形式に変更。
  - Pin: `Pin名 | X座標 | Y座標`
  - Occ: `X座標 | Y座標`
  - 各行の右端にゴミ箱アイコンを配置し、削除可能にした
- Part Editor バリデーション/通知を強化。
  - 無効入力や重複入力を通知表示
  - Pin/Occupied の最小件数制約（最低1件）を導入
  - 部品名重複チェックを導入
- Part ライブラリの JSON Export/Import を追加。
  - `Export Library` で PartDef 一覧を JSON 出力
  - `Import Library` で PartDef 一覧を読み込み
  - 最低限の妥当性チェック（id/name/pins/occupied）を通した定義のみ採用
- PartDef 画像の表示調整項目を追加。
  - `imageScale`, `imageOffsetX`, `imageOffsetY` を編集可能
  - キャンバス上の部品描画に画像変換（拡大縮小・オフセット）を反映

検証:
- `npm run build -w web` 成功。
- `cd core && cargo check` 成功。
