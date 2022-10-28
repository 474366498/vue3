# vue diff

# [v2 diff 来自](https://www.jianshu.com/p/c9829b514a58)#

## Snabbdom

diff 算法就是用来计算出 Virtual Dom 中被改变的部分。因为 Vue React 框架都是 只用改变状态类影响视图自动更新，因此当数据状发生变化时候要计算出 对应的最小的变化的部分，而不是重新渲染政整个页面，以此达到节约性能的目的。

h 函数的实现

三种形态

1. h('div',{},'文字')
2. h('div',{},[])
3. h('div',{},h())
``` javascript
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
```
# patch 函数的实现#

## 步骤分析：

1. patch 函数被调用时候，先判断 oldVnode 是不是虚拟节点，如果是 DOM 节点，就将 oldVnode 包装为虚拟节点。

2. 再判断，oldVNode, newVNode 是不是同一个节点，怎么算是同一个节点呢，之前有提到过: 标签 和 key 相等；

3. 如果 oldVNode, newVNode 不是同一个节点，就暴力删除旧的，插入新的

注意：创建节点时候，它的子节点是需要递归创建插入的

4. 如果 oldVNode, newVNode 是同一个节点，就需要进行精细化比较

5. 继续精细化比较判断处理

6. oldVNode, newVNode 是不是内存中同一个对象，如果是就略过，什么也不用做

7. 如果不是，在进行判断 newVNode 中有没有 text 属性

8. 如果 newVNode 中有 text 属性，在判断 newVNode 中的 text 属性和 oldVNode 中的 text 属性是否相同

   1. 如果相同，就什么也不错
   2. 如果不同，就把 oldVNode.elm 中 innerText 变为 newVNode 的 text 属性 (**注意，这里假如 oldVNode 中有 children 属性而没有 text 属性，那么也没事，因为 innerText 一旦改变为 newVNode 的 text ，老节点中的 children 属性会自动删除 **)

9. 如果 newVNode 中没有 text 属性，意味着 newVNode 有 children 属性，在进行判断 oldVNode 中有没有 children 属性

10. 如果 oldVNode 没有 children 属性，意味着 oldVNode 有 text 属性，此时要清空 oldVNode.elm 中的 innerText 并且把 children 子节点转换的 子 DOM 节点插入到 oldVNode.elm 中

11. 如果 oldVNode 有 children 属性，这里就是 oldVNode newVNode 都有 children 节点，此事要进行终结判断比较。

12. 这里就需要提到四中命中查找了。newVNode 的头和尾 ：新前和新后，oldVNode 的头和尾：旧前和旧后。 为什么这种算法优秀，因为它符合人们的编程习惯。

13. 定义四个指针 newStartIndex, newEndIndex, oldStartIndex, oldEndIndex , 同时四个指针对应四个节点：newStartNode,、newEndNode、oldStartNode、oldEndNode; 当 oldStartIndex<=oldEndIndex && newStartIndex <= newEndIndex 时候就进行 while 循环，

    1. 新前新后：判断 newStartNode 和 oldStartNode 是不是同一个节点
       a. 如果是: 就调用 patchVNode( oldStartNode, newStartNode ) 函数进行相应节点处理，并且 newStartIndex++ oldStartIndex++ ，对应的 newStartNode 和 oldStartNode 也要进行更新
       b. 如果不是：就进行第二步，比较 新后、旧后

    2. 新后旧后：判断 newEndNode 和 oldEndNode 是不是同一个节点
       a. 如果是：就调用 patchVNode(oldEndNode, newEndNode) 函数进行相应节点处理，并且 --oldEndIndex 和 --newEndIndex，对应的 oldEndNode 和 newEndNode 也要进行更新
       b. 如果不是，就进行第三步，比较 新后、旧前

    3. 新后旧前：判断 newEndNode 和 oldStartNode 是不是同一个节点
       a. 如果是：就调用 patchVNode(oldStartNode, newEndNode) 函数进行相应节点处理，并移动旧前指向的节点到未处理的节点的后面(也就是 oldEndVNode.elm 的后面)，注意：insertBefore 已有的节点会 删除原来位置的节点信息，并且 newEndIndex-- 和 ++oldStartIndex，对应的 oldStartNode 和 newEndNode 也要进行更新
       b. 如果不是，就进行第四步，比较 新前、旧后

    4. 新前旧后：判断 newStartNode 和 oldEndNode 是不是同一个节点
       a. 如果是：就调用 patchVNode(oldEndNode, newStartNode) 函数进行相应节点处理，并移动旧后节点到旧的未处理的及节点的前面(也就是 oldStartVNode.elm 的前面)，注意：insertBefore 已有的节点会 删除原来位置的节点信息，并且 oldEndIndex-- 和 ++newStartIndex，对应的 oldEndNode 和 newStartNode 也要进行更新
       b. 如果不是，就需要单独处理，进行第五步
    5. 如果都没有命中，就需要判断，当前 newStartNode 是否在老节点中出现过
       a. 如果不是，说明是新增加的，那么就把这 newStartNode 创建为 真实 dom 并插入到 oldStartVNode.elm 之前，然后更新指针 ++newStartIndex 以及 newStartNode

       b. 如果是，说明是位置发生了变化，那就取出 当前 newStartNode 在 oldChildren 中对应的节点，并进行比较更新（也就是找到 newStartNode 在 oldChildren 中下标比如为 k, 调用 patchVNode( oldChildren[k], newStartNode ) 进行节点的更新处理），然后把当前 oldChildren 下标为 k 的这项设置为 undefined，下次循环时候如果遇到 undefined 就增加判断提跳过处理，另外还要 在当前 oldStartVNode.elm 前插入这个节点信息（也就是插入到未处理的节点的前面），然后更新指针 ++newStartIndex 以及 newStartNode

       c. 疑问回答：为什么那项置为 undefined 以后，还有进行插入到未处理的节点的前面。因为更新信息后只是更新了 旧节点中的信息并没有移动位置，所以在老下标处的节点置为 undefined 以后，还有把之前存下来的更新后的节点信息移动到未处理的节点的前面

    6. 重复以上操作知道循环条件 oldStartIndex<=oldEndIndex && newStartIndex <= newEndIndex 不满足

    7. 循环结束后，还要进行判断
       如果 新前 小于等于 新后 说明这些节点需要新增，新增位置是未处理的节点的前面，循环当期 newStartIndex 和 newEndIndex 之间节点，添加到 oldStartVNode.elm 的前面
       疑问：为什么是 oldStartVNode.elm 的前面？？
       如果 旧前 小于等于 旧后说明这些节点需要删除
``` javascript patch

    function patch(oldVNode, newVNode){
        // 判断传入的第一个参数，是Dom节点还是虚拟节点
        if(oldVNode.sel == "" || oldVNode.sel == undefined){
            // 传入的第一个参数是DOM节点，此时要包装为虚拟节点
            oldVNode = vNode(oldVNode.tagName.toLowerCase(), {}, [], undefined, oldVNode)
        }
        // 判断oldVNode 和newVnode 是不是同一个节点
        if(checkSameNode(newVNode, oldVNode)){
            patchVNode(oldVNode, newVNode)
        }else{
            // 不是同一个节点，需要 暴力插入新的，删除旧的
            // 在这里进行页面插入到老节点之前
            let newVNodeElm = creatElement(newVNode)
            if(oldVNode.elm.parentNode && newVNodeElm){
            oldVNode.elm.parentNode.insertBefore(newVNodeElm, oldVNode.elm)
            // 删除老节点
            oldVNode.elm.parentNode.removeChild(oldVNode.elm)
            }
        }
    }
```


``` javascript  vNode 
    function vNode(sel, data, children, text, elm){
        return {
            sel, data, children, text, elm, key: data.key
        }
    }

    // 判断是否是同一个节点
    function checkSameNode(a,b){
        return a.sel === b.sel && a.key === b.key
    }
``` 


``` javascript
    // 真正创建节点，vNode 是孤儿节点不进行插入
    export default function createElement(vNode){
        let domNode = document.createElement(vNode.sel)
        // 有子节点还是有文本？
        if (vNode.text !== '' && (vNode.children == undefined || vNode.children.length === 0 )){
            // 它内部是文字
            domNode.innerText = vNode.text
        }else if(Array.isArray(vNode.children) && vNode.children.length > 0){
            // 它内部是子节点，需要进行递归
            for (let index = 0; index < vNode.children.length; index++) {
            // 得到当前这个 children
            const element = vNode.children[index];
            // 创建它的dom, 一旦调用createElement 意味着，创建出dom了，并且它的elm属性指向了
            // 创建出的dom,但是还没有上树，是一个孤儿节点
            let elementDom = createElement(element)
            domNode.appendChild(elementDom)
            }
        }
        // 补充elm属性
        vNode.elm = domNode
        // 返回 elm
        return vNode.elm
    }
```
``` javascript patch node 
    // 对比同一个虚拟节点
    function patchVNode(oldVNode, newVNode){
        // 判断新旧VNode 是不是同一个对象
        if(oldVNode === newVNode){
            console.log("是同一个对象")
            return 
        }
        // 判断 newVNNode 里面有没有 text属性
        if(newVNode.text !== undefined && (newVNode.children === undefined || newVNode.children.length == 0)){
            // newVNode 有text属性
            if(newVNode.text !== oldVNode.text ){
                oldVNode.elm.innerText = newVNode.text
            }
        }else {
            // newVNode 没有 text 属性,即有children 属性
            // 判断 oldVNode 有没有 children
            if(oldVNode.children !== undefined && oldVNode.children.length >0){
            // 老的有children 此时就是最复杂的情况，就是 newVNode, oldVNode 都有children
            updateChildren(oldVNode.elm, oldVNode.children, newVNode.children)
            }else{
            // oldVNode 没有children,newVNode 有children
            oldVNode.elm.innerText = ""
            newVNode.children.forEach(item => {
                let domNode = createElement(item)
                oldVNode.elm.appendChild(domNode)
            })
            }
        }
    }
```
``` javascript path children 
    // oldVNode 和 newVNode 都拥有 children属性
    function updateChildren(parentElm, oldChildren, newChildren){
        // 旧前
        let oldStartIndex = 0
        // 新前
        let newStartIndex = 0
        // 旧后
        let oldEndIndex = oldChildren.length - 1
        // 新后
        let newEndIndex = newChildren.length - 1
        // 旧前节点
        let oldStartVNode = oldChildren[0]
        // 旧后节点
        let oldEndVNNode = oldChildren[oldEndIndex]
        // 新前节点
        let newStartVNode = newChildren[0]
        // 新后节点
        let newEndVNode = newChildren[newEndIndex]
        // 老节点中的key集合
        let keyMap
        while(oldStartIndex<=oldEndIndex && newStartIndex <= newEndIndex){
        // 如果旧的开始节点不存在，也就是之前设置了 undefined
            if(oldStartVNode == null){ // 注意 undefined == null  为true
                oldStartVNode = oldChildren[++oldStartIndex]
            }else if(oldEndVNNode == null){
                oldEndVNNode = oldChildren[--oldEndIndex]
            }else if(newStartVNode == null){
                newStartVNode = newChildren[++newStartIndex]
            }else if(newEndVNode == null){
                newEndVNode = newChildren[--newEndIndex]
            }
            if(checkSameNode(newStartVNode, oldStartVNode)){
                // 新前与旧前是同一个节点
                console.log("①新前与旧前相同")
                patchVNode(oldStartVNode, newStartVNode)
                oldStartVNode = oldChildren[++oldStartIndex]
                newStartVNode = newChildren[++newStartIndex]
            }else if(checkSameNode(newEndVNode, oldEndVNNode)){
                // 新后与旧后进行比较，是同一个节点
                console.log("②新后与旧后相同")
                patchVNode(oldEndVNNode, newEndVNode)
                oldEndVNNode = oldChildren[--oldEndIndex]
                newEndVNode = newChildren[--newEndIndex]
            }else if(checkSameNode(newEndVNode, oldStartVNode)){
                // 新后与旧前是同一个节点
                console.log("③新后与旧前相同")
                patchVNode(oldStartVNode, newEndVNode)
                // 当新后与旧前命中的时候，此时需要移动节点，移动 新前 指向的这个节点到老节点的旧后的后面
                // TODO疑问：为什么这里不用设置undefined? insertBefore移动后 节点会被删除是否有影响？？
                parentElm.insertBefore(oldStartVNode.elm, oldEndVNNode.elm.nextSibling)
                oldStartVNode = oldChildren[++oldStartIndex]
                newEndVNode = newChildren[--newEndIndex]
            }else if(checkSameNode(newStartVNode, oldEndVNNode)){
            // 新前与旧后是同一个节点
                console.log("④新前与旧后相同")
                // 此时要移动节点，移动新前节点到老节点的旧前的前面
                patchVNode(oldEndVNNode, newStartVNode)
                // TODO疑问：为什么这里不用设置undefined? insertBefore移动后 节点会被删除是否有影响？？
                // 注意 insertBefore 已有的节点会 删除原来位置的节点信息
                parentElm.insertBefore(oldEndVNNode.elm, oldStartVNode.elm)
                oldEndVNNode = oldChildren[--oldEndIndex]
                newStartVNode = newChildren[++newStartIndex]
            }else {
                console.log("都没有命中")
                // 继续看看有没有剩下的
                if(!keyMap){
                    keyMap = {}
                    for (let index = oldStartIndex; index < oldEndIndex; index++) {
                    const key = oldChildren[index].key
                    if(key !== undefined){
                        keyMap[key] = index
                    }
                    }
                }
                // 寻找当前这项(newStartIndex)这项在 keyMap 中的映射的位置序号
                const idxInOld = keyMap[newStartVNode.key]
                if(idxInOld == null){
                    // 判断，如果 idxInOld 是 undefined 表示他是全新的项目
                    parentElm.insertBefore(createElement(newStartVNode), oldStartVNode.elm)
                }else{
                    console.log("如果不是 undefined 说明不是全新的项目，需要移动")
                    // 如果不是 undefined 说明不是全新的项目，需要移动
                    const elmToMove = oldChildren[idxInOld]
                    patchVNode(elmToMove, newStartVNode)
                    // 把这项设置为 undefined， 表示已经处理完这项
                    oldChildren[idxInOld] = undefined
                    // 移动，调用 insertBefore 也可以实现移动 
                    // 移动到 oldStartIndex 前面
                    parentElm.insertBefore(elmToMove.elm, oldStartVNode.elm)
                }
                newStartVNode = newChildren[++newStartIndex]
            }
        }
        // 循环结束时候，新前 小于等于 新后说明这些节点需要新增
        // 在新前前插入 需要新增的节点
        if(newStartIndex <= newEndIndex){
            console.log('新节点需要有新增的')
            for (let index = newStartIndex; index <= newEndIndex; index++) {
                parentElm.insertBefore(createElement(newChildren[index]), oldStartVNode.elm)
            }
        }else if(oldStartIndex <= oldEndIndex){
            console.log("旧节点需要有删除的")
            // 循环结束时候，旧前 小于等于 旧后说明这些节点需要删除
            for (let index = oldStartIndex; index <= oldEndIndex; index++) {
            // 这里有标记为 undefined 的节点
                oldChildren[index] && parentElm.removeChild(oldChildren[index].elm)
            }
        }
    }
```



``` javascript ```