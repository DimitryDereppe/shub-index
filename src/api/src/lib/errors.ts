export class HttpClientError extends Error {
  status: number;
  name;

  constructor(message: string, { status }: { status: number }) {
    super(message);
    this.name = this.constructor.name; // retrouve le nom de la classe depuis le contructeur
    this.status = status;
  }
}

export class BadRequestError extends HttpClientError {
  constructor(message: string) {
    super(message, { status: 400 });
  }
}

export class UnauthorizedError extends HttpClientError {
  constructor(message: string) {
    super(message, { status: 401 });
  }
}

export class ForbiddenError extends HttpClientError {
  constructor(message: string) {
    super(message, { status: 403 });
  }
}

export class NotFoundError extends HttpClientError {
  constructor(message: string) {
    super(message, { status: 404 });
  }
}

export class ConflictError extends HttpClientError {
  constructor(message: string) {
    super(message, { status: 409 });
  }
}

// 502 : un service EXTERNE (TMDB) n'a pas répondu correctement. Ce n'est pas une erreur
// du client, mais on la range ici pour profiter du même traitement dans global-error-handler.
export class BadGatewayError extends HttpClientError {
  constructor(message: string) {
    super(message, { status: 502 });
  }
}
