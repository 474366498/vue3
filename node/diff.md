# [来自](https://www.jianshu.com/p/c9829b514a58)#
## Snabbdom ##
diff 算法就是用来计算出 Virtual Dom 中被改变的部分。因为Vue React 框架都是 只用改变状态类影响视图自动更新，因此当数据状发生变化时候要计算出 对应的最小的变化的部分，而不是重新渲染政整个页面，以此达到节约性能的目的。

h 函数的实现

三种形态 
1. h('div',{},'文字')
2. h('div',{},[]) 
3. h('div',{},h())

code
function vNode (sel,data,children,text,elm) {
    return {
        sel ,
        data ,
        children ,
        text , 
        elm ,
        key : data.key
    }
} 

function h (sel ,data,c) {
    if(argument.length !== 3) {
        throw new Error('argument ')
    }

    if(typeof c === 'string ' || typeof === 'number'){
        return vNode(sel,data,undefined,c,undefined)
    }else if (Array.isArray(c)) {
        let children = [] 
        for(let i = 0 ; i < c.length ; i++) {
            let item = c[i]
            if(typeof item !=='object' && item.hasOwnProperty('sel')){
                throw new Error('传入项目中有的不是函数方式')
            }
            children.push(item)
        }
        return vNode(sel,data,children,null,null)
    }else if(typeof c === "object" && c.hasOwnProperty('sel')){
    // 形态3
    // 说明传入的是唯一的children, 不用执行c, c 在上面调用 hasOwnProperty 时候已经调用了h函数，并返回为虚拟节点
    let children = c
    return vNode(sel, data,children,undefined,undefined)
    }else {
        throw new Error("参数格式错误")
    }
}

# patch函数的实现#
## 步骤分析：
1. patch 函数被调用时候，先判断 oldVnode是不是虚拟节点，如果是DOM节点，就将 oldVnode 包装为虚拟节点。

2. 再判断，oldVNode, newVNode 是不是同一个节点，怎么算是同一个节点呢，之前有提到过: 标签 和 key 相等；

3. 如果 oldVNode, newVNode不是同一个节点，就暴力删除旧的，插入新的

注意：创建节点时候，它的子节点是需要递归创建插入的

4. 如果 oldVNode, newVNode 是同一个节点，就需要进行精细化比较

5. 继续精细化比较判断处理

6. oldVNode, newVNode是不是内存中同一个对象，如果是就略过，什么也不用做

7. 如果不是，在进行判断 newVNode中有没有text属性

8. 如果newVNode中有text属性，在判断 newVNode中的text属性和 oldVNode 中的 text 属性是否相同

    1. 如果相同，就什么也不错
    2. 如果不同，就把oldVNode.elm中innerText 变为 newVNode 的 text 属性 (**注意，这里假如 oldVNode中有children属性而没有text属性，那么也没事，因为innerText一旦改变为 newVNode 的 text ，老节点中的children属性会自动删除 **)

9. 如果 newVNode中没有text属性，意味着 newVNode 有children属性，在进行判断 oldVNode 中有没有children属性

10. 如果 oldVNode 没有children属性，意味着 oldVNode 有text属性，此时要清空 oldVNode.elm 中的 innerText 并且把 children 子节点转换的 子DOM节点插入到 oldVNode.elm 中

11. 如果 oldVNode 有 children 属性，这里就是 oldVNode newVNode都有children节点，此事要进行终结判断比较。

12. 这里就需要提到四中命中查找了。newVNode 的头和尾 ：新前和新后，oldVNode的头和尾：旧前和旧后。 为什么这种算法优秀，因为它符合人们的编程习惯。

13. 定义四个指针 newStartIndex, newEndIndex, oldStartIndex, oldEndIndex , 同时四个指针对应四个节点：newStartNode,、newEndNode、oldStartNode、oldEndNode; 当 oldStartIndex<=oldEndIndex && newStartIndex <= newEndIndex 时候就进行while循环，










