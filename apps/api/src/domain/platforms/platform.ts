import {
  Dictionary,
  type DictionaryProps,
  type DictionaryRow,
  type DictionaryValidationError,
  NewDictionary,
} from '../dictionary/dictionary';
import type { Result } from '../shared/result';

const PLATFORM_KIND = 'platform' as const;
const PLATFORM_MAX_NAME_LENGTH = 40;

export type PlatformKind = typeof PLATFORM_KIND;
export type PlatformValidationError = DictionaryValidationError;
export type PlatformProps = DictionaryProps;

export type Platform = Dictionary<PlatformKind>;
export type NewPlatform = NewDictionary<PlatformKind>;

export const Platform = {
  fromPersistence(row: DictionaryRow): Platform {
    return Dictionary.fromPersistence(row, PLATFORM_KIND);
  },
} as const;

export const NewPlatform = {
  create(
    props: PlatformProps,
    idGenerator: () => string = () => crypto.randomUUID(),
  ): Result<NewPlatform, PlatformValidationError> {
    return NewDictionary.create(props, PLATFORM_KIND, PLATFORM_MAX_NAME_LENGTH, idGenerator);
  },
} as const;

export const PLATFORM_DICTIONARY_KIND = PLATFORM_KIND;
export const PLATFORM_NAME_MAX_LENGTH = PLATFORM_MAX_NAME_LENGTH;
