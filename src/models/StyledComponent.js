// @flow
/* eslint-disable react/prop-types */
import { Component, createElement } from 'react'
import PropTypes from 'prop-types'
import { getRegisteredStyles } from '@emotion/utils'

import type { Theme } from './ThemeProvider'
import createWarnTooManyClasses from '../utils/createWarnTooManyClasses'

import validAttr from '../utils/validAttr'
import isTag from '../utils/isTag'
import isStyledComponent from '../utils/isStyledComponent'
import getComponentName from '../utils/getComponentName'
import determineTheme from '../utils/determineTheme'
import escape from '../utils/escape'
import type { RuleSet, Target } from '../types'
import { CONTEXT_KEY } from '../constants'
import StyleSheet from './StyleSheet'
import ServerStyleSheet from './ServerStyleSheet'

import { CHANNEL, CHANNEL_NEXT, CONTEXT_CHANNEL_SHAPE } from './ThemeProvider'

// HACK for generating all static styles without needing to allocate
// an empty execution context every single time...
const STATIC_EXECUTION_CONTEXT = {}

export default (ComponentStyle: Function, constructWithOptions: Function) => {
  const identifiers = {}

  /* We depend on components having unique IDs */
  const generateId = (_displayName: string, parentComponentId: string) => {
    const displayName =
      typeof _displayName !== 'string' ? 'sc' : escape(_displayName)

    let componentId

    /**
     * only fall back to hashing the component injection order if
     * a proper displayName isn't provided by the babel plugin
     */
    if (!_displayName) {
      const nr = (identifiers[displayName] || 0) + 1
      identifiers[displayName] = nr

      componentId = `${displayName}-${ComponentStyle.generateName(
        displayName + nr
      )}`
    } else {
      componentId = `${displayName}-${ComponentStyle.generateName(displayName)}`
    }

    return parentComponentId !== undefined
      ? `${parentComponentId}-${componentId}`
      : componentId
  }

  class BaseStyledComponent extends Component {
    static target: Target
    static styledComponentId: string
    static attrs: Object
    static componentStyle: Object
    static warnTooManyClasses: Function

    attrs = {}
    state = {
      theme: null,
    }
    unsubscribeId: number = -1

    unsubscribeFromContext() {
      if (this.unsubscribeId !== -1) {
        this.context[CHANNEL_NEXT].unsubscribe(this.unsubscribeId)
      }
    }

    buildExecutionContext(theme: any, props: any) {
      const { attrs } = this.constructor
      const context = { ...props, theme }
      if (attrs === undefined) {
        return context
      }

      this.attrs = Object.keys(attrs).reduce((acc, key) => {
        const attr = attrs[key]
        // eslint-disable-next-line no-param-reassign
        acc[key] = typeof attr === 'function' ? attr(context) : attr
        return acc
      }, {})

      return { ...context, ...this.attrs }
    }

    componentWillMount() {
      const styledContext = this.context[CHANNEL_NEXT]
      if (styledContext !== undefined) {
        const { subscribe } = styledContext
        this.unsubscribeId = subscribe(theme => {
          this.setState({ theme })
        })
      }
    }

    componentWillUnmount() {
      this.unsubscribeFromContext()
    }

    render() {
      let theme

      if (this.state.theme !== null) {
        theme = determineTheme(
          this.props,
          this.state.theme,
          this.constructor.defaultProps
        )
      } else {
        theme = this.props.theme || {}
      }

      const {
        attrs,
        componentStyle,
        styledComponentId,
        target,
        warnTooManyClasses,
      } = this.constructor
      const styleSheet = this.context[CONTEXT_KEY] || StyleSheet.master

      const registeredStylesFromClassName = []
      let className = ''
      if (typeof this.props.className === 'string') {
        className += getRegisteredStyles(
          styleSheet.registered,
          registeredStylesFromClassName,
          this.props.className
        )
      }
      className += `${styledComponentId} `
      // staticaly styled-components don't need to build an execution context object,
      // and shouldn't be increasing the number of class names

      if (
        componentStyle.isStatic &&
        attrs === undefined &&
        registeredStylesFromClassName.length === 0
      ) {
        className += componentStyle.generateAndInjectStyles(
          STATIC_EXECUTION_CONTEXT,
          styleSheet
        )
      } else {
        const executionContext = this.buildExecutionContext(theme, this.props)
        if (this.attrs.className) {
          className += `${this.attrs.className} `
        }
        const generatedClassName = componentStyle.generateAndInjectStyles(
          executionContext,
          styleSheet,
          registeredStylesFromClassName
        )
        className += generatedClassName
        if (
          process.env.NODE_ENV !== 'production' &&
          warnTooManyClasses !== undefined
        ) {
          warnTooManyClasses(generatedClassName)
        }
      }

      const { innerRef } = this.props
      const isTargetTag = isTag(target)

      const baseProps = {
        ...this.attrs,
        className,
      }

      if (isStyledComponent(target)) {
        baseProps.innerRef = innerRef
      } else {
        baseProps.ref = innerRef
      }

      const propsForElement = Object.keys(this.props).reduce(
        (acc, propName) => {
          // Don't pass through non HTML tags through to HTML elements
          // always omit innerRef
          if (
            propName !== 'innerRef' &&
            propName !== 'className' &&
            (!isTargetTag || validAttr(propName))
          ) {
            // eslint-disable-next-line no-param-reassign
            acc[propName] = this.props[propName]
          }

          return acc
        },
        baseProps
      )

      return createElement(target, propsForElement)
    }
  }

  const createStyledComponent = (
    target: Target,
    options: Object,
    rules: RuleSet
  ) => {
    const {
      displayName = isTag(target)
        ? `styled.${target}`
        : `Styled(${getComponentName(target)})`,
      componentId = generateId(options.displayName, options.parentComponentId),
      ParentComponent = BaseStyledComponent,
      rules: extendingRules,
      attrs,
    } = options

    const styledComponentId =
      options.displayName && options.componentId
        ? `${escape(options.displayName)}-${options.componentId}`
        : componentId

    const componentStyle = new ComponentStyle(
      extendingRules === undefined ? rules : extendingRules.concat(rules),
      attrs,
      styledComponentId
    )

    class StyledComponent extends ParentComponent {
      static contextTypes = {
        [CHANNEL]: PropTypes.func,
        [CHANNEL_NEXT]: CONTEXT_CHANNEL_SHAPE,
        [CONTEXT_KEY]: PropTypes.oneOfType([
          PropTypes.instanceOf(StyleSheet),
          PropTypes.instanceOf(ServerStyleSheet),
        ]),
      }

      static displayName = displayName
      static styledComponentId = styledComponentId
      static attrs = attrs
      static componentStyle = componentStyle
      static target = target

      static withComponent(tag) {
        const { componentId: previousComponentId, ...optionsToCopy } = options

        const newComponentId =
          previousComponentId &&
          `${previousComponentId}-${
            isTag(tag) ? tag : escape(getComponentName(tag))
          }`

        const newOptions = {
          ...optionsToCopy,
          componentId: newComponentId,
          ParentComponent: StyledComponent,
        }

        return createStyledComponent(tag, newOptions, rules)
      }

      static get extend() {
        const {
          rules: rulesFromOptions,
          componentId: parentComponentId,
          ...optionsToCopy
        } = options

        const newRules =
          rulesFromOptions === undefined
            ? rules
            : rulesFromOptions.concat(rules)

        const newOptions = {
          ...optionsToCopy,
          rules: newRules,
          parentComponentId,
          ParentComponent: StyledComponent,
        }

        return constructWithOptions(createStyledComponent, target, newOptions)
      }
    }

    if (process.env.NODE_ENV !== 'production') {
      StyledComponent.warnTooManyClasses = createWarnTooManyClasses(displayName)
    }

    return StyledComponent
  }

  return createStyledComponent
}
