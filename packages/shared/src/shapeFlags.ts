export const enum ShapeFlags {
  ELEMENT = 1, //HTML SVG 或普通DOM元素
  FUNCTIONAL_COMPONENT = 1 << 1, //函数式组件
  STATEFUL_COMPONENT = 1 << 2, //有状态组件
  TEXT_CHILDREN = 1 << 3, //子节点为纯文本
  ARRAY_CHILDREN = 1 << 4, //子节点是数组
  SLOTS_CHILDREN = 1 << 5, //子节点包含插槽
  TELEPORT = 1 << 6, //Teleport
  SUSPENSE = 1 << 7, //suspense
  COMPONENT_SHOULD_KEEP_ALIVE = 1 << 8, // should
  COMPONENT_KEPT_ALIVE = 1 << 9, // alive-keep
  COMPONENT = ShapeFlags.STATEFUL_COMPONENT | ShapeFlags.FUNCTIONAL_COMPONENT
}
