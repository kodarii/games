import type { Developer, NewDeveloper } from './developer';

export interface DeveloperRepository {
  list(userId: string): Promise<Developer[]>;
  findById(id: number): Promise<Developer | null>;
  findByName(userId: string, name: string): Promise<Developer | null>;
  create(developer: NewDeveloper): Promise<Developer>;
  delete(id: number): Promise<Developer | null>;
}
