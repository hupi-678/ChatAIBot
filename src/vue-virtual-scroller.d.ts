declare module 'vue-virtual-scroller' {
  import type { DefineComponent } from 'vue'

  export const DynamicScroller: DefineComponent<{
    items: unknown[]
    keyField?: string
    minItemSize: number
    buffer?: number
    listClass?: string
    itemClass?: string
  }>

  export const DynamicScrollerItem: DefineComponent<{
    item: unknown
    active: boolean
    sizeDependencies?: unknown[]
    dataIndex?: number
  }>
}
