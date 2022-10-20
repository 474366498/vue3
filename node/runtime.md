
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



