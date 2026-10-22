export class AppError extends Error {
  /**
   * @param {number} status HTTP status code (e.g., 400, 404, 500)
   * @param {string} code   Application‑specific error code
   * @param {string} message Human‑readable message
   */
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    // Preserve proper name for debugging
    this.name = "AppError";
  }
}

