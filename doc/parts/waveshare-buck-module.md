# Waveshare DC5-36-TO-DC3V3-5（29035）

出典（2026-10-31確認）:

- [千石電商 EEHD-6L8H](https://www.sengoku.co.jp/mod/sgk_cart/detail.php?code=EEHD-6L8H)
- [メーカーWiki](https://www.waveshare.com/wiki/DC5-36-TO-DC3V3-5)
- [メーカー寸法図](https://www.waveshare.com/w/upload/8/88/DC5-36-TO-DC3V3-5_size.jpg)
- [端子説明図](https://www.waveshare.com/w/upload/c/cb/DC5-36-TO-DC3V3-5-Port.jpg)
- [回路図](https://files.waveshare.com/wiki/DC5-36-TO-DC3V3-5/DC5-36-TO-DC3V3-5-Schematic.pdf)
- [メーカー外形ライブラリ（Altium PcbLib）](https://files.waveshare.com/wiki/DC5-36-TO-DC3V3-5/DC5-36-TO-DC3V3-5_Frame.zip)

## 対象と接続方法

指定品はSMD／半穴版の29035。端子台・ヘッダー実装済みの29036（-M）とは区別する。
外形33×16×5.7mm。出力は5V（既定）または抵抗の付け替えで3.3V。
上面の左上2端子はVIN+、左下2端子はVIN-。右上3端子はVOUT+、右下3端子はGND。

**入力側は3.5mmピッチで、2.54mmユニバーサル基板にはそのまま直挿しできない。**
そのため部品名を `Waveshare DC5-36-TO-DC3V3-5 Wired` とし、平置きの配線接続用モデルとして登録する。
出力側は2.54mm、列間のスルーホール中心距離は27.80mm。実物のピン／半穴配置を整数グリッドで正確に再現するモデルではない。

## CADの座標と近似

Occupiedは14×7セル（35.56×17.78mm）で、33×16mmの本体を含む。
原点は占有範囲の左上セル。画像は上面を基にしたドット絵。
配線を本体外へ取り出せるよう、接続点は左右の半穴を表す外周セルX=0/13へ置く。左右間隔33.02mmは半穴がある基板両端の距離に近似する。
Y座標は端子の上下順序と信号グループを保ち、2.54mmグリッドへ近似する。直挿し寸法や製造用のフットプリントとしては使用しない。

| CAD内のPin名 | 座標 | 実物の接続箇所 |
| --- | --- | --- |
| VIN+1 | (0,1) | 左上1つ目 |
| VIN+2 | (0,2) | 左上2つ目 |
| VIN-1 | (0,4) | 左下1つ目 |
| VIN-2 | (0,5) | 左下2つ目 |
| VOUT+1 | (13,1) | 右上1つ目 |
| VOUT+2 | (13,2) | 右上2つ目 |
| VOUT+3 | (13,3) | 右上3つ目 |
| GND1 | (13,4) | 右下1つ目 |
| GND2 | (13,5) | 右下2つ目 |
| GND3 | (13,6) | 右下3つ目 |

Pin名の末尾番号は同一信号の複数接続点を区別するためのCAD内採番で、メーカーのP1/P2番号ではない。
同じ穴につながる半穴・スルーホールは別々の電気端子として重複登録しない。
現行Net・DRCはモジュール内部のVIN-とGNDなどの導通を自動反映しない。

## 保存と再生成

カテゴリ「その他」、カタログv12。保存済みv11以下には不足している場合だけ一度追加し、同ID・同名の編集済み部品を上書きしない。更新後の削除も維持する。
`node scripts/draw-module-parts.mjs`、`node scripts/embed-part-art.mjs` でPNGと埋込データを再生成できる。
