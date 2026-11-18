import antfu from '@antfu/eslint-config'

export default antfu(
  {
    ignores: ['node_modules', 'node_modules/**', '.md', '.pnp', '.pnp/**', '.pnp.js', '**/.pnp.js/**', 'coverage', 'coverage/**', 'test-results/', 'test-results/**/', 'playwright-report/', 'playwright-report/**/', 'playwright/.cache/', 'playwright/.cache/**/', 'dist', 'dist/**', 'high-level-dependencies.html', '**/high-level-dependencies.html/**', '.DS_Store', '**/.DS_Store/**', '*.pem', '**/*.pem/**', 'npm-debug.log*', '**/npm-debug.log*/**', 'yarn-debug.log*', '**/yarn-debug.log*/**', 'yarn-error.log*', '**/yarn-error.log*/**', '.pnpm-debug.log*', '**/.pnpm-debug.log*/**', '.env*.local', '**/.env*.local/**', '.vercel', '**/.vercel/**', '**/.sisyphus/**', '**/*.agent/**', '**/*.cursor/**', '**/docs/**', '**/*.md/**'],
    rules: {
      // 允许使用 console.debug (用于调试功能)
      'no-console': ['error', { allow: ['warn', 'error', 'debug'] }],
    },
  },
  {
    files: ['**/*.js', '**/*.mjs', '**/*.cjs'],
    rules: {
      // JS 文件没有 typescript-eslint 的 isValueReference，这条规则会把实参误判成类型引用
      'unused-imports/no-unused-vars': 'off',
    },
  },
)
