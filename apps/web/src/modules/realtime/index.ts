// Queries only. `./components` is deliberately NOT re-exported: it reaches `realtime.client.ts`,
// which opens a WebSocket the moment the module is evaluated. `_onboarded`'s `beforeLoad` imports
// this barrel for the channel query, so anything re-exported here lands in the main bundle and the
// socket would open for signed-out visitors too. The provider is imported from
// `@/modules/realtime/components` by that route's *component*, which keeps it in the split chunk.
export * from './realtime.queries';
