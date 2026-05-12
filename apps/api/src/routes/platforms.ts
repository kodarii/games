// Thin alias for the dictionary router wired in `wiring.ts`. Keeps
// `index.ts` import (`import { platforms } from './routes/platforms'`) stable.
export { platformsRouter as platforms } from '../wiring';
