// Thin alias for the dictionary router wired in `wiring.ts`. Keeps
// `index.ts` import (`import { developers } from './routes/developers'`) stable.
export { developersRouter as developers } from '../wiring';
