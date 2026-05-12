import type { DictionaryRepository } from '../dictionary/dictionary';
import type { GenreKind } from './genre';

export type GenreRepository = DictionaryRepository<GenreKind>;
