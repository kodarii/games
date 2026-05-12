// Thin alias for the dictionary router wired in `wiring.ts`. Keeps
// `index.ts` import (`import { genres } from './routes/genres'`) stable.
export { genresRouter as genres } from '../wiring';
