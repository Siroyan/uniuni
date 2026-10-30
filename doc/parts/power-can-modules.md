# DC-DC / CANモジュール

## AE-MYMGK00506ERSR-5V0（秋月115108）

出典: [商品ページ](https://akizukidenshi.com/catalog/g/g115108/)、[マニュアル Ver.2020-04-02](https://akizukidenshi.com/goodsaffix/AE-MYMGK00506ERSR-5V0.pdf) の1ページ。

5V出力・最大6A、基板28.5×16mm、端子ピッチ2.54mm。上から見て左がCN1、右がCN2。
原点は左上のCN1.1 PG。左右の列間寸法は明記されていないため、外形と図面比率から10ピッチ（25.4mm）として近似する。
CN1の1→6は下向き、CN2の1→6は上向きであり、両列を同じ順序にしない。

| 端子 | 信号 | グリッド座標 |
| --- | --- | --- |
| CN1.1 | PG | (0,0) |
| CN1.2 | CTRL | (0,1) |
| CN1.3 | GND | (0,2) |
| CN1.4 | GND | (0,3) |
| CN1.5 | VIN | (0,4) |
| CN1.6 | VIN | (0,5) |
| CN2.1 | VOUT | (10,5) |
| CN2.2 | VOUT | (10,4) |
| CN2.3 | VOUT | (10,3) |
| CN2.4 | GND | (10,2) |
| CN2.5 | GND | (10,1) |
| CN2.6 | GND | (10,0) |

同じ信号の複数ピンを区別できるよう、Pin名は `CN1.3 GND` などとする。
外形をピン列に対称配置すると端子外側へX方向約1.55mm、Y方向約1.65mm張り出す。半セル1.27mmを超えるため、Occupiedは外形と交差するセルを含む `x=-1..11, y=-1..6` の13×8セルとする（画像中の実基板は28.5×16mm相当）。
原点(0,0)を基板端へ置くことはできない。初期画像の赤印はCN1.1。
基板内で接続済みのGND/VIN/VOUTを、現在のNet・DRCが自動的に同一視する機能はない。

## MCP25625-breakout Vertical（スイッチサイエンス7228）

出典: [商品ページ](https://www.switch-science.com/products/7228)、[Rev2023.05回路図](https://github.com/asukiaaa/MCP25625-breakout/blob/e3512dc777c69fa6bf6a128405b534d0f0182767/docs/rev2023.05/mcp25625-breakout.pdf)、[KiCad SSOP28基板](https://github.com/asukiaaa/MCP25625-breakout/blob/e3512dc777c69fa6bf6a128405b534d0f0182767/ssop28/mcp25625-breakout-ssop28.kicad_pcb)。
設計データ参照コミット: `e3512dc777c69fa6bf6a128405b534d0f0182767`。

RESETが追加された現行11ピン版。KiCadのJ1は2.54mmピッチで、ピン間全長25.4mm。
基板外形の幅は `164.67 - 136.73 = 27.94mm`、高さは約13.98mm、板厚1.6mm。
ユニバーサル基板に対して垂直に立て、基板高さは画面奥行きに変換しない。

原点はJ1.1 SCK。部品面を正面から見た左→右をX正方向とし、ピン列は全てY=0。

| J1 | Pin名 | 座標 |
| --- | --- | --- |
| 1 | SCK | (0,0) |
| 2 | SO | (1,0) |
| 3 | SI | (2,0) |
| 4 | CS | (3,0) |
| 5 | INT | (4,0) |
| 6 | RESET | (5,0) |
| 7 | V_IO | (6,0) |
| 8 | V_DDA | (7,0) |
| 9 | GND | (8,0) |
| 10 | CANH | (9,0) |
| 11 | CANL | (10,0) |

Occupiedは `x=0..10, y=0..1` の11×2セル。Y正側の1行は搭載部品の張り出し用に確保した設計上の余白で、組立後厚みの実測値ではない。画像は基板の細い上端と部品の張り出しを上から見た図。赤印はJ1.1。
旧10ピン版は対象外。現行版と旧版ではRESET以降の端子番号が異なる。

## カタログ保存

カテゴリは両方とも「その他」。カタログv11で既存v10以下へ不足分を一度追加する。
同じIDまたは名前の部品は上書きしない。更新後の削除・画像編集は再読込後も維持する。
既存のJSON/ZIPスキーマやRustの型の変更は不要。

`node scripts/draw-module-parts.mjs` と `node scripts/embed-part-art.mjs` でPNGと埋込データを再生成できる。
