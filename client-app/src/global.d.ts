declare module 'zpst-crypto-sdk?client' {
  import * as all from 'zpst-crypto-sdk'
  export = all
}

declare module '@aztec/bb.js?client' {
  import * as all from '@aztec/bb.js'
  export = all
}


// fallback
declare module '*?client'
declare module '*?server'
