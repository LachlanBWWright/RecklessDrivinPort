export const bindAppAction = <TApp, Args extends readonly unknown[], Result>(
  app: TApp,
  action: (app: TApp, ...args: Args) => Result,
) => (...args: Args) => action(app, ...args);
