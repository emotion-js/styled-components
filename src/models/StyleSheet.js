// @flow
import { StyleSheet as EmotionStyleSheet } from '@emotion/sheet'
import { IS_BROWSER, DISABLE_SPEEDY } from '../constants'

/* determine the maximum number of components before tags are sharded */
// let MAX_SIZE
// if (IS_BROWSER) {
//   /* in speedy mode we can keep a lot more rules in a sheet before a slowdown can be expected */
//   MAX_SIZE = DISABLE_SPEEDY ? 40 : 1000
// } else {
//   /* for servers we do not need to shard at all */
//   MAX_SIZE = -1
// }

let sheetRunningId = 0
let master

class StyleSheet {
  id: number
  sealed: boolean
  forceServer: boolean
  target: ?HTMLElement
  inserted: { [string]: string }
  registered: { [string]: string }
  capacity: number
  sheet: EmotionStyleSheet

  constructor(
    target: ?HTMLElement = IS_BROWSER ? document.head : null,
    forceServer?: boolean = false
  ) {
    this.id = sheetRunningId += 1
    this.sealed = false
    this.forceServer = forceServer
    this.target = forceServer ? null : target
    this.inserted = {}
    this.registered = {}
    this.capacity = 1
    this.sheet = new EmotionStyleSheet({ key: 'styled' })
    if (IS_BROWSER) {
      this.sheet.inject()
    }
  }

  // /* rehydrate all SSR'd style tags */
  // rehydrate() {
  //   if (!IS_BROWSER || this.forceServer) {
  //     return this
  //   }

  //   const els = []
  //   const names = []
  //   let extracted = []
  //   let isStreamed = false

  //   /* retrieve all of our SSR style elements from the DOM */
  //   const nodes = document.querySelectorAll(`style[${SC_ATTR}]`)
  //   const nodesSize = nodes.length

  //   /* abort rehydration if no previous style tags were found */
  //   if (nodesSize === 0) {
  //     return this
  //   }

  //   for (let i = 0; i < nodesSize; i += 1) {
  //     // $Flow FixMe: We can trust that all elements in this query are style elements
  //     const el = (nodes[i]: HTMLStyleElement)

  //     /* check if style tag is a streamed tag */
  //     isStreamed = !!el.getAttribute(SC_STREAM_ATTR) || isStreamed

  //     /* retrieve all component names */
  //     const elNames = (el.getAttribute(SC_ATTR) || '').trim().split(/\s+/)
  //     const elNamesSize = elNames.length
  //     for (let j = 0; j < elNamesSize; j += 1) {
  //       const name = elNames[j]
  //       /* add rehydrated name to sheet to avoid readding styles */
  //       this.rehydratedNames[name] = true
  //       names.push(name)
  //     }

  //     /* extract all components and their CSS */
  //     extracted = extracted.concat(extractComps(el.textContent))
  //     /* store original HTMLStyleElement */
  //     els.push(el)
  //   }

  //   /* abort rehydration if nothing was extracted */
  //   const extractedSize = extracted.length
  //   if (extractedSize === 0) {
  //     return this
  //   }

  //   /* reset capacity and adjust MAX_SIZE by the initial size of the rehydration */
  //   this.capacity = Math.max(1, MAX_SIZE - extractedSize)

  //   return this
  // }

  /* retrieve a "master" instance of StyleSheet which is typically used when no other is available
   * The master StyleSheet is targeted by injectGlobal, keyframes, and components outside of any
    * StyleSheetManager's context */
  static get master(): StyleSheet {
    return master || (master = new StyleSheet())
  }

  /* NOTE: This is just for backwards-compatibility with jest-styled-components */
  static get instance(): StyleSheet {
    return StyleSheet.master
  }

  /* reset the internal "master" instance */
  static reset(forceServer?: boolean = false) {
    master = new StyleSheet(undefined, forceServer) // .rehydrate()
  }

  /* caching layer checking id+name to already have a corresponding tag and injected rules */
  hasNameForId(name: string) {
    return this.inserted[name] !== undefined
  }

  /* injects rules for a given id with a name that will need to be cached */
  inject(name: string, cssRules: string[]) {
    if (this.inserted[name] === undefined) {
      cssRules.forEach(rule => {
        this.sheet.insert(rule)
      })
      this.inserted[name] = cssRules.join('')
    }
  }

  /* removes all rules for a given id, which doesn't remove its marker but resets it */
  remove(id: string) {
    const tag = this.tagMap[id]
    if (tag === undefined) return

    const { clones } = this
    for (let i = 0; i < clones.length; i += 1) {
      clones[i].remove(id)
    }

    /* remove all rules from the tag */
    tag.removeRules(id)
    /* ignore possible rehydrated names */
    this.ignoreRehydratedNames[id] = true
    /* delete possible deferred rules */
    delete this.deferred[id]
  }

  // toHTML() {
  //   return this.tags.map(tag => tag.toHTML()).join('')
  // }

  // toReactElements() {
  //   const { id } = this

  //   return this.tags.map((tag, i) => {
  //     const key = `sc-${id}-${i}`
  //     return cloneElement(tag.toElement(), { key })
  //   })
  // }
}

export default StyleSheet
