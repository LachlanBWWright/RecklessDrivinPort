import { fromPromise, fromThrowable } from 'neverthrow';

export const getErrorMessage = (error: unknown, fallback: string) =>
  error instanceof Error && error.message.length > 0
    ? error.message
    : typeof error === 'string' && error.length > 0
      ? error
      : fallback;

export const resultFromPromise = <T>(promise: Promise<T>, fallback: string) =>
  fromPromise(promise, (error) => getErrorMessage(error, fallback));

export const resultFromThrowable = <Args extends readonly unknown[], ReturnValue>(
  fn: (...args: Args) => ReturnValue,
  fallback: string,
) => fromThrowable(fn, (error) => getErrorMessage(error, fallback));

export const delay = (ms: number) =>
  new Promise<void>((resolve) => {
    setTimeout(resolve, ms);
  });
