笔记本

Proxy(data,{
    set (target,key,value){
        target[key] = value 
    },
    get (target,key) {
        return target[key]
    }
})


vue 依赖收集 
  1. 创建一个全局变量 map 
  2. 在proxy get中进行添加注册 
  3. 在proxy set中通过key进行执行操作

  `
    let effectMap = new Map()
    let activeEffect = null       // 副作用标识 用于 注册
    const reactive = (data) => {
        return new Proxy(data, {
            set(target, key, value) {
                let effectSet = effectMap.get(key)
                effectSet && effectSet.forEach(fn => fn() )
                target[key] = value
            },
            get(target, key) {
                if(activeEffect){
                    let effectSet = effectMap.get(key) || new Set() 
                    effectSet.add(activeEffect)
                    effectMap.set(key,effectSet)
                }
                return target[key]
            }
        })
    }
    let data = reactive({ name: 'name', age: 20 })

    const regeisterEffect = (fn) => {
        if(typeof fn !== 'function') return 
        activeEffect = fn 
        fn() 
        activeEffect = null 
    }

    regeisterEffect(function effectName(){
        console.log(25, data.name)
    })
    console.log(32,effectMap )

    setTimeout(function () {
    data.name = 'change name '
    console.log(36,data)
    }, 300)



  `