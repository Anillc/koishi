import { MaybeArray, Dict, Get, Extract, clone } from '@koishijs/utils'
import { Context } from './context'
import { User, Channel, Service } from './database'

export type TableType = keyof Tables

// shared types
type Primitive = string | number
type Comparable = Primitive | Date

type Keys<O, T = any> = string & {
  [K in keyof O]: O[K] extends T ? K : never
}[keyof O]

export class Model {
  public config: Dict<Model.Config> = {}

  constructor() {
    this.extend('user', {
      id: 'string(63)',
      name: 'string(63)',
      flag: 'unsigned(20)',
      authority: 'unsigned(4)',
      usage: 'json',
      timers: 'json',
    }, {
      autoInc: true,
    })

    this.extend('channel', {
      id: 'string(63)',
      platform: 'string(63)',
      flag: 'unsigned(20)',
      assignee: 'string(63)',
    }, {
      primary: ['id', 'platform'],
    })
  }

  extend<T extends TableType>(name: T, fields?: Model.Field.Extension<Tables[T]>, extension?: Model.Extension<Tables[T]>): void
  extend(name: string, fields = {}, extension: Model.Extension = {}) {
    const { primary, autoInc, unique = [], foreign } = extension
    const table = this.config[name] ||= {
      primary: 'id',
      unique: [],
      foreign: {},
      fields: {},
    }

    table.primary = primary || table.primary
    table.autoInc = autoInc || table.autoInc
    table.unique.push(...unique)
    Object.assign(table.foreign, foreign)

    for (const key in fields) {
      table.fields[key] = Model.Field.parse(fields[key])
    }
  }

  create<T extends TableType>(name: T): Tables[T] {
    const { fields, primary } = this.config[name]
    const result = {} as Tables[T]
    for (const key in fields) {
      if (key !== primary && fields[key].initial !== undefined) {
        result[key] = clone(fields[key].initial)
      }
    }
    return result
  }

  resolveQuery<T extends TableType>(name: T, query: Query<T> = {}): Query.Expr<Tables[T]> {
    if (Array.isArray(query) || query instanceof RegExp || ['string', 'number'].includes(typeof query)) {
      const { primary } = this.config[name]
      if (Array.isArray(primary)) {
        throw new TypeError('invalid query syntax')
      }
      return { [primary]: query } as any
    }
    return query as any
  }
}

export namespace Model {
  export interface Extension<O = any> {
    autoInc?: boolean
    primary?: MaybeArray<Keys<O>>
    unique?: MaybeArray<Keys<O>>[]
    foreign?: {
      [K in keyof O]?: [TableType, string]
    }
  }

  export interface Config<O = any> extends Extension<O> {
    fields?: Field.Config<O>
  }

  export interface Field<T = any> {
    type: Field.Type<T>
    length?: number
    nullable?: boolean
    initial?: T
    precision?: number
    scale?: number
  }

  export namespace Field {
    export const number: Type[] = ['integer', 'unsigned', 'float', 'double', 'decimal']
    export const string: Type[] = ['char', 'string', 'text']
    export const date: Type[] = ['timestamp', 'date', 'time']
    export const object: Type[] = ['list', 'json']

    export type Type<T = any> =
      | T extends number ? 'integer' | 'unsigned' | 'float' | 'double' | 'decimal'
      : T extends string ? 'char' | 'string' | 'text'
      : T extends Date ? 'timestamp' | 'date' | 'time'
      : T extends any[] ? 'list' | 'json'
      : T extends object ? 'json'
      : never

    type WithParam<S extends string> = S | `${S}(${any})`

    export type Extension<O = any> = {
      [K in keyof O]?: Field<O[K]> | WithParam<Type<O[K]>>
    }

    export type Config<O = any> = {
      [K in keyof O]?: Field<O[K]>
    }

    const regexp = /^(\w+)(?:\((.+)\))?$/

    export function parse(source: string | Field): Field {
      if (typeof source !== 'string') return source

      // parse string definition
      const capture = regexp.exec(source)
      if (!capture) throw new TypeError('invalid field definition')
      const type = capture[1] as Type
      const args = (capture[2] || '').split(',')
      const field: Field = { type }

      // set default initial value
      if (field.initial === undefined) {
        if (number.includes(field.type)) field.initial = 0
        if (string.includes(field.type)) field.initial = ''
        if (field.type === 'list') field.initial = []
        if (field.type === 'json') field.initial = {}
      }

      // set length information
      if (type === 'decimal') {
        field.precision = +args[0]
        field.scale = +args[1]
      } else if (args[0]) {
        field.length = +args[0]
      }

      return field
    }
  }
}

export interface Tables {
  user: User
  channel: Channel
}

export type Query<T extends TableType> = Query.Expr<Tables[T]> | Query.Shorthand<Primitive>

export namespace Query {
  export type Field<T extends TableType> = string & keyof Tables[T]
  export type Index<T extends TableType> = Keys<Tables[T], Primitive>

  export interface FieldExpr<T = any> {
    // logical
    $or?: FieldQuery<T>[]
    $and?: FieldQuery<T>[]
    $not?: FieldQuery<T>

    // membership
    $in?: Extract<T, Primitive, T[]>
    $nin?: Extract<T, Primitive, T[]>

    // arithmatic
    $eq?: Extract<T, Comparable>
    $ne?: Extract<T, Comparable>
    $gt?: Extract<T, Comparable>
    $gte?: Extract<T, Comparable>
    $lt?: Extract<T, Comparable>
    $lte?: Extract<T, Comparable>

    // list
    $el?: T extends (infer U)[] ? FieldQuery<U> : never
    $size?: Extract<T, any[], number>

    // regexp
    $regex?: Extract<T, string, RegExp>
    $regexFor?: Extract<T, string>

    // bitwise
    $bitsAllClear?: Extract<T, number>
    $bitsAllSet?: Extract<T, number>
    $bitsAnyClear?: Extract<T, number>
    $bitsAnySet?: Extract<T, number>
  }

  export interface LogicalExpr<T = any> {
    $or?: Expr<T>[]
    $and?: Expr<T>[]
    $not?: Expr<T>
    $expr?: Eval.Boolean<T>
  }

  export type Shorthand<T = any> =
    | Extract<T, Comparable>
    | Extract<T, Primitive, T[]>
    | Extract<T, string, RegExp>

  export type FieldQuery<T = any> = FieldExpr<T> | Shorthand<T>
  export type Expr<T = any> = LogicalExpr<T> & {
    [K in keyof T]?: FieldQuery<T[K]>
  }

  export interface ModifierExpr<K extends string> {
    limit?: number
    offset?: number
    fields?: K[]
  }

  export type Modifier<T extends string> = T[] | ModifierExpr<T>

  export function resolveModifier<K extends string>(modifier: Modifier<K>): ModifierExpr<K> {
    if (Array.isArray(modifier)) return { fields: modifier }
    return modifier || {}
  }

  type Projection<T extends TableType> = Dict<Eval.Aggregation<Tables[T]>>

  type MapEval<T, P> = {
    [K in keyof P]: Eval<T, P[K]>
  }

  export interface Methods {
    drop(table?: TableType): Promise<void>
    get<T extends TableType, K extends Field<T>>(table: T, query: Query<T>, modifier?: Modifier<K>): Promise<Pick<Tables[T], K>[]>
    set<T extends TableType>(table: T, query: Query<T>, updater: Partial<Tables[T]>): Promise<void>
    remove<T extends TableType>(table: T, query: Query<T>): Promise<void>
    create<T extends TableType>(table: T, data: Partial<Tables[T]>): Promise<Tables[T]>
    upsert<T extends TableType>(table: T, data: Partial<Tables[T]>[], keys?: MaybeArray<Index<T>>): Promise<void>
    aggregate<T extends TableType, P extends Projection<T>>(table: T, fields: P, query?: Query<T>): Promise<MapEval<T, P>>
  }
}

export type Eval<T, U> =
  | U extends number ? number
  : U extends boolean ? boolean
  : U extends string ? Get<T, U>
  : U extends Eval.NumericExpr ? number
  : U extends Eval.BooleanExpr ? boolean
  : U extends Eval.AggregationExpr ? number
  : never

export namespace Eval {
  export type Any<T = any, A = never> = A | number | boolean | Keys<T> | NumericExpr<T, A> | BooleanExpr<T, A>
  export type GeneralExpr = NumericExpr & BooleanExpr & AggregationExpr
  export type Numeric<T = any, A = never> = A | number | Keys<T, number> | NumericExpr<T, A>
  export type Boolean<T = any, A = never> = boolean | Keys<T, boolean> | BooleanExpr<T, A>
  export type Aggregation<T = any> = Any<{}, AggregationExpr<T>>

  export interface NumericExpr<T = any, A = never> {
    $add?: Numeric<T, A>[]
    $multiply?: Numeric<T, A>[]
    $subtract?: [Numeric<T, A>, Numeric<T, A>]
    $divide?: [Numeric<T, A>, Numeric<T, A>]
  }

  export interface BooleanExpr<T = any, A = never> {
    $eq?: [Numeric<T, A>, Numeric<T, A>]
    $ne?: [Numeric<T, A>, Numeric<T, A>]
    $gt?: [Numeric<T, A>, Numeric<T, A>]
    $gte?: [Numeric<T, A>, Numeric<T, A>]
    $lt?: [Numeric<T, A>, Numeric<T, A>]
    $lte?: [Numeric<T, A>, Numeric<T, A>]
  }

  export interface AggregationExpr<T = any> {
    $sum?: Any<T>
    $avg?: Any<T>
    $max?: Any<T>
    $min?: Any<T>
    $count?: Any<T>
  }
}
