export function truncate(str: string, max: number): string {
  return str.length > max ? str.slice(0, max - 1) + '…' : str;
}

export function formatNumber(n: number): string {
  return n.toLocaleString('fr-FR');
}
