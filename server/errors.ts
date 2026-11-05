export class DomainError extends Error {
  constructor(
    public status: number,
    public code: string,
    message: string,
  ) {
    super(message);
  }
}
export const notFound = () =>
  new DomainError(404, "NOT_FOUND", "No encontramos este recurso.");
