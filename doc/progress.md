# 開発進捗

※このファイルの今後の追記は日本語で行う。

## 2026-10-04 (初期部品にピンヘッダーを追加)
実装内容:
- 2.54 mmピッチのPin Header 1x2・1x3・1x4・2x3を初期ライブラリに追加し、`J` の参照名で配置できるようにした。
- 保存済みライブラリには不足するヘッダーを一度だけ追加し、利用者が編集・削除した部品を維持。

検証:
- Dev Container の `npm run build -w web` と Web ユニットテストが成功。
- Chromium の E2E 11件が成功。2x3の配置、古いライブラリへの追加、削除後の再読み込みを確認。

## 2026-10-04 (配線確定時のネットとピンの自動割当)
実装内容:
- Wire の経路が触れた既存配線・割当済みPinからNetを判定。接続先がなければNetを自動生成。
- 経路上のPinを同じNetに割り当て、異なる既存Netをつなぐ場合は確定を拒否。
- Web の配線操作から事前のNet選択を不要にし、確定した配線のNetを編集対象に選択。
- 手動のPin割当は任意の折りたたみ項目に移し、自動割当の案内を追加。

検証:
- Dev Container で Rust の14件のテストと Web の本番ビルドが成功。
- Web のユニットテスト、更新した WASM を使う Chromium の E2E 9件が成功。

## 2026-10-03 (Part Editor を右ペインへ移動)
実装内容:
- 画面を左の設定、中央の編集領域と部品ライブラリ、右の Part Editor の3ペイン構成に変更。
- 右ペインは独立してスクロールでき、狭い画面では編集領域の下に表示。

検証:
- TypeScript、Vite ビルド、Web のユニットテスト4件に成功。
- システム Chromium で既存 E2E 8件を確認し、デスクトップとスマートフォンのペイン配置・横スクロールなし・新規部品作成を確認。

## 2026-10-03 (ネット操作欄の整理)
実装内容:
- 配線確定・取消の重複ボタンと、編集後に自動更新されるDRCの再実行ボタンを撤去。
- ZIP入出力を「プロジェクト」欄へ分離し、ネットの色設定を必要なときだけ展開できるように変更。
- ピン割当は部品を選択したときだけ表示し、残す操作には文字とアイコンを併記。
- 名前はEnterキーでも保存でき、変更がない保存ボタンは無効化。

検証:
- `npm run build -w web`、`npm run test -w web` 成功。
- Chromium の E2E 8 件成功。デスクトップ・スマートフォンで通常時と色設定展開時の表示を確認。

## 2026-10-03 (白基調の配色に変更)
実装内容:
- 設定パネル、編集ツール、入力欄、部品ライブラリを白と淡いグレーの面に変更し、文字・境界・操作状態のコントラストを調整。
- Canvas の外側と基板を明るい色に変更し、穴・配線・選択・プレビューを白背景でも識別できる色に変更。
- 既定のネット色を明るい背景で見やすい色に変更。保存済みのユーザー指定色は維持。

検証:
- `npm run build -w web` 成功。
- Chromium でデスクトップ、スマートフォン、設定展開時の表示を確認。

## 2026-10-03 (編集画面の見やすさと操作導線を改善)
実装内容:
- 基板の直上に選択・配置・配線、部品選択、回転、Undo/Redo、削除をまとめ、操作中の案内を表示。
- 狭い画面では設定を開閉できるようにし、編集領域と部品ライブラリの表示面積を拡大。
- 設定開閉や画面サイズ変更時に Canvas を再描画し、表示の伸びを防止。
- スマートフォン幅での設定開閉、Canvas サイズ、配置操作の E2E テストを追加。

検証:
- `npm run build -w web`、`npm run test -w web` 成功。
- Chromium の E2E 7 件成功。

## 2026-10-03 (ローカル用 Dev Container)
実装内容:
- Node 22 と Rust stable、WASM ターゲット、`wasm-bindgen-cli` 0.2.114 を含む Dev Container 設定を追加。
- コンテナー作成時に `npm ci` を実行し、Vite の 5173 番ポートを転送。
- README に VS Code からの起動・確認手順を追加。

検証:
- Docker イメージのビルドに成功し、コンテナー内で Node 22、Rust、WASM ターゲット、`wasm-bindgen` 0.2.114 を確認。
- コンテナー内で `npm ci`、`npm run build -w web`、`cd core && cargo check --locked` が成功。
- コンテナー内の Vite を 5173 番ポートで起動し、Chromium で `Core: WASM` を確認。

## 2026-10-03 (GitHub Pages 公開準備)
実装内容:
- Vite の base と生成 WASM の読み込みを Pages の `/uniuni/` 配下に対応。
- 画像の data URL をブラウザー内で Blob に変換し、外部送信を伴わない IndexedDB 保存を維持。
- Content Security Policy で外部通信先を許可せず、ブラウザー内保存と ZIP バックアップを README に記載。
- GitHub Actions の既存 CI が全件成功した場合だけ `main` の成果物を Pages にデプロイ。
- Pages 配下のプレビューと外部通信がないことを E2E で検証。

検証:
- `npm run test -w web`、`cargo check --locked`、`PAGES_BASE_PATH=/uniuni/ npm run build -w web` 成功。
- Chromium で通常の開発サーバーと `/uniuni/` 配下の本番プレビューを各6件確認。


## 2026-10-02 (dev レビューの高優先度課題を修正)
実装内容:
- 標準の Web 開発・本番ビルドで Rust Core の WASM を生成・配布し、CI と手順書にも依存ツールを明記。
- fallback の配線盤面境界チェックと DRC の部品衝突・配線部品衝突・未接続 Pin 検出を Rust Core に合わせた。
- 部品定義編集を Core 検証後に確定し、Undo/Redo、保存、ZIP 出力で定義とプロジェクトの組を維持。
- ZIP・IndexedDB 復元時にプロジェクトスキーマと構造、参照、盤面境界、占有、配線経路を検証。
- WASM 動作、編集拒否、ZIP 拒否の回帰テストを追加。

検証:
- `npm run test -w web`、`npm run build -w web`、`cargo check --locked`、`cargo test --locked` 成功。
- Chromium の E2E 5 件成功。開発サーバーで `Core: WASM` を確認。


## 2026-03-13 (Step8着手: 自動回帰化基盤)
実装内容:
- `dev` から `feature/step8-e2e-regression` を作成し、Draft PR を作成。
- Playwright を導入し、E2E 回帰テスト基盤を追加。
  - `web/playwright.config.ts` を追加
  - `web/e2e/regression.spec.ts` を追加
  - `web/package.json` に E2E 実行スクリプトを追加
    - `test:e2e`, `test:e2e:headed`, `test:e2e:ui`, `e2e:install`
  - `.gitignore` に `web/playwright-report`, `web/test-results` を追加
- 回帰シナリオ（初版）を追加。
  - 部品の連続配置
  - 手動配線の確定
  - Pin優先選択 + Tab サイクルによる候補切替
- ドキュメント更新。
  - `README.md` に E2E 実行手順を追記
  - `doc/implementation_guide_ja.md` に E2E 基盤と実行前提を追記
- CI を追加し、自動回帰化を GitHub Actions に組み込み。
  - `.github/workflows/ci.yml` を追加
  - `web unit + build` / `core check + test` / `web e2e regression` の3ジョブを定義
  - E2E ジョブで Playwright report / trace を artifact 保存

検証:
- `npm run test -w web` 成功
- `npm run build -w web` 成功
- `cd core && cargo check` 成功
- `npm run test:e2e -w web` は環境依存ライブラリ不足（`libnspr4.so`）で未通過
  - `npx playwright install chromium` 実行済み
  - `npx playwright install-deps chromium` は権限要件（sudoパスワード）により本環境で未実施

## 2026-03-13 (基板境界表示の補正)
実装内容:
- CAD描画で、基板境界を「最外周グリッドの半ピッチ外側」に表示するよう修正。
  - 境界線上に配線しているように見える表示を解消
  - グリッド描画範囲を有効グリッド点の範囲に合わせて調整
- 基板プリセットの Cタイプを `25 x 15` grid に補正。
- 基板プリセットの Aタイプ表記を公式寸法に合わせて `155x114mm` に補正。

検証:
- `npm run test -w web` 成功
- `npm run build -w web` 成功

## 2026-03-13 (基板サイズ任意設定 + 秋月A/B/Cプリセット)
実装内容:
- 基板サイズ変更用コマンドを `core` に追加。
  - `ResizeBoard { width, height }`
  - `width/height` は正整数のみ許可
  - 変更後に既存 Wire 点や Part occupied が盤外になる場合は拒否
- `web` に基板サイズ変更UIを追加。
  - 任意の `Width/Height` を入力して `Apply Size`
  - 秋月 `A/B/C` プリセットを選択して `Apply Preset`
  - 現在のグリッドサイズと mm 相当値を表示
- fallback bridge に `ResizeBoard` を追加し、WASM未使用時でも同挙動を保証。
- `extractViewStateFromCoreJson` で `board` を返すよう拡張し、UI側の board state と同期。
- テストを追加。
  - `core/src/model.rs`: `ResizeBoard` の正常系/部品盤外/配線盤外
  - `web/test/coreBridge.test.ts`: fallback での `ResizeBoard` 成功/拒否

検証:
- `cd core && cargo test` 成功
- `npm run test -w web` 成功
- `npm run build -w web` 成功
- `cd core && cargo check` 成功

## 2026-03-13 (M移動中の回転が配置時に失われる不具合修正)
実装内容:
- 移動中プレビューの最終姿勢をそのまま確定できるよう `core` に `MoveRotatePartInst` コマンドを追加。
  - `part_id`, `to`, `rot` を同時に受け取り、単一検証で配置を確定
- `web` 側を `MoveRotatePartInst` 利用へ切替。
  - `M` で持ち上げ中に `R` で変更した回転が、クリック配置後にも保持されるよう修正
- fallback bridge にも `MoveRotatePartInst` を追加し、WASM未使用時でも同挙動を保証。
- テストを追加。
  - `core/src/model.rs`: `MoveRotatePartInst` の同時適用テスト
  - `web/test/coreBridge.test.ts`: fallback 経由で位置+回転が同時反映されることを検証

検証:
- `cd core && cargo test` 成功
- `npm run test -w web` 成功
- `npm run build -w web` 成功
- `cd core && cargo check` 成功

## 2026-03-13 (ネットごとの配線色カスタマイズ)
実装内容:
- ネットに配線色を保持できるよう `core` のドメインを拡張。
  - `Net` に `color: Option<String>` を追加
  - `AssignNetColor { net_id, color }` コマンドを追加
  - 色文字列は `#RRGGBB` 形式のみ許可（不正値は拒否）
- `web` の Core bridge/fallback を拡張。
  - `AssignNetColor` コマンドを追加
  - fallback 実装でも色検証を実施
  - state 変換時に `Net.color` を UI に反映
- 配線描画をネット色対応に変更。
  - `BoardCanvas` で `Net.color` 指定時はその色を優先
  - 未指定時は既存のハッシュ色パレットを継続使用
- サイドバーの「配線とネット」UIを拡張。
  - Net color picker を追加
  - `Apply Color` で設定、`Reset Color` で既定色（未設定）に戻す操作を追加
- テストを追加。
  - `core/src/model.rs`: `AssignNetColor` の正常系/異常系/新規Net生成を検証
  - `web/test/coreBridge.test.ts`: fallback 経由の色設定/解除と不正値拒否を検証

検証:
- `cd core && cargo test` 成功（7件 pass）
- `npm run test -w web` 成功
- `npm run build -w web` 成功
- `cd core && cargo check` 成功

## 2026-03-12 (`impl_brief.md` 廃止)
実装内容:
- `doc/impl_brief.md` を削除。
- 参照を `doc/specification_ja.md` / `doc/implementation_guide_ja.md` へ移行。
  - `AGENTS.md` の一次参照先を更新
  - `doc/implementation_guide_ja.md` の参照・構成図を更新
- 以後、仕様の一次情報は `doc/specification_ja.md` を基準とする。

検証:
- 参照リンクの全文検索で `impl_brief.md` の現行参照が残っていないことを確認
  - 進捗ログ内の過去履歴記述のみ残存

## 2026-03-12 (実装ガイド再整理)
実装内容:
- `doc/implementation_guide_ja.md` をゼロベースで全面再構成。
  - 仕様書との差分（本書の役割）を明確化
  - 現行の実装到達点（Step1〜Step7完了）を整理
  - レイヤ責務、実行時データフロー、Core/Web主要モジュールを再定義
  - 永続化/ZIP入出力/接続モード（WASM・fallback）を現行実装に合わせて更新
  - テスト方針、変更時チェックリスト、改善候補を再整理
- 仕様は `doc/specification_ja.md`、実装は `doc/implementation_guide_ja.md` という参照関係を明文化。

検証:
- ドキュメント更新のみ（ビルド影響なし）。

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
- `npm run test -w web` 成功（`coreBridge.test.ts`, `partLibrary.test.ts`）
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

## 2026-03-12 (Step5着手)
実装内容:
- Part ライブラリ永続化の構造を改修。
  - `web/src/partLibrary.ts` で PartDef 本体と画像アセットの保存責務を分離
  - PartDef は `imageAssetId` 参照を保持し、画像データURLは Blob アセットとして IndexedDB へ保存
  - 同一画像はハッシュベースの asset id で再利用し、重複保存を抑制
  - ライブラリ更新時に未参照アセットをクリーンアップし、不要データを残さないように変更
  - 読込時は Blob から data URL を復元して既存 UI 型（`imageDataUrl`）へ変換
  - 旧フォーマット（`schemaVersion: 1`）読み込み互換を維持
  - 旧フォーマット読込時は `schemaVersion: 2`（asset参照形式）へ自動移行保存
- IndexedDB バージョン衝突の再発防止。
  - `partLibrary.ts` / `persistence.ts` の DB オープンを「最新バージョン取得→必要時のみ version up」方式へ統一
  - `requested version is less than existing version` 系エラーの再発を防止

検証:
- `npm run test -w web` 成功（`coreBridge.test.ts`, `partLibrary.test.ts`）
- `npm run build -w web` 成功。
- `cd core && cargo check` 成功。

## 2026-03-12 (Step6着手)
実装内容:
- プロジェクト入出力を ZIP 形式へ拡張。
  - `web/src/projectPackage.ts` を追加
  - `project.json` と `part-library.json`、`assets/*` を同梱する ZIP 生成を実装
  - ZIP 読込時に `project.json` と Part ライブラリ（画像含む）を復元する処理を実装
- `App.tsx` のプロジェクト入出力 UI を ZIP ベースへ変更。
  - `Export ZIP` / `Import ZIP` を追加
  - ZIP インポート時に PartDef を先に復元し、core state へ整合反映
- ZIP パッケージのテストを追加。
  - `web/test/projectPackage.test.ts`
  - 検証観点:
    - ZIP に `project.json + part-library.json + assets/*` が入ること
    - 同一画像の asset 重複が抑制されること
    - 不正 ZIP（`project.json` 欠落）を拒否すること
    - `part-library schemaVersion: 1` の互換読込ができること

検証:
- `npm run test -w web` 成功（`coreBridge.test.ts`, `partLibrary.test.ts`, `projectPackage.test.ts`）
- `npm run build -w web` 成功。
- `cd core && cargo check` 成功。

## 2026-03-12 (Step7着手〜完了)
実装内容:
- WASM 本接続導線を整理し、接続モードを明示化。
  - `web/src/coreBridge.ts` に `wasm` / `fallback` 判定を追加
  - `detectCoreBridgeMode()` を追加し、UI 側で接続モードを表示
  - 既定は fallback 許可（WASM 優先）で、WASM 未配置環境でも動作継続
  - `VITE_CORE_DISABLE_FALLBACK=1` 指定時のみ fallback を無効化し、未配置時は明示エラー
- 選択UXを仕様どおりに調整。
  - ヒットテスト候補を `pin -> wire -> occupied` の優先順位で生成
  - 同一点候補を `Tab` / `Shift+Tab` でサイクル選択可能に変更
  - クリック選択とキーボード選択で同一候補列を使うよう統一
- 選択ロジックの純関数を `web/src/parts.ts` へ集約。
  - `buildHitCandidates`
  - `nextHitCandidateIndex`
- テストを追加。
  - `web/test/partsSelection.test.ts`:
    - pin優先
    - wire優先（non-pin occupied 上）
    - Tab サイクル前後
  - `web/test/coreBridge.test.ts`:
    - テスト環境で fallback 判定
    - 環境変数による fallback 無効化時のエラー
- ドキュメント更新。
  - `doc/implementation_guide_ja.md`: Step7 を完了へ更新、6.6 節（WASM接続モード/選択ヒットテスト）を追加
  - `README.md`: 現在到達点を Step7 へ更新

検証:
- `npm run test -w web` 成功（`coreBridge.test.ts`, `partLibrary.test.ts`, `partsSelection.test.ts`, `projectPackage.test.ts`）
- `npm run build -w web` 成功。
- `cd core && cargo check` 成功。

## 2026-03-12 (Step7フォローアップ: 配置不能修正)
実装内容:
- 部品配置不能の原因となっていた `coreBridge` の fallback 既定挙動を修正。
  - Step7 で導入した「本番時 fallback 既定無効」により、WASM 未配置環境で初期化失敗し配置操作が実行不可になる回帰を確認
  - 既定を「WASM 優先 + fallback 許可」に戻し、`VITE_CORE_DISABLE_FALLBACK=1` 指定時のみ無効化する仕様へ変更
- エラーメッセージを新仕様に合わせて更新。

検証:
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
