// The entry of folio-web.mjs.
import { main } from './cli'

declare const __FOLIO_VERSION__: string
void main(process.argv.slice(2), __FOLIO_VERSION__)
