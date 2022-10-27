
runtime 
    runtime-core 核心 平台兼容
    runtime-dom  浏览器
    runtime-test 测试

    runtime-dom  
        节点操作方法全集  nodeOps.ts 
            insert 
            remove  
            createElement
            createText 
            createComment 
            setText 
            ...
        节点属性操作 对比  patchProp.ts
           class 
           style       
           event  


    runtime-core 基础模板内容操作 多平台 模板处理
        createRenderer                   浏览器 
        createHydrationRenderer          服务端 ssr

        baseCreateRenderer(rendererOptions , fn : element / hydrationFn )

        createVNodeWithArgsTransform
        
        createVNode (type,props,children)  return vnode
            虚拟节点 用对象的方式描述节点信息  跨平台
            vnode {
                __v_isVNode : true ,
                type ,
                props ,
                children ,
                key , // diff算法关键字
                component , // 组件节点实例
                el          // 虚拟节点对应的真实节点
            }
            
        createRender(renderOptions){
            // 组件挂载 initialVNode 组件虚拟节点  container id节点
            mountComponent = (initialVNode,container) =>{ 

                instance = initialVNode.component = createComponentInstance ()  
            }
        }
            createComponentInstance (vnode){   // 创建组件实例(虚拟节点)
                type = vnode.type
                instance = {
                    vnode ,  //实例存放易燃虚拟节点
                    type : ,//组件对象
                    subTree : null ,// 组件渲染的内容 
                    ctx: {} ,//组件上下文
                    props : {} , // 组件props属性
                    attrs : {} , //组件中非props属性
                    slots : {} , // 组件插槽
                    setupState : {}, // setup返回的状态
                    porpsOptions: type.props , //属性选项
                    proxy : null , // 实例的代理对象
                    render : null , // 组件的渲染函数
                    emit : null ,  // 事件触发
                    exposed : {} , // 暴露的方法
                    isMounted : false  //是否挂载完成
                }
                instance.ctx = {_:instance}   // 后续进行代理
            }




            setupComponent(instance){ //启动组件  inatance 属性初始化(props,attrs,children)
                const {props,children } = instance.vnode 
                initProps (instance,props)  // 校验类型????
                initSlots(instance , children) // 插槽
                setupStateFulComponent(instance) // 调用setup拿到返回值 
            }
            
            
            initProps(instance , rawProps) { // 校验类型???? 把rawProps 分成 props attrs 
                options = Object.keys(instance.propsOption)  // 注册过的props 

                // instance props 响应式 attrs 非响应式

            }
            setupStateFulComponent (instance) {
                let Conponent = instance.type 
                const {setup} = instance.type
                instance.proxy = new Proxy (instance.ctx,PublicInstanceProxyHandlers)     /// 
                if(setup) {
                    ctx = createSetupContext()
                    ctx = {
                        attrs ,
                        slots ,
                        emit ,
                        expose 
                    }
                    setup(instance.props,ctx)
                }

            }
            <!--  
                let obj = {a:1,b:2}
                console.log(obj.hasOwnProperty('a'))
                console.log(Object.prototype.hasOwnProperty.call(obj,'a') )
            -->
            const hasOwn = (value,key) => Object.prototype.hasOwnProperty.call(value,key)

            PublicInstanceProxyHandlers = {
                get ({_:instance},key) {
                    const {setupState , props} = instance 
                    if(hasOwn(setupState,key)) {
                        return setupState[key]
                    }else if(hasOwn(props,key)) {
                        return props[key]
                    }else {
                        // ...
                    }
                },
                set ({_:instance},key,value) {
                    
                    return true 
                }
            }

























