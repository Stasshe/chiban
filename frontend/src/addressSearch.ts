// Geocoding via GSI's public address search API (no API key required).

interface AddressSearchResult {
  geometry: {
    coordinates: [number, number];
    type: string;
  };
  properties: {
    title: string;
  };
  type: string;
}

/**
 * Resolves a Japanese address string to [lon, lat] using the GSI address
 * search API. Returns null if no match was found.
 */
export async function geocodeAddress(query: string): Promise<[number, number] | null> {
  const url = `https://msearch.gsi.go.jp/address-search/AddressSearch?q=${encodeURIComponent(query)}`;
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Geocoding request failed: ${response.status}`);
  }
  const results = (await response.json()) as AddressSearchResult[];
  if (results.length === 0) {
    return null;
  }
  return results[0].geometry.coordinates;
}
