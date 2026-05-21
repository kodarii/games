import { Application } from './app';

const port = Number(process.env.PORT ?? 3001);
const app = new Application();
void app.start(port);
