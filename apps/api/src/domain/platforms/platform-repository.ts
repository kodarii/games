import type { DictionaryRepository } from '../dictionary/dictionary';
import type { PlatformKind } from './platform';

export type PlatformRepository = DictionaryRepository<PlatformKind>;
