
npm install pnpm     安装pnpm 
根目录添加 pnpm-workspace.yaml 文件
  packages:
  - 'packages/*'


pnpm install packages(vue,react.....) -w(workspace 提升安装包在node_modules下的文件空间（上升到node_modules根目录下）) 

在每一个单独的功能包中添加一个pageage.json


{
  "name": "@vue/reactivity",
  "version": "3.2.39",
  "description": "@vue/reactivity",
  "main": "index.js",
  "module": "dist/reactivity.esm-bundler.js",
  "types": "dist/reactivity.d.ts",
  "unpkg": "dist/reactivity.global.js",
  "jsdelivr": "dist/reactivity.global.js",
  "files": [
    "index.js",
    "dist"
  ],
  "sideEffects": false,
  "repository": {
    "type": "git",
    "url": "git+https://github.com/vuejs/core.git",
    "directory": "packages/reactivity"
  },
  "buildOptions": {      // 打包设置
    "name": "VueReactivity",   // 打包后生成的名称
    "formats": [
      "esm-bundler",  // es6下运行 支持 <script src="XXX" type="module">
      "esm-browser", //
      "cjs",    // common js 规范
      "global"  // 跨平台 全局引用
    ]
  },
  "keywords": [
    "vue"
  ],
  "author": "Evan You",
  "license": "MIT",
  "bugs": {
    "url": "https://github.com/vuejs/core/issues"
  },
  "homepage": "https://github.com/vuejs/core/tree/main/packages/reactivity#readme",
  "dependencies": {
    "@vue/shared": "3.2.39"
  }
}



typescript config 

tsconfig.json 

{
  "compilerOptions": {
    "baseUrl": ".",    // 默认文件路径
    "outDir": "dist",  // 文件打包文件夹
    "sourceMap": false,
    "target": "es2016",  // ts文件打包转换设置
    "useDefineForClassFields": false,
    "module": "esnext",
    "moduleResolution": "node",
    "allowJs": false,
    "strict": true,    // 严格模式
    "noUnusedLocals": true,
    "experimentalDecorators": true,
    "resolveJsonModule": true,
    "esModuleInterop": true,
    "removeComments": false,
    "jsx": "preserve",
    "lib": ["esnext", "dom"],
    "types": ["jest", "puppeteer", "node"],
    "rootDir": ".", // 文件根文件夹
    "paths": {     // ts引用文件设置   import {Fn} 'path(短路径)'
      "@vue/compat": ["packages/vue-compat/src"],
      "@vue/*": ["packages/*/src"],
      "vue": ["packages/vue/src"]
    }
  },
  "include": [
    "packages/global.d.ts",
    "packages/*/src",
    "packages/runtime-dom/types/jsx.d.ts",
    "packages/*/__tests__",
    "test-dts"
  ]
}


build 打包 

根目录下 script build.js ..... 手写试试 具体内容 （边写边跑 + 百度）
pnpm run dev =>  node dev.js 
dev.js (组织一些变量 生成一系列 rollup打包配置项)=>  rollup.config.js






















