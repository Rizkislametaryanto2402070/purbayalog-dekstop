export class ValidationError extends Error {
  /** @param {Record<string,string>} errors pesan per field */
  constructor(errors) {
    super(Object.values(errors)[0] || 'Data tidak valid.');
    this.name = 'ValidationError';
    this.errors = errors;
  }
}
export class NotFoundError extends Error {
  constructor(message = 'Data tidak ditemukan. Mungkin sudah dihapus.') { super(message); this.name = 'NotFoundError'; }
}
export class ExportError extends Error {
  constructor(message) { super(message); this.name = 'ExportError'; }
}
export class BackupError extends Error {
  constructor(message) { super(message); this.name = 'BackupError'; }
}
