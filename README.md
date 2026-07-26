# chiban - 地番調査サイト

日本の地番を無料で調べられる地図サイト。背景に国土地理院のシームレス空中写真タイル、手前に法務省「登記所備付地図データ」由来の地番ポリゴン(GeoJSON)を重ねて表示する。

対象自治体は決め打ちしない。`converter/`でXMLをGeoJSONに変換し`frontend/public/data/`に配置すれば、フロントエンドは自動でレイヤに追加する。

## 構成

- `frontend/` - Vite + TypeScript + MapLibre GL JSによる地図UI。静的ファイルのみで完結し、npm installとビルドだけで動く。
- `converter/` - Python(uv管理)による地図XML→GeoJSON変換パイプライン。GDALと公式コンバータ`mojxml2geojson`に依存する。

両者は`frontend/public/data/`(index.json + geojsonファイル群)を境界として疎結合。converterはフロントエンドの実装を知らず、フロントエンドはPython側の処理を知らない。

## セットアップ

### frontend

```bash
cd frontend
npm install
npm run dev
```

ブラウザで表示されたURLを開くとサンプルデータ(東京駅付近のダミー4筆)が確認できる。

本番ビルドは`npm run build`(`dist/`に出力)。

### converter

GDAL(Pythonバインディング込み)と`mojxml2geojson`は`pyproject.toml`に依存として書けない(システムのlibgdalバージョンに合わせる必要があるため)。以下の手順で事前準備する。

**Arch Linux**

```bash
sudo pacman -S --needed base-devel gdal
cd converter
uv add "gdal==$(gdal-config --version)"
uv add "mojxml2geojson @ git+https://github.com/digital-go-jp/mojxml2geojson.git"
uv run mojxml2geojson --help   # GDAL連携の疎通確認
```

**Debian/Ubuntu**

```bash
sudo apt install gdal-bin libgdal-dev
export CPLUS_INCLUDE_PATH=/usr/include/gdal
export C_INCLUDE_PATH=/usr/include/gdal
cd converter
uv add "gdal==$(gdal-config --version)"
uv add "mojxml2geojson @ git+https://github.com/digital-go-jp/mojxml2geojson.git"
```

**macOS**

```bash
brew install gdal
cd converter
uv add "gdal==$(gdal-config --version)"
uv add "mojxml2geojson @ git+https://github.com/digital-go-jp/mojxml2geojson.git"
```

準備が済んだら依存関係を同期する。

```bash
cd converter
uv sync
```

## データ追加フロー

1. [G空間情報センター](https://front.geospatial.jp/)(要無料登録)から対象市区町村の登記所備付地図データzipを手動ダウンロードし、`converter/raw/<自治体名>/`に配置する。
2. 変換パイプラインを実行する。

   ```bash
   cd converter
   uv run chiban-convert all
   ```

   `all`は`extract`(zip解凍) → `convert`(mojxml2geojson実行) → `merge`(公共座標系/任意座標系の振分けとマージ) → `index`(index.json生成)を順に実行する。個別に実行することもできる。

   `--raw-dir`/`--out-dir`でパスを上書きできる(既定値はconverterパッケージの位置から自動解決されるため、リポジトリのどのディレクトリから実行しても正しく`converter/raw`と`frontend/public/data`を指す)。

3. `frontend/public/data/`が更新されるので、`cd frontend && npm run dev`で表示を確認する。

`converter/raw/`以下のzipと展開済みディレクトリは`.gitignore`対象。コミットされるのは変換結果(`frontend/public/data/`)のみ。

## 座標系についての注意

登記所備付地図データには公共座標系(経緯度に変換可能)と任意座標系(公図由来、図郭ごとに原点がバラバラのローカル座標)の2種類が混在する。任意座標系のデータは経緯度に変換できないため、地図には自動表示しない。`index.json`では`coordinateSystem: "arbitrary"`として区別され、`bbox`は`null`になる。

## 出典表記(必須)

- 背景写真: 国土地理院 シームレス空中写真 (https://maps.gsi.go.jp/development/ichiran.html)
- 地番データ: 法務省 登記所備付地図データ

いずれも`frontend/index.html`の`#attribution-note`に既定で表示している。データや表示方法を変更する場合もこの出典表記は削除しないこと。
