import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';

/** Erreurs au format RFC 7807 (application/problem+json). */
@Catch()
export class ProblemDetailsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse();
    const req = http.getRequest();
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    const detail = exception instanceof HttpException ? exception.message : 'Erreur interne';
    res
      .status(status)
      .type('application/problem+json')
      .json({ type: 'about:blank', title: HttpStatus[status] ?? 'Error', status, detail, instance: req.url });
  }
}
