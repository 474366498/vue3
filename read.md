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

#### 对比过程

1. 当新旧节点为同一个节点时，直接退出 patch。
2. 当新旧节点不是同一个类型时直接卸载旧节点，isSameVNodeType 的代码很简单，就只是 n1.type === n2.type && n1.key === n2.key，即除了类型以外，还要判断 key 是否相同。
3. 当新节点被打上 BAIL 标记，则退出优化模式。
4. 根据节点的不同类型，执行不同的处理算法。
