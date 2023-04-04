/**
 * Make a map and return a function for checking if a key
 * is in that map.
 * IMPORTANT: all calls of this function must be prefixed with
 * \/\*#\_\_PURE\_\_\*\/
 * So that rollup can tree-shake them if necessary.
 */
export function makeMap(
  str: string,
  expectsLowerCase?: boolean
): (key: string) => boolean {
  const map: Record<string, boolean> = Object.create(null)
  const list: Array<string> = str.split(',')
  for (let i = 0; i < list.length; i++) {
    map[list[i]] = true
  }
  //返回一个函数,用于判断是否是传递的str分割出来的某一个值
  //可以通过expectsLowerCase指定是否需要将分隔值转化为小写
  return expectsLowerCase ? val => !!map[val.toLowerCase()] : val => !!map[val]
}
