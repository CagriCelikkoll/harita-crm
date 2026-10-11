// Çok süreçli kota testi için işçi: aynı SQLite dosyasında, verilen andan itibaren mümkün olduğunca hızlı
// kota ayırmayı dener ve başarılı ayırma sayısını yazdırır.
// Kullanım: tsx kota-isci.ts <tenantId> <deneme> <baslangicMs>   (DATABASE_PATH ortam değişkeniyle)
import { _baglamDamgala } from "../../src/server/repo/baglam";
import { kotaAyir } from "../../src/server/repo/kullanim";

const [tenantId, denemeMetni, baslangicMetni] = process.argv.slice(2);
const ctx = _baglamDamgala({ tenantId, userId: "isci", rol: "uye" });

// Tüm işçiler aynı anda başlasın diye ortak başlangıç anını bekle.
while (Date.now() < Number(baslangicMetni)) {
  /* meşgul bekleme */
}
let basarili = 0;
for (let i = 0; i < Number(denemeMetni); i++) if (kotaAyir(ctx, 1)) basarili++;
console.log(basarili);
