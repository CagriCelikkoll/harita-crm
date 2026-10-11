export function SayfaBasligi({ baslik, aciklama, children }: { baslik: string; aciklama?: string; children?: React.ReactNode }) {
  return (
    <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="baslik">{baslik}</h1>
        {aciklama && <p className="mt-1 text-sm text-soluk">{aciklama}</p>}
      </div>
      {children}
    </header>
  );
}
