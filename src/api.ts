import * as http from 'node:http'

/**
 * Minimal client for the Pixotope Gateway HTTP API.
 *
 * Gateway accepts HTTP POST requests at:
 *   http://{host}:{port}/gateway/{version}/publish
 *
 * Every request carries a Topic (what to do, and to which service) and a
 * Message (the payload). Gateway relays it to the Pixotope Data Hub and
 * returns the service response. See "Using the Pixotope API" in the Pixotope
 * help centre, and the Director "API Log" tab for capturing real payloads.
 *
 * Uses Node's built-in http module so it runs on Companion's Node 18 runtime
 * without depending on the experimental global fetch.
 */

export type PixotopeTopicType = 'Set' | 'Get' | 'Call' | 'Update'

/**
 * Parse a value copied from the editor / API Log. Tries JSON first (so numbers,
 * booleans, objects and arrays come through with the right type) and falls back
 * to the raw string for plain text like an ObjectSearch or PropertyPath.
 */
function coerceParam(raw: string): unknown {
	const trimmed = raw.trim()
	if (trimmed === '') return ''
	try {
		return JSON.parse(trimmed)
	} catch {
		return raw
	}
}

/**
 * Parse a Gateway URL as copied from the Pixotope editor's right-click menu
 * (or the Director API Log) into a {@link PixotopeRequest}.
 *
 * Example:
 *   http://localhost:16208/gateway/26.1.0/publish?Type=Call&Target=~LOCAL~-Engine
 *     &Method=GetProperty&ParamObjectSearch=DirectionalLight_0.LightComponent0
 *     &ParamPropertyPath=Intensity
 *
 * Query-string conventions:
 *   Type / Target / Name / Method  -> the Topic fields
 *   Param<Key>=<value>             -> Message.Params.<Key>
 *   Value=<value>                  -> Message.Value
 *
 * Param/Value values are JSON-decoded when possible (so numbers stay numbers).
 * Accepts either a full URL or a bare query string ("?Type=Call&..." or
 * "Type=Call&...").
 */
export function parseGatewayUrl(input: string): PixotopeRequest {
	const text = input.trim()
	if (text === '') throw new Error('Empty URL')

	let params: URLSearchParams
	if (text.includes('?')) {
		params = new URLSearchParams(text.slice(text.indexOf('?') + 1))
	} else if (text.includes('=')) {
		params = new URLSearchParams(text)
	} else {
		throw new Error('No query parameters found in URL')
	}

	const type = params.get('Type')
	const target = params.get('Target')
	if (!type) throw new Error('URL is missing the Type parameter')
	if (!target) throw new Error('URL is missing the Target parameter')

	const topic: PixotopeTopic = { Type: type as PixotopeTopicType, Target: target }
	const name = params.get('Name')
	const method = params.get('Method')
	if (name) topic.Name = name
	if (method) topic.Method = method

	const message: PixotopeMessage = {}
	const reserved = new Set(['Type', 'Target', 'Name', 'Method', 'Value'])
	const paramEntries: Record<string, unknown> = {}
	for (const [key, value] of params.entries()) {
		if (reserved.has(key)) continue
		if (key.startsWith('Param') && key.length > 'Param'.length) {
			paramEntries[key.slice('Param'.length)] = coerceParam(value)
		}
	}
	if (Object.keys(paramEntries).length > 0) message.Params = paramEntries

	const rawValue = params.get('Value')
	if (rawValue !== null) message.Value = coerceParam(rawValue)

	const request: PixotopeRequest = { Topic: topic }
	if (message.Params !== undefined || message.Value !== undefined) request.Message = message
	return request
}

function isObject(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/**
 * Unwrap the Gateway reply envelope down to the inner `Message` payload.
 *
 * A Gateway HTTP reply is an array of one or more reply messages, each shaped
 * like `{ Topic: { Type: "CallResult", ... }, Message: { Result: [...] } }`.
 * Prefer a CallResult message when several are present, then return its Message.
 */
function unwrapMessage(body: unknown): unknown {
	let value = body
	if (Array.isArray(value)) {
		const callResult = value.find((m) => isObject(m) && isObject(m.Topic) && m.Topic.Type === 'CallResult')
		value = callResult ?? value[0]
	}
	if (isObject(value) && 'Message' in value) value = value.Message
	return value
}

/**
 * Best-effort extraction of the meaningful payload from a Gateway Call/Get
 * response body. Unwraps the reply envelope and the `Result` / `CallResult` /
 * `Value` wrappers so callers get the inner value.
 */
export function extractResult(body: unknown): unknown {
	let value = unwrapMessage(body)
	if (isObject(value)) {
		if ('Result' in value) value = value.Result
		else if ('CallResult' in value) value = value.CallResult
		else if ('Value' in value) value = value.Value
	}
	// Single-element result arrays are common; unwrap them.
	if (Array.isArray(value) && value.length === 1) value = value[0]
	return value
}

/** A failed Call returns `Message.Failure`; return it as text (or undefined on success). */
export function extractFailure(body: unknown): string | undefined {
	const value = unwrapMessage(body)
	if (isObject(value) && 'Failure' in value && value.Failure != null) return formatResult(value.Failure)
	return undefined
}

/** The descriptor returned for a single property by GetProperty. */
export interface PixotopeProperty {
	Name?: string
	PrettyName?: string
	Owner?: string
	OwningActor?: string
	Type?: string
	Value?: unknown
	DefaultValue?: unknown
	AdjustmentStatus?: string
	Metadata?: Record<string, unknown>
}

/**
 * Pull the Property descriptor out of a GetProperty response. The result rows
 * are shaped `{ Property: { Name, Value, Type, AdjustmentStatus, ... } }`.
 */
export function extractProperty(body: unknown): PixotopeProperty | undefined {
	let value = extractResult(body)
	if (isObject(value) && 'Property' in value) value = value.Property
	return isObject(value) ? value : undefined
}

const NUMERIC_PROPERTY_TYPES = new Set(['float', 'double', 'real', 'number'])

/** Whether a Pixotope property Type string represents a number (so "10.000000" can become "10"). */
export function isNumericPropertyType(type: unknown): boolean {
	if (typeof type !== 'string') return false
	const t = type.toLowerCase()
	return NUMERIC_PROPERTY_TYPES.has(t) || t.startsWith('int') || t.startsWith('uint')
}

/**
 * Render a property's value for a Companion variable. Pixotope returns values as
 * strings (e.g. "10.000000"); normalise numeric types so they read cleanly.
 */
export function formatPropertyValue(property: PixotopeProperty | undefined): string {
	if (!property) return ''
	const raw = property.Value
	if (isNumericPropertyType(property.Type) && typeof raw === 'string' && raw.trim() !== '') {
		const n = Number(raw)
		if (Number.isFinite(n)) return String(n)
	}
	return formatResult(raw)
}

/**
 * Whether a property's current value differs from its default. Numeric values are
 * compared numerically (so "10.0" === "10"); everything else by formatted string.
 */
export function propertyIsModified(property: PixotopeProperty | undefined): boolean {
	if (!property || property.DefaultValue === undefined) return false
	const { Value, DefaultValue } = property
	if (Value === DefaultValue) return false
	const nv = typeof Value === 'string' ? Number(Value) : NaN
	const nd = typeof DefaultValue === 'string' ? Number(DefaultValue) : NaN
	if (Number.isFinite(nv) && Number.isFinite(nd)) return nv !== nd
	return formatResult(Value) !== formatResult(DefaultValue)
}

/** Render a value for display in a Companion variable: plain text for scalars, JSON otherwise. */
export function formatResult(value: unknown): string {
	if (value === null || value === undefined) return ''
	if (typeof value === 'string') return value
	if (typeof value === 'number' || typeof value === 'boolean') return String(value)
	try {
		return JSON.stringify(value) ?? ''
	} catch {
		return '[unserializable]'
	}
}

export interface PixotopeTopic {
	Type: PixotopeTopicType
	Target: string
	Name?: string
	Method?: string
}

export interface PixotopeMessage {
	Value?: unknown
	Params?: Record<string, unknown>
}

export interface PixotopeRequest {
	Topic: PixotopeTopic
	Message?: PixotopeMessage
}

export interface PixotopeResponse {
	ok: boolean
	status: number
	/** Parsed JSON body when the response was JSON, otherwise the raw text. */
	body: unknown
}

export class PixotopeApi {
	private readonly host: string
	private readonly port: number
	private readonly version: string
	private readonly timeout: number

	constructor(host: string, port: number, version: string, timeoutMs = 5000) {
		this.host = host
		this.port = port
		this.version = version
		this.timeout = timeoutMs
	}

	get baseUrl(): string {
		return `http://${this.host}:${this.port}/gateway/${this.version}/publish`
	}

	/** Send a raw Topic + Message to Gateway. Throws on network/timeout/HTTP error. */
	async publish(request: PixotopeRequest): Promise<PixotopeResponse> {
		const payload = JSON.stringify(request)
		const url = new URL(this.baseUrl)

		return new Promise<PixotopeResponse>((resolve, reject) => {
			const req = http.request(
				{
					hostname: url.hostname,
					port: url.port,
					path: `${url.pathname}${url.search}`,
					method: 'POST',
					headers: {
						'Content-Type': 'application/json',
						'Content-Length': Buffer.byteLength(payload),
					},
					timeout: this.timeout,
				},
				(res) => {
					const chunks: Buffer[] = []
					res.on('data', (chunk: Buffer) => chunks.push(chunk))
					res.on('end', () => {
						const text = Buffer.concat(chunks).toString('utf8')
						let body: unknown = text
						if (text.length > 0) {
							try {
								body = JSON.parse(text)
							} catch {
								// Leave body as raw text if it isn't JSON.
							}
						}
						const status = res.statusCode ?? 0
						if (status < 200 || status >= 300) {
							reject(new Error(`Gateway responded ${status} ${res.statusMessage ?? ''}`.trim()))
							return
						}
						resolve({ ok: true, status, body })
					})
				},
			)

			req.on('error', (err) => reject(err))
			req.on('timeout', () => {
				req.destroy(new Error(`Gateway request timed out after ${this.timeout}ms`))
			})
			req.write(payload)
			req.end()
		})
	}

	/** Call a method on a Pixotope service (e.g. an Engine API call). */
	async call(target: string, method: string, params: Record<string, unknown>): Promise<PixotopeResponse> {
		return this.publish({
			Topic: { Type: 'Call', Target: target, Method: method },
			Message: { Params: params },
		})
	}

	/** Set a named state value on a service (e.g. the Store). */
	async set(target: string, name: string, value: unknown): Promise<PixotopeResponse> {
		return this.publish({
			Topic: { Type: 'Set', Target: target, Name: name },
			Message: { Value: value },
		})
	}

	/** Get a named state value from a service. */
	async get(target: string, name: string): Promise<PixotopeResponse> {
		return this.publish({
			Topic: { Type: 'Get', Target: target, Name: name },
		})
	}

	/**
	 * Lightweight reachability check. Gateway has no dedicated health endpoint,
	 * so we issue a harmless Get and treat any HTTP response as "reachable".
	 */
	async ping(): Promise<boolean> {
		try {
			await this.get('Store', 'State')
			return true
		} catch {
			return false
		}
	}
}
