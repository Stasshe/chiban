// Shared type definitions for the chiban (parcel lookup) frontend.

/** Coordinate system classification of a parcel dataset entry. */
export type CoordinateSystem = "public" | "approximate" | "arbitrary";

/** Bounding box in [minLon, minLat, maxLon, maxLat] order (WGS84). */
export type BBox = [number, number, number, number];

/** One entry of frontend/public/data/index.json, describing a single GeoJSON dataset file. */
export interface IndexEntry {
  id: string;
  cityCode: string;
  cityName: string;
  coordinateSystem: CoordinateSystem;
  file: string;
  featureCount: number;
  bbox: BBox | null;
}

/** Top-level structure of frontend/public/data/index.json. */
export interface DataIndex {
  generatedAt: string;
  entries: IndexEntry[];
}

/**
 * Properties present on parcel features produced by mojxml2geojson.
 * Chime (地目 / land category) is intentionally absent: the source
 * chizu XML format does not carry it.
 */
export interface ParcelProperties {
  筆ID?: string;
  version?: string;
  座標系?: string;
  測地系判別?: string;
  地図名?: string;
  地図番号?: string;
  縮尺分母?: string;
  市区町村コード?: string;
  市区町村名?: string;
  大字コード?: string;
  丁目コード?: string;
  小字コード?: string;
  予備コード?: string;
  大字名?: string;
  丁目名?: string;
  小字名?: string;
  予備名?: string;
  地番?: string;
  精度区分?: string;
  座標値種別?: string;
  筆界未定構成筆?: string;
  代表点緯度?: string;
  代表点経度?: string;
  /** Present only on features that went through the arbitrary-coordinate georeferencing fallback. */
  位置精度?: string;
}
