let effectWeakMap = new WeakMap()
let activeEffect = null       // 副作用标识 用于 注册
const reactive = (data) => {
    return new Proxy(data, {
        set(target, key, value) {
            target[key] = value
            let effectMap = effectWeakMap.get(target)
            if(effectMap){
                let effectSet = effectMap.get(key)
                effectSet && effectSet.forEach(fn => fn())
            }

        },
        get(target, key) {
            if (activeEffect) {
                let effectMap = effectWeakMap.get(target) || new Map()
                console.log(17,target,effectMap)
                let effectSet = effectMap.get(key) || new Set()
                effectSet.add(activeEffect)
                effectMap.set(key, effectSet)
                effectWeakMap.set(target,effectMap)
            }
            return target[key]
        }
    })
}
let data = reactive({ name: 'name', age: 20 })
let state = reactive({ name: 'state', age: 20 })

const regeisterEffect = (fn) => {
    if (typeof fn !== 'function') return
    activeEffect = fn
    fn()
    activeEffect = null
}

regeisterEffect(function effectName() {
    console.log(37, data.name)
})
regeisterEffect(function effectState() {
    console.log(40, state.name)
})
console.log(42, effectWeakMap )

setTimeout(function () {
    data.name = 'change name '
    console.log(46, data)
}, 300)