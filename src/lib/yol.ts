/** Yönlendirme hedefini yalnızca site içi yollarla sınırlar (açık yönlendirme engeli). */
export function guvenliYol(yol: string | null | undefined, varsayilan = "/panel") {
  return yol && yol.startsWith("/") && !yol.startsWith("//") && !yol.startsWith("/\\") ? yol : varsayilan;
}
