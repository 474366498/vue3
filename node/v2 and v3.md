
#vue 差别#
    options Api                     composition Api
    defineProperty                  proxy
    所有的api全部挂在Vue对象上        import 单独引用（import）
    vue mixins                      composition 提取



reactive ts 

export {
  reactive,
  readonly,
  isReactive,
  isReadonly,
  isShallow,
  isProxy,
  shallowReactive,
  shallowReadonly,
  markRaw,
  toRaw,
  ReactiveFlags,
  DeepReadonly,
  ShallowReactive,
  UnwrapNestedRefs
} from './reactive'


createReactiveObject (target,isReadonly,baseHandlers,collectionHandlers,proxyMap)

target   Target 对象
isReadonly  isReadonly 布尔值
baseHandlers ProxyHandler
collectionHandlers   ProxyHandler
proxyMap  WeakMap 

ProxyHandler 
    类似 Reflect 对象(Reflect 的所有静态方法)
        apply(target , thisArg ,args)
        construct(target,args )
        get(target,name,receiver)
        set(target,name,value,receiver)
        defineProperty (target,name,desc)
        deleteProperty(target,name)
        has(target,name)
        ownKeys(target)
        isExtensible(target) 
        preventExtensions(target)
        getOenPropertyDescriptor(target,name)
        getPrototypeOf(target)
        setPrototypeOf(target,prototype)

    reactive code 简历
        export function reactive(target: object) {
        // if trying to observe a readonly proxy, return the readonly version.
        if (isReadonly(target)) {
            return target
        }
        return createReactiveObject(
            target,
            false,
            mutableHandlers,
            mutableCollectionHandlers,
            reactiveMap
        )
        }
        export function shallowReactive<T extends object>(
        target: T
        ): ShallowReactive<T> {
        return createReactiveObject(
            target,
            false,
            shallowReactiveHandlers,
            shallowCollectionHandlers,
            shallowReactiveMap
        )
        }

        export function readonly<T extends object>(
        target: T
        ): DeepReadonly<UnwrapNestedRefs<T>> {
        return createReactiveObject(
            target,
            true,
            readonlyHandlers,
            readonlyCollectionHandlers,
            readonlyMap
        )
        }

        export function shallowReadonly<T extends object>(target: T): Readonly<T> {
        return createReactiveObject(
            target,
            true,
            shallowReadonlyHandlers,
            shallowReadonlyCollectionHandlers,
            shallowReadonlyMap
        )
        }

    computed code 简历
        export {
        computed,
        ComputedRef,
        WritableComputedRef,
        WritableComputedOptions,
        ComputedGetter,
        ComputedSetter
        } from './computed'
    注 computed 
        1. 计算属性是一个effect 通过dirty(boolean) change 进行响应式改变
        2. 计算属性的依赖属性会收集effect
        3. 计算属性具备依赖收集的功能，会收集对应的effect方法
        4. 第一次执行时 dirty => true  第一次执行后 为dirty => false 
            if (self._dirty || !self._cacheable) {
                self._dirty = false
                self._value = self.effect.run()!
            }
        5. 计算属性发生修改(change) 当前 dirty => false 
            this.effect = new ReactiveEffect(getter, () => {
                if (!this._dirty) {  // false 进行修改
                    this._dirty = true
                    triggerRefValue(this)
                }
            })

