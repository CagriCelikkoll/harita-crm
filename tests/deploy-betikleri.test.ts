// deploy/*.sh betikleri: sözdizimi (bash -n) ve guncelle.sh'ın davranışı. guncelle.sh, PATH'in başına konan sahte
// komutlarla (id, sudo, git, npm, systemctl, curl, sleep) çalıştırılır; gerçek git, npm ya da systemd çağrılmaz,
// sunucuya ya da ağa dokunulmaz. bash bulunamazsa testler atlanır.
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";

const KOK = path.resolve(__dirname, "..");
const DEPLOY = path.join(KOK, "deploy");
const BETIKLER = fs.readdirSync(DEPLOY).filter((d) => d.endsWith(".sh"));

const bashVar = (() => {
  const r = spawnSync("bash", ["-c", "echo tamam"], { encoding: "utf8" });
  return r.status === 0 && r.stdout.trim() === "tamam";
})();

// Windows'ta (Git Bash) yollar /c/... biçimine çevrilir; Linux'ta olduğu gibi kalır.
const YOL = `yol() { cygpath -u "$1" 2>/dev/null || printf '%s' "$1"; }`;

const SAHTE: Record<string, string> = {
  id: `echo 0`,
  sudo: `while [ "$#" -gt 0 ] && [ "$1" != "--" ]; do shift; done; shift; exec "$@"`,
  systemctl: `echo "systemctl $*" >> "$KAYIT"`,
  sleep: `exit 0`,
  curl: `printf '%s' '{"durum":"ok","kontroller":[{"ad":"veritabani","durum":"ok"}]}'`,
  git: `echo "git $1 [$(pwd)]" >> "$KAYIT"
case "$1" in
  status) exit 0 ;;
  rev-parse)
    case "$*" in
      *--short*) echo kisa ;;
      *HEAD*) echo eski1111 ;;
      *) echo yeni2222 ;;
    esac ;;
esac
exit 0`,
  npm: `if [ "$1 $2" = "run build" ]; then
  girdi="$(cat)"
  n=$(( $(cat "$SAYAC" 2>/dev/null || echo 0) + 1 )); echo "$n" > "$SAYAC"
  echo "npm run build #$n girdi=[$girdi]" >> "$KAYIT"
  case "$DERLEME_HATA" in
    hepsi) exit 1 ;;
    ilk) [ "$n" -eq 1 ] && exit 1 ;;
  esac
  exit 0
fi
echo "npm $*" >> "$KAYIT"
exit 0`,
};

const geciciler: string[] = [];
afterEach(() => {
  for (const d of geciciler.splice(0)) fs.rmSync(d, { recursive: true, force: true });
});

function guncelleCalistir(derlemeHata: "" | "ilk" | "hepsi") {
  const dizin = fs.mkdtempSync(path.join(os.tmpdir(), "guncelle-"));
  geciciler.push(dizin);
  const sahte = path.join(dizin, "bin");
  fs.mkdirSync(sahte);
  for (const [ad, govde] of Object.entries(SAHTE)) {
    fs.writeFileSync(path.join(sahte, ad), `#!/usr/bin/env bash\n${govde}\n`, { mode: 0o755 });
  }
  const kayit = path.join(dizin, "kayit.txt");
  const calisma = path.join(dizin, "baska-klasor");
  fs.mkdirSync(calisma);
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    SAHTE_DIZIN: sahte,
    BETIK: path.join(DEPLOY, "guncelle.sh"),
    KOK_DIZIN: KOK,
    KAYIT: kayit,
    SAYAC: path.join(dizin, "sayac"),
    DERLEME_HATA: derlemeHata,
  };
  delete env.UYGULAMA_DIZINI;
  const komut = `${YOL}
export KAYIT="$(yol "$KAYIT")" SAYAC="$(yol "$SAYAC")"
echo "kok [$(cd "$(yol "$KOK_DIZIN")" && pwd)]" >> "$KAYIT"
export PATH="$(yol "$SAHTE_DIZIN"):$PATH"
exec bash "$(yol "$BETIK")"`;
  // Girdi bir terminal gibi doludur: derleme bunu okursa menü açılabilirdi demektir.
  const r = spawnSync("bash", ["-c", komut], { cwd: calisma, env, input: "TERMINAL-GIRDISI\n", encoding: "utf8" });
  const satirlar = fs.readFileSync(kayit, "utf8").trim().split("\n");
  return { durum: r.status, cikti: r.stdout + r.stderr, satirlar };
}

// Windows'ta (Git Bash) her süreç başlatma yavaştır: normalde ~10 sn süren test, makine yüklüyken 60 sn'yi aşabiliyordu.
const SURE = 180_000;

describe("deploy betikleri", { timeout: SURE }, () => {
  it.skipIf(!bashVar).each(BETIKLER)("%s sözdizimi geçerli (bash -n)", (ad) => {
    const r = spawnSync("bash", ["-n", ad], { cwd: DEPLOY, encoding: "utf8" });
    expect(r.stderr).toBe("");
    expect(r.status).toBe(0);
  });

  it.skipIf(!bashVar)("guncelle.sh başka klasörden çağrılınca kendi uygulama klasörüne geçer; derleme girdisi boştur", () => {
    const { durum, cikti, satirlar } = guncelleCalistir("");
    expect(durum, cikti).toBe(0);
    expect(cikti).toContain("== Tamam");
    const kok = satirlar[0].match(/^kok \[(.*)\]$/)![1];
    const gitSatirlari = satirlar.filter((s) => s.startsWith("git "));
    expect(gitSatirlari.length).toBeGreaterThan(0);
    for (const s of gitSatirlari) expect(s).toContain(`[${kok}]`);
    // < /dev/null: derleme terminal girdisini görmez, yükseltme menüsü açılamaz.
    expect(satirlar).toContain("npm run build #1 girdi=[]");
    expect(satirlar).toContain("systemctl start harita-worker harita-web");
  });

  it.skipIf(!bashVar)("yeni sürüm derlenemezse eski sürüme döner, derler ve başlatır", () => {
    const { durum, cikti, satirlar } = guncelleCalistir("ilk");
    expect(durum).toBe(1);
    expect(cikti).toContain("HATA: derleme");
    expect(satirlar).toContain("npm run build #2 girdi=[]");
    const reset = satirlar.findIndex((s) => s.startsWith("git reset"));
    const baslat = satirlar.indexOf("systemctl start harita-worker harita-web");
    expect(reset).toBeGreaterThan(-1);
    expect(baslat).toBeGreaterThan(reset);
    expect(cikti).toContain("Eski sürüm çalışıyor");
  });

  it.skipIf(!bashVar)("eski sürüm de derlenemezse servisler yine de başlatılır", () => {
    const { durum, cikti, satirlar } = guncelleCalistir("hepsi");
    expect(durum).toBe(1);
    expect(cikti).toContain("eski sürüme dönüşte de hata çıktı (derleme)");
    const ikinciDerleme = satirlar.findIndex((s) => s.startsWith("npm run build #2"));
    const baslat = satirlar.indexOf("systemctl start harita-worker harita-web");
    expect(ikinciDerleme).toBeGreaterThan(-1);
    expect(baslat).toBeGreaterThan(ikinciDerleme);
    // Migration hiç çalışmaz: veritabanı değişmez.
    expect(satirlar.some((s) => s.includes("db:migrate"))).toBe(false);
  });
});
