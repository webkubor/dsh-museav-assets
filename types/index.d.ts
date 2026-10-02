/**
 * dsh-museav-assets TypeScript Definitions
 */

export const name: '@dsh-plugins/dsh-museav-assets'
export const inject: string[]

/** 一个工作区（项目）。id 是真值，name 来自 stderr 表格，解析不到就退回 id 前 8 位。 */
export interface MuseProject {
	id: string
	name: string
	genDone: number | null
	genTotal: number | null
	assetCount: number | null
	brand: string | null
}

/** 工作区素材库里的一条。url 可直接当 `museav gen --ref` 的垫图直链。 */
export interface MuseAsset {
	id: string
	url: string
	name: string
	mediaType: string
	tags: string[]
}

/** 最近出图记录（已裁剪过 prompt 之外的大字段）。 */
export interface MuseJob {
	id: string
	status: string
	mediaType: string
	model: string
	url: string | null
	prompt: string
	ratio: string | null
	createdAt: string | null
	workspaceId: string | null
	elapsedMs: number | null
	error: string | null
}

export interface ProjectsResponse {
	ok: boolean
	error?: string
	projects: MuseProject[]
	used?: number
	limit?: number
	/** 已达服务端上限（每账户 5 个），此时新建会被拒。 */
	full?: boolean
	id?: string | null
}

export interface AssetsResponse {
	ok: boolean
	error?: string
	project?: string
	assets: MuseAsset[]
}

export interface JobsResponse {
	ok: boolean
	error?: string
	jobs: MuseJob[]
}

export interface HealthResponse {
	ok: boolean
	cli: { bin: string; version: string | null; error: string | null }
	projectLimit: number
}

/** 服务端工作区数量上限，与 museav projects create 的限制一致。 */
export const PROJECT_LIMIT: 5
