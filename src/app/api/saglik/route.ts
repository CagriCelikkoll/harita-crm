// GET /api/saglik — oturumsuz sağlık ucu. Dışarıya yalnızca { durum } (200 ok / 503 sorunlu); ayrıntı yalnızca
// sunucunun kendisinden gelen isteğe (src/server/servisler/saglik.ts → yerelIstekMi). Ayrıntıda da gizli değer yok.
import { saglikDegerlendir, saglikGirdisiTopla, yerelIstekMi } from "@/server/servisler/saglik";

export function GET(request: Request) {
  const sonuc = saglikDegerlendir(saglikGirdisiTopla());
  const govde = yerelIstekMi(request.headers) ? sonuc : { durum: sonuc.durum };
  return Response.json(govde, {
    status: sonuc.durum === "ok" ? 200 : 503,
    headers: { "Cache-Control": "no-store" },
  });
}
