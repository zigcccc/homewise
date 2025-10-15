export class ErrorsService {
  public static createRootError(message: string, code = 'bad_data') {
    return [{ origin: '_root', code, path: [], message }];
  }
}
