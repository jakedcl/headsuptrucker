import { cleanPlaceQuery, searchPlaces } from "@/lib/geocode";

export async function GET(request: Request) {
  const query = cleanPlaceQuery(new URL(request.url).searchParams.get("q"));
  if (query.length < 2) return Response.json({ places: [] });
  try {
    return Response.json({ places: await searchPlaces(query, 6) });
  } catch {
    return Response.json({ error: "Place suggestions are unavailable right now." }, { status: 503 });
  }
}
