import { Context, Schema } from '@koishijs/core'
import { defineProperty } from '@koishijs/utils'
import { Cache } from './cache'
import { Assets } from './assets'
import * as satori from '@satorijs/satori'

export { Quester, Router, WebSocketLayer } from '@satorijs/satori'

export * from './assets'
export * from './cache'
export * from './patch'

export * from '@koishijs/core'
export * from '@koishijs/utils'

declare module '@koishijs/core' {
  interface Context {
    assets: Assets
    cache: Cache
  }

  namespace Context {
    namespace Config {
      interface Static extends satori.Context.Config.Static {}
    }
  }
}

defineProperty(Context.Config, 'Network', satori.Context.Config.Network)

Context.Config.list.unshift(satori.Context.Config.Network)

Context.Config.list.push(Schema.object({
  assets: Context.Config.Assets,
}))

Context.Config.list.push(satori.Quester.Config)

Context.service('assets')
Context.service('cache')
