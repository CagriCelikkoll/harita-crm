// Regresyon: tablo yeniden oluşturan migration'lar (0001: scans) bağlı tablolardaki verilere dokunmamalı.
// Yabancı anahtarlar açıkken DROP TABLE scans, leads.scan_id'yi (ON DELETE SET NULL) sessizce boşaltıyordu.
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterAll, describe, expect, it } from "vitest";
import { veritabaniAc } from "@/server/db";
import { migrasyonlariUygula } from "@/server/db/migrasyon";

const DRIZZLE = path.resolve(__dirname, "../drizzle");
const gecici = fs.mkdtempSync(path.join(os.tmpdir(), "harita-crm-migrasyon-"));
afterAll(() => fs.rmSync(gecici, { recursive: true, force: true }));

/** drizzle/ klasörünün yalnızca ilk n migration'ını içeren kopyası. */
function ilkMigrasyonlar(n: number) {
  const hedef = path.join(gecici, `ilk-${n}`);
  fs.mkdirSync(path.join(hedef, "meta"), { recursive: true });
  const gunluk = JSON.parse(fs.readFileSync(path.join(DRIZZLE, "meta/_journal.json"), "utf8"));
  gunluk.entries = gunluk.entries.slice(0, n);
  fs.writeFileSync(path.join(hedef, "meta/_journal.json"), JSON.stringify(gunluk));
  for (const g of gunluk.entries) fs.copyFileSync(path.join(DRIZZLE, `${g.tag}.sql`), path.join(hedef, `${g.tag}.sql`));
  return hedef;
}

describe("migration'lar", () => {
  it("0001 (scans yeniden oluşturma) kayıtların tarama bağlantısını ve verileri korur", () => {
    const db = veritabaniAc(path.join(gecici, "eski.db"));
    const s = db.$client;
    migrasyonlariUygula(db, ilkMigrasyonlar(1)); // yalnızca 0000

    s.prepare("insert into user (id, name, email) values ('u1', 'Test', 't@ornek.test')").run();
    s.prepare("insert into tenants (id, ad, slug) values ('t1', 'T', 't')").run();
    s.prepare(
      "insert into scans (id, tenant_id, olusturan, merkez_lat, merkez_lng, yaricap_m, kategori, durum) values ('s1', 't1', 'u1', 41, 29, 3000, 'kafe', 'tamamlandi')",
    ).run();
    for (let i = 0; i < 5; i++) {
      s.prepare("insert into leads (id, tenant_id, place_id, scan_id) values (?, 't1', ?, 's1')").run(`l${i}`, `p${i}`);
    }

    migrasyonlariUygula(db, DRIZZLE); // kalan migration'lar

    expect(s.prepare("select count(*) n from leads where scan_id = 's1'").get()).toEqual({ n: 5 });
    expect(s.prepare("select merkez_kaynagi, merkez_lat, adres_metni from scans where id = 's1'").get()).toEqual({
      merkez_kaynagi: "harita",
      merkez_lat: 41,
      adres_metni: null,
    });
    expect(s.pragma("foreign_keys", { simple: true })).toBe(1);
    expect(s.pragma("foreign_key_check")).toEqual([]);
    s.close();
  });
});
