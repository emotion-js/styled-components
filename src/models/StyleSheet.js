// @flow
import React from 'react'
import { StyleSheet as EmotionStyleSheet } from '@emotion/sheet'
import {
  IS_BROWSER,
  DISABLE_SPEEDY,
  SC_ATTR,
  SC_STREAM_ATTR,
} from '../constants'
import { wrapAsElement, wrapAsHtmlTag } from './StyleTags'
import getNonce from '../utils/nonce'

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
  inserted: { [string]: string | boolean }
  registered: { [string]: string }
  capacity: number
  sheet: EmotionStyleSheet
  clones: Array<StyleSheet>

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
    this.clones = []
    this.sheet = new EmotionStyleSheet({
      key: 'styled',
      // $FlowFixMe
      nonce: getNonce() !== null ? getNonce() : undefined,
    })
    if (IS_BROWSER) {
      this.sheet.inject()
    }
  }

  /* rehydrate all SSR'd style tags */
  rehydrate() {
    if (!IS_BROWSER || this.forceServer) {
      return this
    }
    /* retrieve all of our SSR style elements from the DOM */
    const nodes = document.querySelectorAll(`style[${SC_ATTR}]`)
    const nodesSize = nodes.length

    /* abort rehydration if no previous style tags were found */
    if (nodesSize === 0) {
      return this
    }

    for (let i = 0; i < nodesSize; i += 1) {
      // $FlowFixMe: We can trust that all elements in this query are style elements
      const el = (nodes[i]: HTMLStyleElement)
      if (el.getAttribute(SC_STREAM_ATTR)) {
        // $FlowFixMe
        this.target.appendChild(el)
      }
      const elNames = (el.getAttribute(SC_ATTR) || '').trim().split(/\s+/)
      elNames.forEach(name => {
        this.addNameToCache(name, true)
      })
    }
    return this
  }

  /* retrieve a "master" instance of StyleSheet which is typically used when no other is available
   * The master StyleSheet is targeted by injectGlobal, keyframes, and components outside of any
    * StyleSheetManager's context */
  static get master(): StyleSheet {
    return master || (master = new StyleSheet().rehydrate())
  }

  /* NOTE: This is just for backwards-compatibility with jest-styled-components */
  static get instance(): StyleSheet {
    return StyleSheet.master
  }

  /* reset the internal "master" instance */
  static reset(forceServer?: boolean = false) {
    master = new StyleSheet(undefined, forceServer).rehydrate()
  }
  /* adds "children" to the StyleSheet that inherit all of the parents' rules
   * while their own rules do not affect the parent */
  clone() {
    const sheet = new StyleSheet(this.target, this.forceServer)
    /* add to clone array */
    this.clones.push(sheet)
    sheet.registered = this.registered
    sheet.inserted = { ...this.inserted }
    return sheet
  }
  /* check if a name's styles are inserted already */
  // TODO: rename this change change all the places it's used
  hasNameForId(name: string) {
    return this.inserted[name] !== undefined
  }

  addNameToCache(name: string, css: string | true) {
    this.inserted[name] = css
    this.clones.forEach(clone => {
      clone.addNameToCache(name, css)
    })
  }

  /* injects rules for a given id with a name that will need to be cached */
  inject(name: string, cssRules: string[]) {
    if (this.inserted[name] === undefined) {
      if (IS_BROWSER) {
        cssRules.forEach(rule => {
          this.sheet.insert(rule)
        })
      }
      this.addNameToCache(name, cssRules.join(''))
    }
  }

  /* removes all rules for a given id, which doesn't remove its marker but resets it */
  // remove(id: string) {
  //   const tag = this.tagMap[id]
  //   if (tag === undefined) return

  //   const { clones } = this
  //   for (let i = 0; i < clones.length; i += 1) {
  //     clones[i].remove(id)
  //   }

  //   /* remove all rules from the tag */
  //   tag.removeRules(id)
  //   /* ignore possible rehydrated names */
  //   this.ignoreRehydratedNames[id] = true
  //   /* delete possible deferred rules */
  //   delete this.deferred[id]
  // }

  toHTML() {
    const { css, ids } = this.toCSSAndIds()

    return wrapAsHtmlTag(css, ids)('')
  }

  toReactElements() {
    const { css, ids } = this.toCSSAndIds()
    return [React.cloneElement(wrapAsElement(css, ids), { key: '1' })]
  }
  toCSSAndIds() {
    let css = ''
    let ids = ''
    Object.keys(this.inserted).forEach(key => {
      ids += ` ${key}`
      // $FlowFixMe
      css += this.inserted[key]
    })
    return { css, ids: ids.substring(1) }
  }
}

export default StyleSheet
