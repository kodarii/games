import {
  Dictionary,
  type DictionaryProps,
  type DictionaryRow,
  type DictionaryValidationError,
  NewDictionary,
} from '../dictionary/dictionary';
import type { Result } from '../shared/result';

const GENRE_KIND = 'genre' as const;
const GENRE_MAX_NAME_LENGTH = 40;

export type GenreKind = typeof GENRE_KIND;
export type GenreValidationError = DictionaryValidationError;
export type GenreProps = DictionaryProps;

export type Genre = Dictionary<GenreKind>;
export type NewGenre = NewDictionary<GenreKind>;

export const Genre = {
  fromPersistence(row: DictionaryRow): Genre {
    return Dictionary.fromPersistence(row, GENRE_KIND);
  },
} as const;

export const NewGenre = {
  create(
    props: GenreProps,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewGenre, GenreValidationError> {
    return NewDictionary.create(props, GENRE_KIND, GENRE_MAX_NAME_LENGTH, idGenerator);
  },
} as const;

export const GENRE_DICTIONARY_KIND = GENRE_KIND;
export const GENRE_NAME_MAX_LENGTH = GENRE_MAX_NAME_LENGTH;
