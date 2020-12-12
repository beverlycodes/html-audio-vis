/*
  Module: blocks.js

  Description:
    Quick little from-scratch toolset for organizing event-driven code

  Usage:
    Call module.createContext, passing an event handler that implements the Web
    API EventTarget interface.  This will return a BlocksContext.

  BlocksContext:
    actions - Object
      Retrieve an object containing action methods
      created with defineActions()

    Object defineActions(actions: Array<String>)
      Create context-bound action methods with names matching the strings in
      the actions parameter.

      Returns an object containing the action methods

    void encapsulate(cb: Function)
      Syntactic sugar to create a scoped block.  Plays nicer with Prettier
      than using (function () { ... } ()).

    void join(actions: Array<Array>, joiner(context): Function)
      Whenever any of the actions in the action parameter are triggered, run
      the joiner callback and pass a persistent context for the join

      Example:
        join([
          [ actions.myAction, 'value1' ],
          [ actions.myOtherAction,
            (payload, context) => context.handlerDerived = payload.something
          ]
        ], function ({ value1, handlerDerived }) {
          ...
        })
      ]
 */

window.modules = window.modules || {}

window.modules.blocks = (function() {
  function createContext(eventHandler) {
    const definedActions = {}

    return {
      get actions() {
        return definedActions
      },

      defineActions(actions) {
        for (const action of actions) {
          const tag = `blocks.${action}`

          const definedAction = function(data) {
            eventHandler.dispatchEvent(new CustomEvent(tag, { detail: data }))
          }

          definedAction.tag = tag

          definedAction.always = function(cb) {
            eventHandler.addEventListener(definedAction.tag, cb)
          }

          definedAction.once = function(cb) {
            function handler(e) {
              eventHandler.removeEventListener(definedAction.tag, handler)
              cb(e)
            }

            eventHandler.addEventListener(definedAction.tag, handler)
          }

          definedActions[action] = definedAction
        }

        return definedActions
      },

      encapsulate: function(cb) {
        cb()
      },

      join(actions, joiner) {
        const joinContext = {}

        for (const [action, handler] of actions) {
          eventHandler.addEventListener(action.tag, function(e) {
            if (typeof handler === 'string') {
              joinContext[handler] = e.detail
            } else if (typeof handler === 'function') {
              handler(e.detail, joinContext)
            } else {
              console.error('Join handler must be of types string or function')
            }

            joiner(joinContext)
          })
        }
      },
    }
  }

  return { createContext }
})()
