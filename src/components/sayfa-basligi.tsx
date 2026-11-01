// Sayfa başlığı: h1 ve bir cümlelik açıklama (her sayfada zorunlu), sağda isteğe bağlı eylemler.
export function SayfaBasligi({ baslik, aciklama, children }: { baslik: string; aciklama: string; children?: React.ReactNode }) {
  return (
    <header className="mb-8 flex flex-wrap items-end justify-between gap-4">
      <div className="flex min-w-0 flex-col gap-1.5">
        <h1 className="baslik">{baslik}</h1>
        <p className="text-[15px] text-soluk">{aciklama}</p>
      </div>
      {children && <div className="flex flex-wrap gap-2">{children}</div>}
    </header>
  );
}
