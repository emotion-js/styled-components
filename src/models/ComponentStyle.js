// @flow
import hashStr from '../vendor/glamor/hash'
import type { RuleSet, NameGenerator, Flattener, Stringifier } from '../types'
import { IS_BROWSER } from '../constants'
import isStyledComponent from '../utils/isStyledComponent'
import StyleSheet from './StyleSheet'

const areStylesCacheable = IS_BROWSER

const isStaticRules = (rules: RuleSet, attrs?: Object): boolean => {
  for (let i = 0; i < rules.length; i += 1) {
    const rule = rules[i]

    // recursive case
    if (Array.isArray(rule) && !isStaticRules(rule)) {
      return false
    } else if (typeof rule === 'function' && !isStyledComponent(rule)) {
      // functions are allowed to be static if they're just being
      // used to get the classname of a nested styled copmonent
      return false
    }
  }

  if (attrs !== undefined) {
    // eslint-disable-next-line guard-for-in, no-restricted-syntax
    for (const key in attrs) {
      const value = attrs[key]
      if (typeof value === 'function') {
        return false
      }
    }
  }

  return true
}

const isHRMEnabled =
  typeof module !== 'undefined' &&
  module.hot &&
  process.env.NODE_ENV !== 'production'

/*
 ComponentStyle is all the CSS-specific stuff, not
 the React-specific stuff.
 */
export default (
  nameGenerator: NameGenerator,
  flatten: Flattener,
  stringifyRules: Stringifier
) => {
  /* combines hashStr (murmurhash) and nameGenerator for convenience */
  const generateRuleHash = (str: string) => nameGenerator(hashStr(str))

  class ComponentStyle {
    rules: RuleSet
    componentId: string
    isStatic: boolean
    lastClassName: ?string
    static generateName: string => string
    constructor(rules: RuleSet, attrs?: Object) {
      this.rules = rules
      this.isStatic = !isHRMEnabled && isStaticRules(rules, attrs)
    }

    generateAndInjectStyles(
      executionContext: Object,
      styleSheet: StyleSheet,
      registeredStylesFromClassName?: Array<string>
    ) {
      const { isStatic, lastClassName } = this
      if (
        areStylesCacheable &&
        isStatic &&
        lastClassName !== undefined &&
        (registeredStylesFromClassName === undefined ||
          registeredStylesFromClassName.length === 0)
      ) {
        return lastClassName
      }

      const flatCSS = flatten(
        // $FlowFixMe
        this.rules.concat(registeredStylesFromClassName),
        executionContext
      )
      const joinedCSS = flatCSS.join('')
      const name = generateRuleHash(joinedCSS)

      if (!styleSheet.hasNameForId(name)) {
        styleSheet.registered[name] = joinedCSS
        styleSheet.inject(name, stringifyRules(flatCSS, `.${name}`))
      }
      this.lastClassName = name
      return name
    }
  }
  ComponentStyle.generateName = generateRuleHash

  return ComponentStyle
}
