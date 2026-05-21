// Re-eksport typu domeny pod application aliasem.
// Routes używają tylko tego importu — bez bezpośredniego dotykania domain/.
export type { DictionaryKind } from '../../domain/dictionary/dictionary';
