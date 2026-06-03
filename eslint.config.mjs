import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const baseConfig = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...baseConfig,
	{
		// The build target is CommonJS, so TypeScript sources use extensionless
		// relative imports. Teach eslint-plugin-n to resolve the matching .ts files.
		settings: {
			n: {
				tryExtensions: ['.js', '.ts', '.d.ts', '.json'],
			},
		},
	},
]
