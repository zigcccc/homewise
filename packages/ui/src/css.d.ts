/**
 * Side-effect stylesheet imports. `map.tsx` pulls in Leaflet's own CSS, which the bundler resolves
 * and `tsc` otherwise refuses for want of a declaration. The app gets this from `vite/client`; this
 * package doesn't depend on vite, so it says it here.
 */
declare module '*.css';
