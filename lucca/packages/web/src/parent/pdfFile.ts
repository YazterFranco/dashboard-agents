const MAX_PDF_BYTES = 5 * 1024 * 1024;

/** Lo que se puede saber del archivo antes de enviarlo; null si parece un PDF razonable. */
export function checkPdf(file: File): string | null {
  const isPdf = file.type === 'application/pdf' || /\.pdf$/i.test(file.name);
  if (!isPdf) return 'Elige el PDF de la agenda (un archivo que termina en .pdf).';
  if (file.size > MAX_PDF_BYTES) return 'El PDF pesa más de 5 MB';
  return null;
}
