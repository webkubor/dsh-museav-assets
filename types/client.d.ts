/**
 * dsh-museav-assets Client Globals
 */

declare global {
	interface Window {
		__ModuleLoader__: {
			load(opts: { id: string; factory: (require?: any, exports?: any, module?: any) => any }): void
		}
	}
}

declare function require(id: string): any

declare module 'react' {
	const React: any
	export default React
	export = React
}

export {}
