import {
  Dictionary,
  type DictionaryProps,
  type DictionaryRow,
  type DictionaryValidationError,
  NewDictionary,
} from '../dictionary/dictionary';
import type { Result } from '../shared/result';

const DEVELOPER_KIND = 'developer' as const;
const DEVELOPER_MAX_NAME_LENGTH = 60;

export type DeveloperKind = typeof DEVELOPER_KIND;
export type DeveloperValidationError = DictionaryValidationError;
export type DeveloperProps = DictionaryProps;

export type Developer = Dictionary<DeveloperKind>;
export type NewDeveloper = NewDictionary<DeveloperKind>;

export const Developer = {
  fromPersistence(row: DictionaryRow): Developer {
    return Dictionary.fromPersistence(row, DEVELOPER_KIND);
  },
} as const;

export const NewDeveloper = {
  create(
    props: DeveloperProps,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewDeveloper, DeveloperValidationError> {
    return NewDictionary.create(props, DEVELOPER_KIND, DEVELOPER_MAX_NAME_LENGTH, idGenerator);
  },
} as const;

export const DEVELOPER_DICTIONARY_KIND = DEVELOPER_KIND;
export const DEVELOPER_NAME_MAX_LENGTH = DEVELOPER_MAX_NAME_LENGTH;
