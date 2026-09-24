/** Comparaison souple : « sequence » doit trouver « séquence ». */
export function foldText(value: string): string {
  return value
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase();
}

export const matches = (haystack: string, needle: string) =>
  foldText(haystack).includes(foldText(needle));
