/** @type {import("prettier").Options} */
export default {
  printWidth: 120,
  singleQuote: true,
  semi: true,
  tabWidth: 2,
  useTabs: false,
  plugins: ['prettier-plugin-tailwindcss'],
  trailingComma: 'es5',
  tailwindFunctions: ['tv', 'cva'],
};
