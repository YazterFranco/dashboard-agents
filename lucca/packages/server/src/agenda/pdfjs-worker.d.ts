// pdf.js publica el worker sin tipos; aquí solo se registra como «worker falso» en Node.
declare module 'pdfjs-dist/legacy/build/pdf.worker.mjs' {
  export const WorkerMessageHandler: unknown;
}
