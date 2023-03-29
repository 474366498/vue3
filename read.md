# [vue3 源码解析](https://www.jianshu.com/p/ad7f71ee3652)

## 项目结构

**reactivity** 响应式 API 例如 **toRef、reactive Effect computed watch** 可作为与框架无关的包、独立构建

**runtime-core** 平台无关的运行时核心代码。包括虚拟 dom 渲染、组件实现和 Javascript API. 可以使用这个包针对特定平台构建高价运行时（定制渲染器）

**runtime-dom** 针对浏览器的运行时。包括对原生 DOM API
属性（attributes）、特性（properties）、事件回调的处理

**runtime-test** 用于测试轻量级运行时。可以在任何 Javascript 环境使用，因为它最终呈现 Javascript 对象形式的渲染树，其可以用来断言正确的渲染输出。另外还提供用于序列化树、触发事件和记录更新期间执行的实际节点操作的实用工具

**server-renderer** 服务端渲染相关

**compiler-core** 平台无关的编译器核心代码。包括编译器可扩展基础以及与所有平台无关的插件

**compiler-dom** 添加了针对了浏览器的附加插件的编译器

**compiler-sfc** 用于编译 Vue 单文件组件的低阶工具

**compiler-ssr** 为服务端提供优化后的渲染函数的编译器

**template-explorer** 用于调试编译器输出的开发者工具。运行*npm dev template-explorer* 命令后打开它的*index.html*文件，获取基于当前源代码的模板的编译结果。也可以使用在线版本*live version*

**shared** 多个包共享的内部工具（特别是运行时包的编译器包所使用的与环境无关的工具）

**vue** 用于面向公众的完整构建，其中包括编译器和运行时

## 入口

**vue/src/index.ts**

1. compileCache 编译缓存 => Object.create(null)
2. compileToFunction(template:string|HTMLElement,options?:CompilerOptions ) 编译器函数 => RenderFunction (vue/runtime-dom)

> compileToFunction 通过 compileCache[template] 判断是否有缓存
> 可以在 根目录下 运行 npm run dev-compiler 打开在线 在线生成 render 方法

## compile 编译

**compiler-dom/src/index.ts**

1. compile(template:string , options:CompilerOptions={}) => CodegenResult({
   return baseCompile<function>()
   })

```typescript
function compile(template:string , options:CompilerOptions = {}) : CodegenResult {
  return baseCompole(
    template ,
    // parserOptions包含适用于浏览器的辅助函数，options为用户传入的选项
    extend({},parserOptions , options ,{
      //nodeTransforms列表会对抽象语法树的node节点进行特定变换
      nodeTransforms : [
        // 忽略 <script> 和 <tag>标签
        //它没有放在DOMNodeTransforms中，因为compiler-ssr使用该列表生成vnode回退分支
        ignoreSideEffectTags ,
        ... DOMNodeTransforms ,
        .. (options.nodeTransforms || [])
      ],
      //关于指令的变换函数
      directiveTransforms : extend(
        {} ,
        DOMDirectiveTransforms , //包括v-html、v-text、v-model、v-on、v-show
        options.directiveTransforms || {}
      ),
      transformHoist:__BROWSER__ ? null : stringifyStatic //静态提升
    })
  )
}

```

**compiler-core/src/compile.ts**

2. baseCompile()
   1. baseParse 生成 ast
   2. transform 对 ast 进行变换
   3. generate 根据变换后的 ast 生成 code 并返回

```typescript
function baseCompile(
  template: string | RootNode,
  options: CompilerOptions = {}
): CodegenResult {
  // 错误处理
  const onError = options.onError || defaultOnError
  const isModuleMode = options.mode === 'module'
  /* istanbul ignore if */
  if (__BROWSER__) {
    if (options.prefixIdentifiers === true) {
      onError(createCompilerError(ErrorCodes.X_PREFIX_ID_NOT_SUPPORTED))
    } else if (isModuleMode) {
      onError(createCompilerError(ErrorCodes.X_MODULE_MODE_NOT_SUPPORTED))
    }
  }
  // 前缀标识 用于决定使用module模式还是function 模式生成代码
  const prefixIdentifiers =
    !__BROWSER__ && (options.prefixIdentifiers === true || isModuleMode)
  if (!prefixIdentifiers && options.cacheHandlers) {
    onError(createCompilerError(ErrorCodes.X_CACHE_HANDLER_NOT_SUPPORTED))
  }
  if (options.scopeId && !isModuleMode) {
    onError(createCompilerError(ErrorCodes.X_SCOPE_ID_NOT_SUPPORTED))
  }
  // 生成ast抽象语法树
  const ast = isString(template) ? baseParse(template, options) : template
  // 根据前缀标识 获取预设转换函数
  const [nodeTransforms, directiveTransforms] =
    getBaseTransformPreset(prefixIdentifiers)

  if (!__BROWSER__ && options.isTS) {
    const { expressionPlugins } = options
    if (!expressionPlugins || !expressionPlugins.includes('typescript')) {
      options.expressionPlugins = [...(expressionPlugins || []), 'typescript']
    }
  }

  //对ast进行变换
  transform(
    ast,
    extend({}, options, {
      prefixIdentifiers,
      nodeTransforms: [
        ...nodeTransforms,
        ...(options.nodeTransforms || []) // user transforms
      ],
      directiveTransforms: extend(
        {},
        directiveTransforms,
        options.directiveTransforms || {} // user transforms
      )
    })
  )
  // 根据ast生成vue入口需要的编译代码code
  return generate(
    ast,
    extend({}, options, {
      prefixIdentifiers
    })
  )
}
```

## parse 解析

1. baseParse

**compiler-core/src/parse.ts**

```typescript
function baseParse(content: string, options: ParserOptions = {}): RootNode {
  /*根据内容与选项生成context上下文
      {
        options,  //解析选项
        column: 1, //列
        line: 1,  //行
        offset: 0, //原始源码的偏移量
        originalSource: content,  //原始源码
        source: content, //源码，随着解析的进行，不断替换
        inPre: false, // 是否<pre>标签，在<pre>标签内的内容，会保留空格和换行，通常用于源代码展示。
        inVPre: false, 是否有v-pre指令，该元素及其子元素不参与编译，用于跳过编译过程，用于纯原生dom提高编译速度。
        onWarn: options.onWarn //用户的错误处理函数
      }
    */

  const context = createParserContext(content, options)
  /*
      根据上下文获取游标，简单理解为编辑进行到的位置 里面的code
      const {column , line , offset} = context
      return { column , line , offset }
    */
  const start = getCursor(context)

  // 生成ast根节点
  return createRoot(
    parseChildren(context, TextModes.DATA, []) // 解析子节点
    /*
      根据上下文和游标开始位置获取解析的源代码片段 里面的代码
      end = end || getCursor(context)
      return {
        start ,
        end ,
        source : context.originalSource.slice(start.offset,end.offset)
      }
    */
    getSelection(context,start)
  )
}

 /*
 注 TextModes
export const enum TextModes {
  //          | Elements | Entities | End sign              | Inside of
  DATA, //    | ✔        | ✔        | End tags of ancestors |
  RCDATA, //  | ✘        | ✔        | End tag of the parent | <textarea>
  RAWTEXT, // | ✘        | ✘        | End tag of the parent | <style>,<script>
  CDATA,
  ATTRIBUTE_VALUE
}
 */

```

2. parseChildren

**compiler-core/src/parse.ts**

```typescript
function parseChildren(
  context: ParserContext,
  mode: TextModes,
  ancestors: ElementNode[]
): TemplateChildNode[] {
  //获取最后一个祖先节点，即父节点，在上一小节中传入空数组，即没有父节点
  const parent = last(ancestors)
  //父节点的命名空间，父节点不存在就默认取HTML命名空间，即解析时，对应节点会被当做HTML节点处理
  const ns = parent ? parent.ns : Namespaces.HTML
  //当前父节点的子节点数组
  const nodes: TemplateChildNode[] = []

  //根据上下文、节点类型和祖先节点判断是否到达结尾
  while (!isEnd(context, mode, ancestors)) {
    const s = context.source //获取需要解析的源码
    let node: TemplateChildNode | TemplateChildNode[] | undefined = undefined //声明子节点

    if (mode === TextModes.DATA || mode === TextModes.RCDATA) {
      //只对元素（组件）和<textarea>标签内文本解析
      if (!context.inVPre && startsWith(s, context.options.delimiters[0])) {
        // 如果没有使用v-pre指令，且源码以的delimiters[0]选项存在，默认为'{{'，则当做插值表达式进行解析
        node = parseInterpolation(context, mode)
      } else if (mode === TextModes.DATA && s[0] === '<') {
        // 如果是dom标签，按照HTML官网规范解析，以下是HTML官方“开始标签”解析算法
        // https://html.spec.whatwg.org/multipage/parsing.html#tag-open-state
        if (s.length === 1) {
          //如果是源码的最后一个字符，报边界错误
          emitError(context, ErrorCodes.EOF_BEFORE_TAG_NAME, 1)
        } else if (s[1] === '!') {
          //'<'后接'!'则，当做注释进行解析，以HTML官方算法解析注释。
          //注释类型包括'<!--'、 '<!DOCTYPE'、'<![CDATA['三种
          // https://html.spec.whatwg.org/multipage/parsing.html#markup-declaration-open-state
          /* HTML官方算法解析注释 */
        } else if (s[1] === '/') {
          //如果是'</'当做结束标签进行解析，依然使用HTML官方算法
          // https://html.spec.whatwg.org/multipage/parsing.html#end-tag-open-state
          /* 解析结束标签 */
        } else if (/[a-z]/i.test(s[1])) {
          //如果是以[a-z]开头的标签，当做元素进行解析（包括组件），我们的重点在这，后面将对parseElement进行讲解
          node = parseElement(context, ancestors)

          /* 对2.x中<template>的兼容。在3.x中，若没有vue的官方指令，会被当做原生的dom标签 */
        } else if (s[1] === '?') {
          //如果是'<?'报不支持该类型的标签，且当做注释进行解析
          emitError(
            context,
            ErrorCodes.UNEXPECTED_QUESTION_MARK_INSTEAD_OF_TAG_NAME,
            1
          )
          node = parseBogusComment(context)
        } else {
          //报非法字符串错误
          emitError(context, ErrorCodes.INVALID_FIRST_CHARACTER_OF_TAG_NAME, 1)
        }
      }
    }
    //经过一段解析后，还是undefined，当做普通文本解析
    if (!node) {
      node = parseText(context, mode)
    }
    //将节点推入节点数组
    if (isArray(node)) {
      for (let i = 0; i < node.length; i++) {
        pushNode(nodes, node[i])
      }
    } else {
      pushNode(nodes, node)
    }
  }

  //标记是否移除空格
  let removedWhitespace = false
  if (mode !== TextModes.RAWTEXT && mode !== TextModes.RCDATA) {
    /* 去除空格 */
  }

  //Arrary.filter(Boolean)能够移除数组中的0、''、null、undefined
  return removedWhitespace ? nodes.filter(Boolean) : nodes
}
```

function parseInterpolation

```typescript
function parseInterpolation(
  context: ParserContext,
  mode: TextModes
): InterpolationNode | undefined {
  //获取开始与结束定界符
  const [open, close] = context.options.delimiters

  //从开始定界符之后开始寻找结束定界符的索引
  const closeIndex = context.source.indexOf(close, open.length)
  //如果找不到则报错
  if (closeIndex === -1) {
    emitError(context, ErrorCodes.X_MISSING_INTERPOLATION_END)
    return undefined
  }

  const start = getCursor(context) //获取开始游标
  advanceBy(context, open.length) //解析位置前进open.length长度，修改上下文context的source、offset、line、column
  const innerStart = getCursor(context) //插值表达式开始位置游标，初始化，之后修改
  const innerEnd = getCursor(context) //插值表达式结束位置游标，初始化，之后修改
  const rawContentLength = closeIndex - open.length //计算原生插值表达式长度
  const rawContent = context.source.slice(0, rawContentLength) //获取原生插值表达式
  //DATA、RCDATA、ATTRIBUTE_VALUE类型且包含'&'，由自选项提供的decodeEntities函数进行解码，其他情况返回原文本
  const preTrimContent = parseTextData(context, rawContentLength, mode)
  const content = preTrimContent.trim() //获得去除前后空白符的表达式，用于之后计算原生表达式的开始与结束索引
  const startOffset = preTrimContent.indexOf(content) //获取前面空白符的最后索引作为偏移量
  if (startOffset > 0) {
    //如果偏移量大于零，根据原生插值与偏移量修改innerStart的位置描述
    advancePositionWithMutation(innerStart, rawContent, startOffset)
  }
  //获取原生插值表达式的结束偏移量
  const endOffset =
    rawContentLength - (preTrimContent.length - content.length - startOffset)
  advancePositionWithMutation(innerEnd, rawContent, endOffset) //修改innerEnd位置描述
  advanceBy(context, close.length) //context位置前进到结束定界符之后，结束解析
  //返回AST节点描述对象
  return {
    type: NodeTypes.INTERPOLATION, //类型为插值表达式
    content: {
      type: NodeTypes.SIMPLE_EXPRESSION, //内容为简单表达式
      isStatic: false, //不可静态提升
      constType: ConstantTypes.NOT_CONSTANT, //不是常量
      content, //去除了前后空格的表达式文本
      loc: getSelection(context, innerStart, innerEnd) //范围位置信息，包括开始位置、结束位置、以及相应源码
    },
    loc: getSelection(context, start) //从定界符开始到定界符结束位置的范围及源码
  }
}
```

function parseElement

```typescript
// 解析虚拟节点
function parseElement(
  context: ParserContext,
  ancestors: ElementNode[]
): ElementNode | undefined {
  __TEST__ && assert(/^<[a-z]/i.test(context.source))

  // Start tag.
  const wasInPre = context.inPre
  const wasInVPre = context.inVPre
  const parent = last(ancestors)
  const element = parseTag(context, TagType.Start, parent)
  const isPreBoundary = context.inPre && !wasInPre
  const isVPreBoundary = context.inVPre && !wasInVPre

  if (element.isSelfClosing || context.options.isVoidTag(element.tag)) {
    // #4030 self-closing <pre> tag
    if (isPreBoundary) {
      context.inPre = false
    }
    if (isVPreBoundary) {
      context.inVPre = false
    }
    return element
  }

  // Children.
  ancestors.push(element)
  const mode = context.options.getTextMode(element, parent)
  const children = parseChildren(context, mode, ancestors)
  ancestors.pop()

  // 2.x inline-template compat
  if (__COMPAT__) {
    const inlineTemplateProp = element.props.find(
      p => p.type === NodeTypes.ATTRIBUTE && p.name === 'inline-template'
    ) as AttributeNode
    if (
      inlineTemplateProp &&
      checkCompatEnabled(
        CompilerDeprecationTypes.COMPILER_INLINE_TEMPLATE,
        context,
        inlineTemplateProp.loc
      )
    ) {
      const loc = getSelection(context, element.loc.end)
      inlineTemplateProp.value = {
        type: NodeTypes.TEXT,
        content: loc.source,
        loc
      }
    }
  }

  element.children = children

  // End tag.
  if (startsWithEndTagOpen(context.source, element.tag)) {
    parseTag(context, TagType.End, parent)
  } else {
    emitError(context, ErrorCodes.X_MISSING_END_TAG, 0, element.loc.start)
    if (context.source.length === 0 && element.tag.toLowerCase() === 'script') {
      const first = children[0]
      if (first && startsWith(first.loc.source, '<!--')) {
        emitError(context, ErrorCodes.EOF_IN_SCRIPT_HTML_COMMENT_LIKE_TEXT)
      }
    }
  }

  element.loc = getSelection(context, element.loc.start)

  if (isPreBoundary) {
    context.inPre = false
  }
  if (isVPreBoundary) {
    context.inVPre = false
  }
  return element
}
```

3. parseTag

**compiler-core/src/parse.ts**

function parseTag

```typescript
function parseTag(
  context: ParserContext,
  type: TagType.Start,
  parent: ElementNode | undefined
): ElementNode {
  const start = getCursor(context)
  const match = /^<\/?([a-z][^\t\r\n\f />]*)/i.exec(context.source)

  const tag = match[1]
  const ns = context.options.getNamespace(tag, parent)

  advanceBy(context, match[0].length)
  advanceSpaces(context)

  // save current state in case we need to re-parse attributes with v-pre
  const cursor = getCursor(context)
  const currentSource = context.source

  // check <pre> tag
  if (context.options.isPreTag(tag)) {
    context.inPre = true
  }

  // Attributes.
  let props = parseAttributes(context, type)

  // check v-pre
  if (
    type === TagType.Start &&
    !context.inVPre &&
    props.some(p => p.type === NodeTypes.DIRECTIVE && p.name === 'pre')
  ) {
    context.inVPre = true
    // reset context
    extend(context, cursor)
    context.source = currentSource
    // re-parse attrs and filter out v-pre itself
    props = parseAttributes(context, type).filter(p => p.name !== 'v-pre')
  }

  // Tag close.
  let isSelfClosing = false
  if (context.source.length === 0) {
    emitError(context, ErrorCodes.EOF_IN_TAG)
  } else {
    isSelfClosing = startsWith(context.source, '/>')
    if (type === TagType.End && isSelfClosing) {
      emitError(context, ErrorCodes.END_TAG_WITH_TRAILING_SOLIDUS)
    }
    advanceBy(context, isSelfClosing ? 2 : 1)
  }

  if (type === TagType.End) {
    return
  }

  // 2.x deprecation checks
  if (
    __COMPAT__ &&
    __DEV__ &&
    isCompatEnabled(
      CompilerDeprecationTypes.COMPILER_V_IF_V_FOR_PRECEDENCE,
      context
    )
  ) {
    let hasIf = false
    let hasFor = false
    for (let i = 0; i < props.length; i++) {
      const p = props[i]
      if (p.type === NodeTypes.DIRECTIVE) {
        if (p.name === 'if') {
          hasIf = true
        } else if (p.name === 'for') {
          hasFor = true
        }
      }
      if (hasIf && hasFor) {
        warnDeprecation(
          CompilerDeprecationTypes.COMPILER_V_IF_V_FOR_PRECEDENCE,
          context,
          getSelection(context, start)
        )
        break
      }
    }
  }

  let tagType = ElementTypes.ELEMENT
  if (!context.inVPre) {
    if (tag === 'slot') {
      tagType = ElementTypes.SLOT
    } else if (tag === 'template') {
      if (
        props.some(
          p =>
            p.type === NodeTypes.DIRECTIVE && isSpecialTemplateDirective(p.name)
        )
      ) {
        tagType = ElementTypes.TEMPLATE
      }
    } else if (isComponent(tag, props, context)) {
      tagType = ElementTypes.COMPONENT
    }
  }

  return {
    type: NodeTypes.ELEMENT,
    ns,
    tag,
    tagType,
    props,
    isSelfClosing,
    children: [],
    loc: getSelection(context, start),
    codegenNode: undefined // to be created during transform phase
  }
}
```

4. isComponent 辨别组件与 dom 元素

**compiler-core/src/parse.ts**

```typescript
function isComponent(
  tag: string,
  props: (AttributeNode | DirectiveNode)[],
  context: ParseContext
) {
  const options = context.options
  // isCustomElement 默认返回false，除非用户配置改方法
  if (options.isCustomElement(tar)) {
    return false
  }
  // a.标签是否是component b.标签是否是大写字母开头 c.是否是核心组件 Teleport Suspense KeepAlive BaseTransition d.特定平台内置组件 如浏览器平台的Transition e.非原生标签
  if (
    tag === 'component' ||
    /^[A-Z]/.test(tag) ||
    isCoreComponent(tag) ||
    (options.isBuiltInComponent && options.isBuiltInComponent(tag)) ||
    (options.isNativeTag && !options.isNativeTag(tag))
  ) {
    return true
  }

  /* 代码走到这，代表为原生元素，但是还需要检查是否有'is'属性、v-is和:is指令
    兼容vue2，vue3中原生dom添加is属性不再被认为是组件，除非添加前缀'vue:'
    v-is指令依然正常、:is指令同样只能使用在兼容模式下 */
  for (let i = 0; i < props.length; i++) {
    let p = props[i]
    if (p.type === NodeTypes.ATTRIBUTE) {
      // 此时标记应该是原生标记，但检查潜在的“is”
      if (p.name === 'is' && p.value) {
        if (p.value.content.startsWith('vue:')) {
          return
        } else if (
          __COMPAT__ &&
          checkCompatEnabled(
            CompilerDeprecationTypes.COMPILER_IS_ON_ELEMENT,
            context,
            p.loc
          )
        ) {
          return true
        }
      }
    } else {
      // directive 指令 :is
      if (p.name === 'is') {
        return true
      } else if (
        // :is on plain element - only treat as component in compat mode => 在compat模式上是否仅将普通元素视为组件
        p.name === 'bind' &&
        isStaticArgOf(p.arg, 'is') &&
        __COMPAT__ &&
        checkCompatEnabled(
          CompilerDeprecationTypes.COMPILER_IS_ON_ELEMENT,
          context,
          p.loc
        )
      ) {
        return true
      }
    }
  }
}
```

5. parseAttributes parseAttribute 解析标签属性( 属性 特性 指令 props)

**compiler-core/src/parse.ts**

```typescript
function parseAttributes(
  context: ParserContext,
  type: TagType
): (AttributeNode | DirectiveNode)[] {
  const props = []
  const attributeNames = new Set<string>()
  // source 有长度 没有遇到 结束标签
  while (
    context.source.length > 0 &&
    !startsWith(context.source, '>') &&
    !startsWith(context.source, '/>')
  ) {
    // 遇到 / 提示 报错
    if (startsWith(context.source, '/')) {
      emitError(context, ErrorCodes.UNEXPECTED_SOLIDUS_IN_TAG)
      advanceBy(context, 1)
      advanceSpaces(context)
      continue
    }
    if (type === TagType.End) {
      emitError(context, ErrorCodes.END_TAG_WITH_ATTRIBUTES)
    }
    // 处理 attribute
    const attr = parseAttribute(context, attributeNames)

    // Trim whitespace between class
    // https://github.com/vuejs/core/issues/4251
    if (
      attr.type === NodeTypes.ATTRIBUTE &&
      attr.value &&
      attr.name === 'class'
    ) {
      attr.value.content = attr.value.content.replace(/\s+/g, ' ').trim()
    }

    if (type === TagType.Start) {
      props.push(attr)
    }

    if (/^[^\t\r\n\f />]/.test(context.source)) {
      emitError(context, ErrorCodes.MISSING_WHITESPACE_BETWEEN_ATTRIBUTES)
    }
    advanceSpaces(context)
  }
  return props
}

function parseAttribute(
  context: ParserContext,
  nameSet: Set<string>
): AttributeNode | DirectiveNode {
  /* 获取属性名，并对不合语法的属性名进行报错，包含="'< 字符的属性名不合法 */

  /* 获取属性值value，允许=前后包含多个空白符 */

  //不在v-pre指令内，以V-、:、.、@、#开头的被认为vue指令、props与事件
  if (!context.inVPre && /^(v-[A-Za-z0-9-]|:|\.|@|#)/.test(name)) {
    const match =
      /(?:^v-([a-z0-9-]+))?(?:(?::|^\.|^@|^#)(\[[^\]]+\]|[^\.]+))?(.+)?$/i.exec(
        name
      )! //分段匹配属性

    let isPropShorthand = startsWith(name, '.')
    let dirName = //取V-后的指令名，但当使用简写时match[1]不存在、则根据简写，判别bind、on、slot指令
      match[1] ||
      (isPropShorthand || startsWith(name, ':')
        ? 'bind'
        : startsWith(name, '@')
        ? 'on'
        : 'slot')
    let arg: ExpressionNode | undefined

    if (match[2]) {
      //指令参数，比如@click中的click、:props中的pros、v-slot:footer中的footer
      const isSlot = dirName === 'slot' //是否slot,slot需要特殊处理
      const startOffset = name.lastIndexOf(match[2])
      const loc = getSelection(
        context,
        getNewPosition(context, start, startOffset),
        getNewPosition(
          context,
          start,
          startOffset + match[2].length + ((isSlot && match[3]) || '').length
        )
      )
      let content = match[2]
      let isStatic = true

      if (content.startsWith('[')) {
        isStatic = false //如果参数是动态的，即@[myEventHandler],则不可进行静态提升

        if (!content.endsWith(']')) {
          emitError(
            context,
            ErrorCodes.X_MISSING_DYNAMIC_DIRECTIVE_ARGUMENT_END
          )
          content = content.slice(1)
        } else {
          content = content.slice(1, content.length - 1) //
        }
      } else if (isSlot) {
        // 由于在v-slot没有修饰符、且vuetify广泛使用包含.的插槽名，所以如果是插槽指令点dots,不被认为是修饰符，而是插槽名的一部分
        content += match[3] || ''
      }

      arg = {
        type: NodeTypes.SIMPLE_EXPRESSION, //因为是指令，所以类型为简单表达式
        content, //指令参数
        isStatic, //是否可静态提升
        constType: isStatic //是否常量
          ? ConstantTypes.CAN_STRINGIFY
          : ConstantTypes.NOT_CONSTANT,
        loc
      }
    }

    /* 修改属性值的位置信息 */

    const modifiers = match[3] ? match[3].slice(1).split('.') : [] //获取修饰符数组
    if (isPropShorthand) modifiers.push('prop') //如果v-bind指令的缩写不是:，而是点dot. ，则把添加修饰符prop

    // 兼容 vue3中不再支持v-bind:foo.sync，而是使用v-model:foo方式进行替代
    if (__COMPAT__ && dirName === 'bind' && arg) {
      if (
        modifiers.includes('sync') &&
        checkCompatEnabled(
          CompilerDeprecationTypes.COMPILER_V_BIND_SYNC,
          context,
          loc,
          arg.loc.source
        )
      ) {
        dirName = 'model'
        modifiers.splice(modifiers.indexOf('sync'), 1)
      }
      //vue3中不再兼容vue2中v-bind的.prop修饰符，而是在适当时机将v-bind属性设置为dom的prop
      if (__DEV__ && modifiers.includes('prop')) {
        checkCompatEnabled(
          CompilerDeprecationTypes.COMPILER_V_BIND_PROP,
          context,
          loc
        )
      }
    }

    return {
      type: NodeTypes.DIRECTIVE, // 属性类型为指令
      name: dirName, //指令名
      exp: value && {
        type: NodeTypes.SIMPLE_EXPRESSION, //指令表达式
        content: value.content,
        isStatic: false, //不可静态提升
        constType: ConstantTypes.NOT_CONSTANT,
        loc: value.loc
      },
      arg,
      modifiers, //修饰符
      loc
    }
  }

  // 如果没有指令名或非法指令名，报错
  if (!context.inVPre && startsWith(name, 'v-')) {
    emitError(context, ErrorCodes.X_MISSING_DIRECTIVE_NAME)
  }

  return {
    type: NodeTypes.ATTRIBUTE, //不是指令，则是普通的dom属性
    name,
    value: value && {
      type: NodeTypes.TEXT,
      content: value.content,
      loc: value.loc
    },
    loc
  }
}
```

## transform 变换

1. baseCompile

**compiler-core/src/compile.ts**

```typescript
trasnform(
  ast,
  extend({}, options, {
    prefixIdentifiers,
    nodeTransforms: [
      ...nodeTransforms,
      ...(options.nodeTransforms || []) // 用户的变换
    ],
    directiveTransforms: extend(
      {},
      directiveTransforms,
      options.directiveTransforms || {} // 用户的变换
    )
  })
)
```

2. transform

**compiler-core/src/transform.ts**

```typescript
function transform(root: RootNode, options: TransformOptions) {
  // 获取上下文 context
  /*
    context {
      // options
      selfName ,
      prefixIdentifiers ,
      hoistStatic ,
      cacheHandlers ,
      nodeTransforms ,
      directiveTransforms ,
      transformHoist ,
      isBuiltInComponent ,
      isCustomElement ,
      expressionPlugins ,
      scopeId ,
      slotted ,
      ssr ,
      isSSR ,
      ssrCssVars ,
      bindingMetadata ,
      inline ,
      onError ,
      onWarn ,
      compatConfig ,
      // state 
      root ,
      helpers  ,  map
      components , set 
      directives , set 
      hoists , array 
      imports , array 
      constantCache , map 
      temps , number 
      cached , number 
      identifiers , object(null) 
      scopes : {
        vFor : 0 ,
        vSlot : 0 ,
        vPre : 0 ,
        vOnce : 0
      } ,
      parent : null ,
      currentNode : root ,
      childIndex : 0 ,
      inVOnce : false ,

      // function 
      helper ,
      removeHelper ,
      helperString ,
      replaceNode ,
      removeNode ,
      onNodeRemoved ,
      addIdentifiers ,
      removeIdentifiers ,
      hoist ,
      cache 
    }
  */
  const context = createTransformContext(root, options)
  // 变换AST
  traverseNode(root, context)
  // 静态提升 ，vue3新特性
  if (options.hoistStatic) {
    hoistStatic(root, context)
  }
  // 非服务端渲染 创建codegen
  if (!options.ssr) {
    createRootCodegen(root, context)
  }
  // 变换后的AST完成原数据赋值
  root.helpers = [...context.helpers.keys()]
  root.components = [...context.components]
  root.directives = [...context.directives]
  root.imports = context.imports
  root.hoists = context.hoists
  root.temps = context.temps
  root.cached = context.cached

  if (__COMPAT__) {
    root.filters = [...context.filters!]
  }
}
```

3. traverseNode

**compiler-core/src/transform.ts**

```typescript
function traverseNode(
  node: RootNode | TemplateChildNode,
  context: TransformContext
) {
  context.currentNode = node // 正在变换的ast节点

  const { nodeTransforms } = context

  const exitFns = [] // 用来存储变换函数的退出函数
  for (let i = 0; i < nodeTransforms.length; i++) {
    const onExit = nodeTransforms[i](node, context)
    if (onExit) {
      if (isArray(onExit)) {
        exitFns.push(...onExit)
      } else {
        exitFns.push(onExit)
      }
    }

    if (!context.currentNode) {
      // 变换函数可能移除原有的AST节点 则直接返回
      return
    } else {
      // 经过变换后 AST节点可能被替换
      node = context.currentNode
    }
  }

  switch (node.type) {
    case NodeTypes.COMMENT:
      if (!context.ssr) {
        // 注入Comment symbol 用户需要的导入代码
        context.helper(CREATE_COMMENT)
      }
      break
    case NodeTypes.INTERPOLATION:
      // {{express}} 插值表达式不需要变化，但需要注入 toString helper
      if (!context.ssr) {
        context.helper(TO_DISPLAY_STRING)
      }
      break
    case NodeTypes.IF:
      // 对 v-if的所有分支进行变换
      for (let i = 0; i < node.branches.length; i++) {
        traverseNode(node.branches[i], context)
      }
      break
    case NodeTypes.IF_BRANCH:
    case NodeTypes.FOR:
    case NodeTypes.ELEMENT:
    case NodeTypes.ROOT:
      traverseChildren(node, context)
      break
  }

  // 推出变换函数
  context.currentNode = node
  let i = exitFns.length
  while (i--) {
    exitFns[i]()
  }
}
```

> vue 先进行一次遍历变换，更改具有 v-if、v-else、v-else-if、v-for 指令节点及其子节点的结构。之后再重新遍历变换 v-if 的所有分支节点，以及递归变换其他类型节点。最后以出栈的方式逐一退出变换的函数。由于变换函数众多且相当复杂，虽然用户也可以传入自己的变换函数，但 99.99%的情况下并没有这种需求，我们只需了解到变换会更改解析出来的 ast 就行了，因此我们只取其中较为简单的 v-once 变换函数进行剖析，v-once 可以使相关的表达式只渲染一次，而不会双向绑定。

4. transformOnce

##### transforms 文件夹中还有一些其它的 如 vOn vSlot vIf vFor...

**compiler-core/src/transforms/vOnce.ts**

```typescript
const transformOnce: NodeTransform = (node, context) => {
  // 元素节点上是否存在‘v-once’ 指令
  if (node.type === NodeTypes.ELEMENT && findDir(node, 'once', true)) {
    if (seen.has(node) || context.inVOnce) {
      // 节点是否执行或处于’v-once‘的子元素中
      return
    }
    seen.add(node) // 缓存 v-once节点
    context.inVOnce = true // 上下文修改为是在’v-once‘节点中
    context.helper(SET_BLOCK_TRACKING) // 添加辅助类型
    return () => {
      // exitFn 退出函数 用于修改上下文环境 更改 codegenNode
      context.inVOnce = false
      const cur = context.currentNode as ElementNode | IfNode | ForNode
      if (cur.codegenNode) {
        cur.codegenNode = context.cache(cur, codegenNode, true)
      }
    }
  }
}
```

## hoistStatic 静态提升 v3 新特性

1. hoistStatic

**compiler-core/src/transforms/hoistStatic.ts**

```typescript
function hoistStatic(root: RootNode, context: TransformContext) {
  walk(
    root, // ast
    context, // 变换上下文
    isSingleElementRoot(root, root.children[0]) // 是否为单子过犹不及且子元素非插槽
  )
}
```

2. walk

**compiler-core/src/transforms/hoistStatic.ts**

```typescript
function walk(
  node: ParentNode,
  context: TransformContext,
  doNotHoistNode: boolean = false //由外部提供是否可静态提升
) {
  const { children } = node
  const originalCount = children.length //用于记录该子元素的数量
  let hoistedCount = 0 //被静态提升的子元素数量

  //遍历整个直接子元素
  for (let i = 0; i < children.length; i++) {
    const child = children[i]
    // 只有纯元素与纯文本可以被静态提升
    if (
      //对元素进行提升
      child.type === NodeTypes.ELEMENT && //是否为元素
      child.tagType === ElementTypes.ELEMENT //是否为原生元素
    ) {
      const constantType = doNotHoistNode
        ? ConstantTypes.NOT_CONSTANT
        : getConstantType(child, context) //根据上下判断该节点的常量类型
      if (constantType > ConstantTypes.NOT_CONSTANT) {
        if (constantType >= ConstantTypes.CAN_HOIST) {
          ;(child.codegenNode as VNodeCall).patchFlag =
            PatchFlags.HOISTED + (__DEV__ ? ` /* HOISTED */` : ``) //打上变量提升标记
          child.codegenNode = context.hoist(child.codegenNode!) //修改成简单表达式，并在上下文中保存该表达式
          hoistedCount++ // 被静态提升的子元素+1
          continue
        }
      } else {
        /* 虽然整个元素不可以被静态提升，但他的prop可能可以被静态提升。
         找出纯文本属性或者经过判断可静态提升的属性进行提升 */
      }
    } else if (
      //对文本进行提升
      child.type === NodeTypes.TEXT_CALL &&
      getConstantType(child.content, context) >= ConstantTypes.CAN_HOIST
    ) {
      child.codegenNode = context.hoist(child.codegenNode)
      hoistedCount++
    }

    // 递归子元素
    if (child.type === NodeTypes.ELEMENT) {
      const isComponent = child.tagType === ElementTypes.COMPONENT
      if (isComponent) {
        //如果是一个组价，增加插槽作用域层数
        context.scopes.vSlot++
      }
      walk(child, context)
      if (isComponent) {
        context.scopes.vSlot--
      }
    } else if (child.type === NodeTypes.FOR) {
      // 不能挂载只有一个元素的v-for节点，因为其必须是一个block
      walk(child, context, child.children.length === 1)
    } else if (child.type === NodeTypes.IF) {
      for (let i = 0; i < child.branches.length; i++) {
        // 同样不能提升只有一个子元素的v-if分支，其必须是一个block
        walk(
          child.branches[i],
          context,
          child.branches[i].children.length === 1
        )
      }
    }
  }

  //对静态节点进行变换，变换为字符串
  if (hoistedCount && context.transformHoist) {
    context.transformHoist(children, context, node)
  }

  // 如果静态提升的子元素个数等于原本子元素个数，则直接提升整个children数组
  if (
    hoistedCount &&
    hoistedCount === originalCount &&
    node.type === NodeTypes.ELEMENT &&
    node.tagType === ElementTypes.ELEMENT &&
    node.codegenNode &&
    node.codegenNode.type === NodeTypes.VNODE_CALL &&
    isArray(node.codegenNode.children)
  ) {
    node.codegenNode.children = context.hoist(
      createArrayExpression(node.codegenNode.children)
    )
  }
}
```

> 至于 getConstantType，主要是通过节点类型来判断是否可被提升，除了元素、文本、表达式以外其他都不是静态类型，而这三种还要似具体情况辨别其静态的类型。比如元素类型，需要检查其属性，子节点以及 bind 指令表达式是否静态，元素类型需要将其静态类型降到最低的属性、子节点、表达式的静态类型。

3. generate

**compiler-core/src/codegen.ts**

```typescript
export function generate(
  ast: RootNode,
  options: CodegenOptions & {
    onContextCreated?: (context: CodegenContext) => void
  } = {}
): CodegenResult {
  const context = createCodegenContext(ast, options) //获取代码生成器上下文
  if (options.onContextCreated) options.onContextCreated(context) //生命周期回调，如果

  /* 解构获取取上下文用于生成代码的函数 */

  const hasHelpers = ast.helpers.length > 0 //是否有在转换阶段存入helper

  /* 根据环境声明useWithBlock、genScopeId、isSetupInlined以决定生成代码的格式 */

  // 在setup()内联模式中，前文在子上下文中生成并分别返回。
  const preambleContext = isSetupInlined
    ? createCodegenContext(ast, options)
    : context
  if (!__BROWSER__ && mode === 'module') {
    //nodejs环境，将preambleContext修改为module模式上下文
    genModulePreamble(ast, preambleContext, genScopeId, isSetupInlined)
  } else {
    //浏览器环境，修改成function模式的上下文
    genFunctionPreamble(ast, preambleContext)
  }
  // 决定渲染函数名及参数
  const functionName = ssr ? `ssrRender` : `render`
  const args = ssr ? ['_ctx', '_push', '_parent', '_attrs'] : ['_ctx', '_cache']
  if (!__BROWSER__ && options.bindingMetadata && !options.inline) {
    // 非浏览器、非内联模式，绑定优化参数
    args.push('$props', '$setup', '$data', '$options')
  }
  const signature = //根据是否使用ts，决定使用何种签名
    !__BROWSER__ && options.isTS
      ? args.map(arg => `${arg}: any`).join(',')
      : args.join(', ')

  if (isSetupInlined) {
    //根据是否内联模式，使用function还是箭头函数
    push(`(${signature}) => {`)
  } else {
    push(`function ${functionName}(${signature}) {`)
  }
  indent() //换行并添加缩进

  if (useWithBlock) {
    push(`with (_ctx) {`)
    indent()
    // function模式的const声明应该在with块中，它们也应该被重命名，以避免与用户属性冲突
    if (hasHelpers) {
      //使用hepler引入需要用到的函数，并重命名
      push(
        `const { ${ast.helpers
          .map(s => `${helperNameMap[s]}: _${helperNameMap[s]}`)
          .join(', ')} } = _Vue`
      )
      /* 换行 */
    }
  }

  /* 生成资源（ast中声明的所有组件、指令、filters、临时变量）导入语句 */

  /* 非ssr，添加return */

  if (ast.codegenNode) {
    // 生成虚拟节点树表达式
    genNode(ast.codegenNode, context)
  }

  /* 一些完善语法的代码：缩进、添加'}'' */

  return {
    ast,
    code: context.code,
    preamble: isSetupInlined ? preambleContext.code : ``, //是内联模式则使用，前文上下文的前文
    map: context.map ? (context.map as any).toJSON() : undefined // 源码映射
  }
}
```

> 主要是根据不同的环境，nodejs、浏览器、ssr 生成对应的代码格式。genNode 更是简单，switch 判别不同的 ast 节点类型，根据不同类型插入相应的运行时用于创建虚拟节点的函数的代码字符串。

```typescript
// 映射的运行时函数，包括创建虚拟节点，组件、指令与过滤函数的解析等等
export const helperNameMap: any = {
  [FRAGMENT]: `Fragment`,
  [TELEPORT]: `Teleport`,
  [SUSPENSE]: `Suspense`,
  [KEEP_ALIVE]: `KeepAlive`,
  [BASE_TRANSITION]: `BaseTransition`,
  [OPEN_BLOCK]: `openBlock`,
  [CREATE_BLOCK]: `createBlock`,
  [CREATE_ELEMENT_BLOCK]: `createElementBlock`,
  [CREATE_VNODE]: `createVNode`,
  [CREATE_ELEMENT_VNODE]: `createElementVNode`,
  [CREATE_COMMENT]: `createCommentVNode`,
  [CREATE_TEXT]: `createTextVNode`,
  [CREATE_STATIC]: `createStaticVNode`,
  [RESOLVE_COMPONENT]: `resolveComponent`,
  [RESOLVE_DYNAMIC_COMPONENT]: `resolveDynamicComponent`,
  [RESOLVE_DIRECTIVE]: `resolveDirective`,
  [RESOLVE_FILTER]: `resolveFilter`,
  [WITH_DIRECTIVES]: `withDirectives`,
  [RENDER_LIST]: `renderList`,
  [RENDER_SLOT]: `renderSlot`,
  [CREATE_SLOTS]: `createSlots`,
  [TO_DISPLAY_STRING]: `toDisplayString`,
  [MERGE_PROPS]: `mergeProps`,
  [NORMALIZE_CLASS]: `normalizeClass`,
  [NORMALIZE_STYLE]: `normalizeStyle`,
  [NORMALIZE_PROPS]: `normalizeProps`,
  [GUARD_REACTIVE_PROPS]: `guardReactiveProps`,
  [TO_HANDLERS]: `toHandlers`,
  [CAMELIZE]: `camelize`,
  [CAPITALIZE]: `capitalize`,
  [TO_HANDLER_KEY]: `toHandlerKey`,
  [SET_BLOCK_TRACKING]: `setBlockTracking`,
  [PUSH_SCOPE_ID]: `pushScopeId`,
  [POP_SCOPE_ID]: `popScopeId`,
  [WITH_CTX]: `withCtx`,
  [UNREF]: `unref`,
  [IS_REF]: `isRef`,
  [WITH_MEMO]: `withMemo`,
  [IS_MEMO_SAME]: `isMemoSame`
}
```

## 运行时

1. createApp

**runtime-dom/src/index.ts**

```typescript
const createApp = ((...args) => {
  // 获取匿名单例的createApp函数，其中匿名单例可以返回 {render : FN , hydrate  : FN, createApp : FN }
  const app = ensureRenderer().createApp(...args)
  if (__DEV__) {
    injectNativeTagCheck(app)
    injectCompilerOptionsCheck(app)
  }
  /* 注入原生标签以及CompilerOptions 编译选项检查 其中CompilerOptions 在 webpack vite vue-cli 中进行配置 */

  // 对原有的mount方法进行二次包装
  const { mount } = app
  app.mount = (containerOrSelector: Element | ShadowRoot | string): any => {
    const container = normalizeContainer(containerOrSelector)
    if (!container) return
    const component = app._component
    if (!isFunction(component) && !component.render && !component.template) {
      component.template = container.innerHTML
      if (__COMPAT__ && __DEV__) {
        for (let i = 0; i < container.attributes.length; i++) {
          const attr = container.attributes[i]
          if (attr.name !== 'v-cloak' && /^(v-|:|@)/.test(attr.name)) {
            compatUtils.warnDeprecation(
              DeprecationTypes.GLOBAL_MOUNT_CONTAINER,
              null
            )
            break
          }
        }
      }
    }
    /* 将containerOrSelector参数转换为dom节点对象，string类型使用document.querySelector查找，其他原样返回 */

    /* 检查传进来的参数是否是函数式组件，或是否有render或template。
    若都没有则使用container.innerHTML作为模板。但需要注意，可能执行里面的js代码，所以ssr时，
    模板中最好不要包含任何用户数据。警告：在vue3中，模板容器不再被视为模板的一部分，其上的指令不会被执行*/

    // 在挂载之前清空内容
    container.innerHTML = ''
    //挂载并获得代理对象
    const proxy = mount(container, false, container instanceof SVGElement)
    if (container instanceof Element) {
      container.removeAttribute('v-cloak')
      container.setAttribute('data-v-app', '')
    }
    return proxy
  }
}) as CreateAppFunction<Element>
```

2. createAppAPI

**runtime-core/src/apiCreateApp.ts**

```typescript
function createAppApi<HostElement>(
  render: RootRenderFunction<HostElement>,
  hydrate?: RootHydrateFunction
): CreateAppFunction<HostElement> {
  return function createApp(rootComponent, rootProps = null) {
    // rootProps 必须是Object
    if (!isFunction(rootComponent)) {
      rootComponent = { ...rootComponent }
    }
    if (rootProps != null && !isObject(rootProps)) {
      __DEV__ && WARN(`ROOT PROPS PASSED TO APP.MOUNT() MUST BE AN OBJECT`)
      rootProps = null
    }
    // 创建app上下文 该上下文将存在于整个生命周期
    const context = createAppContext()
    const installedPlugins = new Set() // 安装的插件

    let isMounted = false

    const app: App = (context.app = {
      _uid: uid++, // 一个页面内可以存在多个vue实例 通过id标识区分
      _component: rootComponent as ConcreteComponent, // 根组件
      _props: rootProps, // 根组件 props
      _container: null, // dom容器节点
      _context: context, // app上下文
      _instance: null, // 虚拟节点实例

      version, // 版本号

      get config() {},
      set config(v) {},
      // 安装的plugin
      use(plugin: Plugin, ...options: any[]) {},
      // 全局混入组件
      mixin(mixin: ComponentOptions) {},
      // 全局组件
      component(name: string, component?: Component): any {},
      // 全局指令
      directive(name: string, directive?: Directive) {},
      mount() {},
      unmount() {},
      provide(key, value) {}
    })
    return app
  } // fn end
}
```

3. vnode

**runtime-core/src/vnode.ts**

```typescript
const vnode = {
  __v_isVNode: true,
  __v_skip: true,
  type, //传入的组件对象
  props, //传递给组件对象的参数
  key: props && normalizeKey(props), //取出所有传入的key
  ref: props && normalizeRef(props), //对props进行ref正规化
  scopeId: currentScopeId, //现在的作用域id
  slotScopeIds: null,
  children, //子节点
  component: null,
  suspense: null,
  ssContent: null,
  ssFallback: null,
  dirs: null,
  transition: null,
  el: null,
  anchor: null,
  target: null,
  targetAnchor: null,
  staticCount: 0,
  shapeFlag, // 虚拟节点类型标记
  patchFlag, // patch算法标记
  dynamicProps, //动态Props
  dynamicChildren: null,
  appContext: null
} as VNode
```

## render 与 patch

1. render

**runtime-core/src/renderer.ts**

```typescript
const render: RootRenderFunction = (vnode, container, isSVG) => {
  if (vnode == null) {
    if (container._vnode) {
      // 没有传入新的虚拟节点，当存在旧的虚拟节点，则卸载旧的虚拟节点
      unmount(container._vnode, null, null, true)
    }
  } else {
    // 存在新的虚拟节点 执行patch算法 比较新旧虚拟节点
    path(container._vnode || null, vnode, container, null, null, null, isSVG)
  }
  flushPreFlushCbs()
  // 卸载或者patch都会身任务高度器push任务 flushPostFlushCbs冲刷任务调度器
  flushPostFlushCbs()
  // 容器指向新的虚拟节点
  container._vnode = vnode
}
```

> 不展开讲 unmount，其主要工作为清除 ref，卸载组件、子节点、调用节点和指令的生命周期回调以及将副作用函数推入任务队列（节点内为调用 beforeUnmount 回调，任务为在卸载完所有子节点后，执行 flushPostFlushCbs 冲刷任务队列，执行 unmounted 回调）。

2. patch [!文章详解](https://www.jianshu.com/p/abd46fb77ec8)

**runtime-core/src/renderer.ts**

1. 创建需要新增的节点
2. 移除已经废弃的节点
3. 移动或修改需要更新的节点

```typescript
const patch: PatchFn = (
  n1, // 旧节点
  n2, // 新节点
  container, // 容器
  anchor = null, // 锚点，算法过程中的参考节点
  parentComponent = null,
  parentSuspense = null,
  isSVG = false,
  slotScopeIds = null,
  optimized = __DEV__ && isHmrUpdating ? false : !!n2.dynamicChildren // 优化模式标识
) => {
  if (n1 === n2) {
    //新旧节点是同一个对象，直接返回
    return
  }

  // 不是相同类型的节点，直接卸载旧节点
  if (n1 && !isSameVNodeType(n1, n2)) {
    anchor = getNextHostNode(n1)
    unmount(n1, parentComponent, parentSuspense, true)
    n1 = null
  }
  //被打过BAIL类型标记的节点退出优化模式。
  //比如非编译器生成，而是手动编写的渲染函数，认为总是新的，无法进行优化
  if (n2.patchFlag === PatchFlags.BAIL) {
    optimized = false
    n2.dynamicChildren = null
  }

  const { type, ref, shapeFlag } = n2
  switch (
    type //根据vNode类型，执行不同的算法
  ) {
    case Text: //文本类型
      processText(n1, n2, container, anchor)
      break
    case Comment: //注释类型
      processCommentNode(n1, n2, container, anchor)
      break
    case Static: //静态节点类型
      if (n1 == null) {
        mountStaticNode(n2, container, anchor, isSVG)
      } else if (__DEV__) {
        patchStaticNode(n1, n2, container, isSVG)
      }
      break
    case Fragment: //Fragment类型
      processFragment(/* 忽略参数 */)
      break
    default:
      if (shapeFlag & ShapeFlags.ELEMENT) {
        // 元素类型
        processElement(
          n1,
          n2,
          container,
          anchor,
          parentComponent,
          parentSuspense,
          isSVG,
          slotScopeIds,
          optimized
        )
      } else if (shapeFlag & ShapeFlags.COMPONENT) {
        // 组件类型
        processComponent(/* 忽略参数 */)
      } else if (shapeFlag & ShapeFlags.TELEPORT) {
        // TELEPORT 类型
        ;(type as typeof TeleportImpl).process(/* 忽略参数 */)
      } else if (__FEATURE_SUSPENSE__ && shapeFlag & ShapeFlags.SUSPENSE) {
        //SUSPENSE类型
        ;(type as typeof SuspenseImpl).process(/* 忽略参数 */)
      } else if (__DEV__) {
        //警告
        warn('Invalid VNode type:', type, `(${typeof type})`)
      }
  }

  // 设置ref
  if (ref != null && parentComponent) {
    setRef(ref, n1 && n1.ref, parentSuspense, n2 || n1, !n2)
  }
}
```

3. processText

**runtime-core/src/renderer.ts**

```typescript
const processText: ProcessTextOrCommentFn = (n1, n2, container, anchor) => {
  if (n1 == null) {
    // 旧节点不存在 直接创建文本节点并插入
    hostInsert(
      (n2.el = hostCreateText(n2.children as string)),
      container,
      anchor
    )
  } else {
    const el = (n2.el = n1.el!)
    if (n2.children !== n1.children) {
      hostSetText(el, n2.children as string)
    }
  }
}
```

4. processCommentNode

**runtime-core/src/renderer.ts**

```typescript
const processCommentNode: ProcessTextOrCommentFn = (
  n1,
  n2,
  container,
  anchor
) => {
  if (n1 == null) {
    // 旧节点不存在 直接创建文本节点并插入
    hostInsert(
      (n2.el = hostCreateComment((n2.children as string) || '')),
      container,
      anchor
    )
  } else {
    n2.el = n1.el
  }
}
```

5. mountStaticNode 挂载静态节点

**runtime-core/src/renderer.ts**

```typescript
const mountStaticNode = (
  n2,
  container: RenderElement,
  anchor: RenderNode | null,
  isSVG: boolean
) => {
  // 静态节点直接插入
  ;[n2.el, n2.anchor] = hostInsertStaticContent!(
    n2.children as string,
    container,
    anchor,
    isSVG,
    n2.el,
    n2.anchor
  )
}
```

6. patchStaticNode 更新静态节点

**runtime-core/src/renderer.ts**

```typescript
const patchStaticNode = (
  n1: VNode,
  n2: VNode,
  container: RendererElement,
  isSVG: boolean
) => {
  if (n2.children !== n1.children) {
    // 获取参照节点
    const anchor = hostNextSibling(n1.anchor!)
    // 移除旧节点
    removeStaticNode(n1)
    // 插入新节点
    ;[n2.el, n2.anchor] = hostInsertStaticContent!(
      n2.children as string,
      container,
      anchor,
      isSVG
    )
  } else {
    // 直接更新静态内容
    n2.el = n1.el
    n2.anchor = n1.anchor
  }
}
```

7. processFragment ##### Fragment 碎片化节点(包裹器)

**runtime-core/src/renderer.ts**

```typescript
const processFragment = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  slotScopeIds: string[] | null,
  optimized: boolean
) => {
  const fragmentStartAnchor = (n2.el = n1 ? n1.el : hostCreateText(''))!
  const fragmentEndAnchor = (n2.anchor = n1 ? n1.anchor : hostCreateText(''))!

  let { patchFlag, dynamicChildren, slotScopeIds: fragmentSlotScopeIds } = n2

  if (
    __DEV__ &&
    // #5523 dev root fragment may inherit directives
    (isHmrUpdating || patchFlag & PatchFlags.DEV_ROOT_FRAGMENT)
  ) {
    // HMR updated / Dev root fragment (w/ comments), force full diff
    patchFlag = 0
    optimized = false
    dynamicChildren = null
  }

  // check if this is a slot fragment with :slotted scope ids
  if (fragmentSlotScopeIds) {
    slotScopeIds = slotScopeIds
      ? slotScopeIds.concat(fragmentSlotScopeIds)
      : fragmentSlotScopeIds
  }

  if (n1 == null) {
    hostInsert(fragmentStartAnchor, container, anchor)
    hostInsert(fragmentEndAnchor, container, anchor)
    // a fragment can only have array children
    // since they are either generated by the compiler, or implicitly created
    // from arrays.
    mountChildren(
      n2.children as VNodeArrayChildren,
      container,
      fragmentEndAnchor,
      parentComponent,
      parentSuspense,
      isSVG,
      slotScopeIds,
      optimized
    )
  } else {
    if (
      patchFlag > 0 &&
      patchFlag & PatchFlags.STABLE_FRAGMENT &&
      dynamicChildren &&
      // #2715 the previous fragment could've been a BAILed one as a result
      // of renderSlot() with no valid children
      n1.dynamicChildren
    ) {
      // a stable fragment (template root or <template v-for>) doesn't need to
      // patch children order, but it may contain dynamicChildren.
      patchBlockChildren(
        n1.dynamicChildren,
        dynamicChildren,
        container,
        parentComponent,
        parentSuspense,
        isSVG,
        slotScopeIds
      )
      if (__DEV__ && parentComponent && parentComponent.type.__hmrId) {
        traverseStaticChildren(n1, n2)
      } else if (
        // #2080 if the stable fragment has a key, it's a <template v-for> that may
        //  get moved around. Make sure all root level vnodes inherit el.
        // #2134 or if it's a component root, it may also get moved around
        // as the component is being moved.
        n2.key != null ||
        (parentComponent && n2 === parentComponent.subTree)
      ) {
        traverseStaticChildren(n1, n2, true /* shallow */)
      }
    } else {
      // keyed / unkeyed, or manual fragments.
      // for keyed & unkeyed, since they are compiler generated from v-for,
      // each child is guaranteed to be a block so the fragment will never
      // have dynamicChildren.
      patchChildren(
        n1,
        n2,
        container,
        fragmentEndAnchor,
        parentComponent,
        parentSuspense,
        isSVG,
        slotScopeIds,
        optimized
      )
    }
  }
}
```

8. TeleportImpl 针对 teleport suspense

**runtime-core/src/renderer.ts runtime-core/src/components/Teleport.ts**

```typescript
const TeleportImpl = {
  __isTeleport: true,
  process() {},
  remove() {},
  move: moveTeleport,
  hydrate: hydrateTeleport
}
```

9. processComponent

**runtime-core/scr/renderer.ts**

```typescript
const processComponent = (
  n1: VNode | null,
  n2: VNode,
  container: RenderElement,
  anchor: RenderNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  slotScopeIds: string[] | null,
  optimized: boolean
) => {
  n2.slotScopedIds = slotScopeIds
  if (n1 == null) {
    if (n2.shapeFlag & ShapeFlags.COMPONENT_KEPT_ALIVE) {
      ;(parentComponent!.ctx as KeepAliveContext).active(
        n2,
        container,
        anchor,
        isSVG,
        optimized
      )
    } else {
      mountComponent(
        n2,
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        optimized
      )
    }
  } else {
    updateComponent(n1, n2, optimized)
  }
}
```

10. processElement

**runtime-core/src/renderer.ts**

```typescript
const processElement = (
  n1: VNode | null,
  n2: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  slotScopeIds: string[] | null,
  optimized: boolean
) => {
  isSVG = isSVG || (n2.type as string) === 'svg'
  if (n1 == null) {
    mountElement(
      n2,
      container,
      anchor,
      parentComponent,
      parentSuspense,
      isSVG,
      slotScopeIds,
      optimized
    )
  } else {
    patchElement(
      n1,
      n2,
      parentComponent,
      parentSuspense,
      isSVG,
      slotScopeIds,
      optimized
    )
  }
}
```

11. mountElement

**runtime-core/src/renderer.ts**

```typescript
const mountElement = (
  vnode: VNode,
  container: RendererElement,
  anchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  slotScopeIds: string[] | null,
  optimized: boolean
) => {
  let el: RendererElement, vnodeHook: VNodeHook | undefined | null
  const { type, props, shapeFlag, transition, dirs } = vnode
  el = vnode.el = hostCreateElement(
    vnode.type as string,
    isSVG,
    props && props.is,
    props
  )

  //先挂载子元素，因为有些道具可能依赖于子元素
  //已经呈现的，例如<select>
  if (shapeFlag & shapeFlags.TEXT_CHILDREN) {
    hostSetElementText(el, vnode.children as string)
  } else if (shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
    mountChildren(
      vnode.children as VNodeArrayChildren,
      el,
      null,
      parentComponent,
      parentSuspense,
      isSVG && type !== 'foreignObject',
      slotScopeIds,
      optimized
    )
  }

  if (dirs) {
    // 如有指令 挂载指令
    invokeDirectiveHook(vnode, null, parentComponent, 'created')
  }

  if (props) {
    for (const key in props) {
      if (key !== 'value' && !isReservedProp(key)) {
        hostPatchProp(
          el,
          key,
          null,
          props[key],
          isSVG,
          vnode.children as VNode[],
          parentComponent,
          parentSuspense,
          unmountChildren
        )
      }
    }
    if ('value' in props) {
      hostPatchProp(el, 'value', null, props.value)
    }
    if ((vnodeHook = props.onVnodeBeforeMount)) {
      invokeVNodeHook(vnodeHook, parentComponent, vnode)
    }
  }

  setScopeId(el, vnode, vnode.scopeId, slotScopeIds, parentComponent)

  if (__DEV__ || __FEATURE_PROD_DEVTOOLS__) {
    Object.defineProperty(el, '__vnode', {
      value: vnode,
      enumerable: false
    })
    Object.defineProperty(el, '__vueParentComponent', {
      value: parentComponent,
      enumerable: false
    })
  }

  if (dirs) {
    invokeDirectiveHook(vnode, null, parentComponent, 'beforeMount')
  }

  // suspense + suspense 嵌套
  const needCallTransitionHooks =
    (!parentSuspense || (parentSuspense && !parentSuspense.pendingBranch)) &&
    transition &&
    !transition.persisted

  if (needCallTransitionHooks) {
    transition!.beforeEnter(el)
  }

  hostInsert(el, container, anchor)

  if (
    (vnodeHook = props && props.onVnodeMounted) ||
    needCallTransitionHooks ||
    dirs
  ) {
    // 添加副作用
    queuePostRenderEffect(() => {
      vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, vnode)
      needCallTransitionHooks && transition!.enter(el)
      dirs && invokeDirectiveHook(vnode, null, parentComponent, 'mounted')
    }, parentSuspense)
  }
}
```

12. patchElement

**runtime-core/src/renderer.ts**

```typescript
const patchElement = (
  n1: VNode,
  n2: VNode,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  slotScopedIds: string[] | null,
  optimized: boolean
) => {
  const el = (n2.el = n1.el!)
  let { patchFlag, dynamicChildren, dirs } = n2

  ;(patchFlag != n1.patchFlag) & PatchFlags.FULL_PROPS
  const oldProps = n1.props || EMPTY_OBJ,
    newProps = n2.props || EMPTY_OBJ
  let vnodeHook: VNodeHook | undefined | null

  parentComponent && toggleRecurse(parentComponent, false)

  if ((vnodeHook = newProps.onVnodeBeforeUpdate)) {
    invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
  }

  if (dirs) {
    invokeDirectiveHook(n2, n1, parentComponent, 'beforeUpdate')
  }

  parentComponent && toggleRecurse(parentComponent, true)

  if (__DEV__ && isHmrUpdating) {
    patchFlag = 0
    optimized = false
    dynamicChildren = null
  }

  const areChildrenSVG = isSVG && n2.type !== 'foreignObject'

  if (dynamicChildren) {
    patchBlockChildren(
      n1.dynamicChildren!,
      dynamicChildren,
      el,
      parentComponent,
      parentSuspense,
      areChildrenSVG,
      slotScopeIds
    )
    if (__DEV__ && parentComponent && parentComponent.type.__hmrId) {
      traverseStaticChildren(n1, n2)
    }
  } else if (!optimized) {
    patchChildren(
      n1,
      n2,
      el,
      null,
      parentComponent,
      parentSuspense,
      areChildrenSVG,
      slotScopedIds,
      false
    )
  }

  if (patchFlag > 0) {
    if (patchFlag & PatchFlags.FULL_PROPS) {
      patchProps(
        el,
        n2,
        oldProps,
        newProps,
        parentComponent,
        parentSuspense,
        isSVG
      )
    } else {
      if (patchFlag & PatchFlags.CLASS) {
        if (oldProps.class !== newProps.class) {
          hostPatchProp(el, 'class', null, newProps.class, isSVG)
        }
      }
      if (patchFlag & PatchFlags.STYLE) {
        hostPatchProp(el, 'style', oldProps.style, newProps.style, isSVG)
      }

      if (patchFlag & PatchFlags.PROPS) {
        const propsToUpdate = n2.dynamicProps!
        for (let i = 0; i < propsToUpdate.length; i++) {
          const key = propsToUpdate[i],
            prev = oldProps[key],
            next = newProps[key]
          if (next !== prev || key === 'value') {
            hostPatchProp(
              el,
              key,
              prev,
              next,
              isSVG,
              n1.children as VNode[],
              parentComponent,
              parentSuspense,
              unmountChildren
            )
          }
        }
      }

      if (patchFlag & PatchFlags.TEXT) {
        if (n1.children !== n2.children) {
          hostSetElementText(el, n2.children as string)
        }
      }
    }
  } else if (!optimized && dynamicChildren == null) {
    patchProps(
      el,
      n2,
      oldProps,
      newProps,
      parentComponent,
      parentSuspense,
      isSVG
    )
  }

  if ((vnodeHook = newProps.onVnodeUpdated) || dirs) {
    queuePostRenderEffect(() => {
      vnodeHook && invokeVNodeHook(vnodeHook, parentComponent, n2, n1)
      dirs && invokeDirectiveHook(n2, n1, parentComponent, 'updated')
    }, parentSuspense)
  }
}
```

13. patchBlockChildren

**runtime-core/src/renderer.ts**

```typescript
const patchBlockChildren: PatchBlockChildrenFn = (
  oldChildren,
  newChildren,
  fallbackContainer,
  parentComponent,
  parentSuspense,
  isSVG,
  slotScopeIds
) => {
  for (let i = 0; i < newChildren.length; i++) {
    const oldVNode = oldChildren[i],
      newVNode = newChildren[i]
    const container =
      oldVNode.el &&
      (oldVNode.type === Fragment ||
        isSameVNodeType(oldVNode, newVNode) ||
        oldVNode.shapeFlag & (ShapeFlags.COMPONENT | ShapeFlags.TELEPORT))
        ? hostParentNode(oldVNode.el)!
        : fallbackContainer

    patch(
      oldVNode,
      newVNode,
      container,
      null,
      parentComponent,
      parentSuspense,
      isSVG,
      slotScopeIds,
      true
    )
  }
}
```

14. patchChildren

**runtime-core/src/renderer.ts**

```typescript

const patchChildren:PatchChildrenFn = (n1,n2,container,anchor,parentComponent,parentSuspense,isSVG,slotScopeIds , optimized=false ) => {
  const c1 = n1 && n1.children , prevShapeFlag = n1 && n1.shapeFlag : 0 , c2 = n2.children

  const { patchFlag , shapeFlag } = n2

  if(patchFlag > 0) {
    // 掘金文章 https://juejin.cn/post/7190796322247540793#heading-8
    if (patchFlag & PatchFlags.KEYED_FRAGMENT) {
      // 如果 patchFlag 是存在 key 值的 Fragment：KEYED_FRAGMENT，则调用 patchKeyedChildren 来继续处理子节点。
      patchKeyedChildren(
        c1 as VNode [] ,
        c2 as VNodeArrayChildren ,
        container ,
        anchor ,
        parentComponent ,
        parentSuspense ,
        isSVG ,
        slotScopeIds ,
        optimized
      )
      return
    } else if (patchFlag & PatchFlags.UNKEYED_FRAGMENT) {
      // patchFlag 是没有设置 key 值的 Fragment: UNKEYED_FRAGMENT，则调用 patchUnkeyedChildren 处理没有 key 值的子节点
      //不进行diff比较 根据长度直接挂载或者卸载,
      //可见key的重要性,没有key很可能会混乱
      patchUnkeyedChildren(
        c1 as VNode[] ,
        c2 as VNodeArrayChildren ,
        container ,
        anchor ,
        parentComponent ,
        parentSuspense ,
        isSVG ,
        slotScopeIds ,
        optimized
      )
      return
    }

  }
  // 节点 => 文本 数组 或者 没有子元素
  if(shapeFlag & ShapeFlags.TEXT_CHILDREN) {
    // 数组
    if(prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) {
      // 卸载旧节点
      unmountChildren(c1 as VNode[], parentComponent , parentSuspense)
    }
    if(c2 !== c1) {
      // 设置 节点文本内容
      hostSetElementText(container, c2 as string)
    }
  }else {
    if(prevShapeFlag & ShapeFlags.ARRAY_CHILDREN) { // 旧节点是数组
      if(shapeFlag & ShapeFlags.ARRAY_CHILDREN) {   // 新节点是数组
        // 调用 patchKeyedChildren 进行完整的 diff
        patchKeyedChildren(
          c1 as VNode[] ,
          c2 as VNodeArrayChildren ,
          container ,
          anchor ,
          parentComponent ,
          parentSuspense ,
          isSVG ,
          slotScopeIds ,
          optimized
        )
      }else {
        // 新子节点不是数组类型，则说明不存在新子节点，直接从树中卸载旧节点即可
        unmountChildren(c1 as VNode[] , parentComponent , parentSuspense , true )
      }
    }else {
      if(prevShapeFlag & ShapeFlags.TEXT_CHILDREN){
        // 旧子节点是文本类型，由于已经在一开始就判断过新子节点是否为文本类型，那么此时可以肯定新子节点肯定不为文本类型，则可以直接将元素的文本置为空字符串
        hostSetElementText(container,'')
      }
      if(shapeFlag & ShapeFlags.ARRAY_CHILDREN) {
        // 新子节点是类型为数组类型，而旧子节点不为数组，说明此时需要在树中挂载新子节点，进行 mount 操作即可。
        mountChildren(
          c2 as VNodeArrayChildren ,
          container ,
          anchor ,
          parentComponent ,
          parentSuspense ,
          isSVG ,
          slotScopeIds ,
          optimized
        )
      }
    }
  }

}


```

15. **patchKeyedChildren**

**runtime-core/src/renderer.ts**

```typescript
const patchKeyedChildren = (
  c1: VNode[],
  c2: VNodeArrayChildren,
  container: RendererElement,
  parentAnchor: RendererNode | null,
  parentComponent: ComponentInternalInstance | null,
  parentSuspense: SuspenseBoundary | null,
  isSVG: boolean,
  slotScopeIds: string[] | null,
  optimized: boolean
) => {
  let i = 0,
    l2 = c2.length,
    e1 = c1.length - 1,
    e2 = l2 - 1
}
```

> 遍历子节点的索引 i = 0 新子节点长度：l2 旧子节点的末尾索引：e1 新子节点的末尾索引：e2

#### 新前与旧前

[!新前与旧前](https://github.com/474366498/vue3/blob/main/read~md/patch/1634490-d74d11a0719948d4.webp)

```typescript
while (i <= e1 && i <= e2) {
  const n1 = c1[i],
    n2 = (c2[i] = optimized
      ? cloneIfMounted(c2[i] as VNode)
      : normalizeVNode(c2[i]))
  // 新旧节点是否是同一类型vnode
  if (isSameVNodeType(n1, n2)) {
    patch(
      n1,
      n2,
      container,
      null,
      parentComponent,
      parentSuspense,
      isSVG,
      slotScopeIds,
      optimized
    )
  } else {
    // 如果不是同一类型 则跳出循环
    break
  }
  i++
}
```

> 当 i = 0 时，比较第 0 个索引，发现 C1 的 A 节点 与 C2 节点的 A 节点 是同一类型的元素，则会对新旧的 A 节点进行 patch 操作，在这里进行 patch 能够递归的去访问 A 节点下的所有子节点，patch 完成后递增索引 i 。
> 发现 C1 的 B 节点与 C2 的 B 节点也是同一类型的元素，与之前一样对 B 节点进行 patch 递归后递增 i 索引
> 当比较第三个子节点时，会发现 C1 的 C 节点与 C2 的 D 节点并不是同一类型的节点，所以会 break 跳出新前与旧前的比较循环，于是新前与旧前的比较结束

#### 新后与旧后

[!新后与旧后](https://github.com/474366498/vue3/blob/main/read~md/patch/1634490-3d24729a5de6eafe.webp)

```typescript
while (i <= e1 && i <= e2) {
  const n1 = c1[e1],
    n2 = (c2[e2] = optimized
      ? cloneIfMounted(c2[e2] as VNode)
      : normalizeVNode(c2[e2]))
  //比较新旧节点是否是同一类型
  if (isSameVNodeType(n1, n2)) {
    patch(
      n1,
      n2,
      container,
      null,
      parentComponent,
      parentSuspense,
      isSVG,
      slotScopeIds,
      optimized
    )
  } else {
    // 如果不是同一类型 跳出循环
    break
  }
  // 尾索引递减
  e1--
  e2--
}
```

> 从末尾开始，C1 是 C 节点，而 C2 也是 C 节点，两个节点的类型相同，开始进行 patch 比较，待 patch 完成后，新旧子节点的末尾索引 - 1。
> 进行第二次比较，C1 的末尾是 B 节点，C2 的末尾是 B 节点，类型相同，进行 patch，之后递减尾部索引。
> 进行第三次比较，C1 的末尾节点是 A，C2 的末尾节点是 E，类型不同，break 跳出新后与旧后的比较循环。

#### 常规顺序的新子节点挂载

[!常规顺序的新子节点挂载](https://github.com/474366498/vue3/blob/main/read~md/patch/1634490-e9c0da8e31e6d5bf.webp)

```typescript
// 旧节点遍历完
if (i > e1) {
  // 新节点还有元素未遍历完
  if (i <= e2) {
    const nextPos = e2 + 1,
      // 取得锚点元素
      anchor = nextPos < l2 ? (c2[nextPos] as VNode).el : parentAnchor
    // 遍历剩余的新节点
    while (i <= e2) {
      // 进行对比  path 第一个参数为null 代表没有旧项目点直接进行插入操作
      path(
        null,
        (c2[i] = optimized
          ? cloneIfMounted(c2[i] as VNode)
          : normalizeVNode(c2[i])),
        container,
        anchor,
        parentComponent,
        parentSuspense,
        isSVG,
        slotScopeIds,
        optimized
      )
      i++
    }
  }
}
```

> 当我们完成了前两轮的比较后，此时往往能在常规的序号上发现一些新子节点中存在，而旧子节点中没有的元素，此时就需要将这些新增的子节点插入
> 当新前与旧前的比较完成后，此时索引 i 已经递增的超过 C1 子节点的长度，此时 i = 2，并且 i 还小于等于 C2 子节点的长度，于是可以判定在新子节点中还有节点没有被遍历到，此时旧子节点已经全部遍历完，所以将未被遍历的子节点全部插入即可

#### 常规顺序的移除多余节点

[!常规顺序的移除多余节点](https://github.com/474366498/vue3/blob/main/read~md/patch/1634490-53e2272efe96b0e9.webp)

```typescript

else if (i > e2) {  // 新节点遍历完了
  while(i<= e1 ) {
    // 循环移除旧节点
    unmount(c[i],parentComponent,parentSuspense,true)
    i++
  }
}

```

> 当新子节点已经全部遍历完时，如果此时旧子节点还有元素未被遍历，那么可以判定剩余的旧子节点已经不再需要了，所以直接将剩余旧子节点移除即可

#### 未知顺序的子节点比较

[!未知顺序的子节点比较](https://github.com/474366498/vue3/blob/main/read~md/patch/1634490-fb17484909a6eff5.webp)

```typescript
//新旧节点的新索引
const s1 = i,
  s2 = i
// 用于存放新节点下标位置 ([vnode.key : index] ,...)
const keyToNewIndexMap: Map<string | number | symbol, number> = new Map()
for (i = s2; i <= e2; i++) {
  const nextChild = (c2[i] = optimized
    ? cloneIfMounted(c2[i] as VNode)
    : normalizeVNode(c2[i]))
  if (nextChild.key != null) {
    if (__DEV__ && keyToNewIndexMap.has(nextChild.key)) {
      warn('key重复提醒')
    }
  }
  keyToNewIndexMap.set(nextChild.key, i)
}

/*
  遍历旧节点 尝试 patch比较需要被patch的节点 并移除不会再出现的子节点
*/
let j,
  patched = 0,
  toBePatched = e2 - s2 + 1
let moved = false
// 用于跟踪是否有节点发生移动
let maxNewIndexSoFar = 0
// 用于确定最长递增子序列
const newIndexToOldIndexMap = new Array(toBePatched)
for (i = 0; i < toBePatched; i++) newIndexToOldMap[i] = 0

for (i = s1; i < e1; i++) {
  const prevChild = c1[i]
  if (patched >= toBePatched) {
    // 所有新节点都被patch 移除剩下的旧节点
    unmount(prevChild, parentComponent, parentSuspense, true)
    continue
  }
  let newIndex
  if (prevChild.key != null) {
    newIndex = keyToNewIndexMap.get(prevChild.key)
  } else {
    // 对于找不到key的节点 尝试去定位 相同 type 节点
    for (j = s2; j <= e2; j++) {
      if (
        newIndexToOldIndexMap[j - s2] === 0 &&
        isSameVNodeType(prevChild, c2[j] as VNode)
      ) {
        newIndex = j
        break
      }
    }
  }
  // 如果旧节点不能匹配到对应的新节点 ， 则移除旧节点
  if (newIndex == undefined) {
    unmount(prevChild, parentComponent, parseSuspense, true)
  } else {
    // 在newIndexToOldIndexMap 记录下被patch的节点索引
    newIndexToOldIndexMpa[newIndex - s2] = i + 1
    // 如果 newIndex的索引大于最远移动的索引 则更新
    if (newIndex >= maxNewIndexSoFar) {
      maxNewIndexSoFar = newIndex
    } else {
      // 标记moved 为true
      moved = true
    }
    // 对新旧节点进行patch
    patch(
      prevChild,
      c2[newIndex] as VNode,
      container,
      null,
      parentComponent,
      parentSuspense,
      isSVG,
      slotScopeIds,
      optimized
    )
    patched++
  }
}
```

> 声明 s1、s2 两个变量，并将此时遍历的前序索引 i 赋值给 s1、s2。s1、s2 分别表示新旧子节点的起始索引

> 以 s2 为起始节点，e2 为结束条件，遍历新子节点，用新子节点中子节点的 key 为键，索引 i 为值，生成一个 Map 对象, 存放原始索引。

> > 如果此时发现有子节点中有重复的键，就会发出一个所有 Vue 开发者都很熟悉的警告:Duplicate keys found during update xxx, Make sure keys are unique。

> 声明变量 toBePatched，计算还有几个节点需要被 patch。声明变量 patched = 0，记录 patch 的节点数

> 声明一个 newIndexToOldIndexMap 的数组，用于后续确定最长递增子序列，newIndexToOldIndexMap 数组大小为 toBePatched 的长度，并将数组内所有元素初始化为 0
>
> > newIndexToOldIndexMap，形式是 Map\<newIndex, oldIndex\>
> > 需要注意的是里面存储的 oldIndex 是索引是偏移 +1 的
> > oldIndex = 0 是一个特殊值，表示新子节点中没有对应的旧子节点

> 遍历旧子节点，将当前被遍历的子节点标记为 prevChild

> > 如果 patched 大于等于 toBePatched，说明需要被 patch 的节点已经全部比较完毕，则可以将剩余的 prevChild 移除。
> > 否则声明变量 newIndex。
> > 如果 prevChild 的 key 不为空，则从 keyToIndexMap 中取 prevChild.key 的值，将获取到的值赋值给 newIndex。
> > 如果 newIndex 没有值，则说明在新子节点中没有对应的旧子节点，直接移除 prevChild 旧子节点。
> > 否则在 newIndexToOldIndexMap 中存下新的索引，并标记当前索引移动的最远位置或增加移动标记，并对新旧子节点进行 patch 比较。
> > 在完成 patch 后，将 patched 计数递增。

```typescript
/* 移动 挂载 */
// 当节点被移动时，创建最长递增子序列
const increasingNewIndexSequence = moved
  ? getSequence(newIndexToOldIndexMap)
  : EMPTY_ARR
j = increasingNewIndexSequence.length - 1

// 为了能方便的获取锚点 选择从后向前遍历
for (i = toBePatched - 1; i >= 0; i--) {
  const newIndex = s2 + i,
    nextChild = c2[nextIndex] as VNode
  const anchor =
    nextIndex + 1 < l2 ? (c2[nextIndex + 1] as VNode).el : parentAnchor
  if (newIndexToOldIndexMap[i] === 0) {
    // 如果在newIndexToOldIndexMap中找不到对应的索引 则新增节点
    patch(
      null,
      nextChild,
      container,
      anchor,
      parentComponent,
      parentSuspense,
      isSVG,
      slotScopeIds,
      optimized
    )
  } else if (moved) {
    // 如果不是一个稳定的子序列或者当前节点不在递增子序列上 就移动节点
    if (j < 0 || i !== increasingNewIndexSequence[j]) {
      move(nextChild, container, anchor, MoveType.REORDER)
    } else {
      j--
    }
  }
}
```

> 如果有 moved 标记，则从 newIndexToOldIndexMap 中找到最长递增子序列，并将 j 赋值为最长递增子序列数组的末尾索引

> 从后往前的遍历新子节点，这样可以使我们确定锚点元素的位置

> 声明 newIndex = s2 + i，即为最后一个需要被 patch 的节点

> 获取锚点元素

> 如果这个需要被 patch 的节点，i 索引在 newIndexToOldIndexMap 中的值为 0。还记得笔者之前提示的，0 是一个特殊值，代表该节点在旧子节点中没有对应的节点吧。那么对于没有对应节点的元素，我们就对它采用插入操作

> 如果 newIndexToOldIndexMap 中有对应索引，但是存在 moved 标记，说明节点可能移动，应该继续判断
>
> > 如果 j < 0，说明最长递增子序列中的所有节点都已经处理过。或者当索引 i 不等于最长增长子序列中索引 j 对应的值时，说明该节点并不处在一个相对稳定的位置，则需要进行移动操作
> > 如果满足上述条件，j 索引递减，不用处理该节点

16.

17.

**runtime-core/src/renderer.ts**

#### 对比过程

1. 当新旧节点为同一个节点时，直接退出 patch。
2. 当新旧节点不是同一个类型时直接卸载旧节点，isSameVNodeType 的代码很简单，就只是 n1.type === n2.type && n1.key === n2.key，即除了类型以外，还要判断 key 是否相同。
3. 当新节点被打上 BAIL 标记，则退出优化模式。
4. 根据节点的不同类型，执行不同的处理算法。
