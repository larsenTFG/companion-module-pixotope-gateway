import { InstanceBase, InstanceStatus, runEntrypoint, type SomeCompanionConfigField } from '@companion-module/base'
import { GetConfigFields, type ModuleConfig } from './config'
import { UpdateVariableDefinitions } from './variables'
import { UpgradeScripts } from './upgrades'
import { UpdateActions } from './actions'
import { UpdateFeedbacks } from './feedbacks'
import { UpdatePresets } from './presets'
import {
	PixotopeApi,
	extractFailure,
	extractProperty,
	extractResult,
	formatPropertyValue,
	formatResult,
	propertyIsModified,
	type PixotopeRequest,
	type PixotopeResponse,
} from './api'

/**
 * Something polled on an interval by an active feedback. Either an engine
 * property (GetProperty Call) or a Store/state value (Get).
 */
interface WatchedProbe {
	kind: 'property' | 'store'
	target: string
	/** Property probes: how to locate the value. */
	objectSearch: string
	propertyPath: string
	/** Store probes: the state path (Topic Name). */
	name: string
	/** Property probes: whether the value currently differs from its default. */
	modified: boolean
	/** When set, each poll writes the value to this Companion variable. */
	variableId?: string
	/** Display name used when defining the variable. */
	variableLabel?: string
	/** Last value written, to skip redundant updates and log only on change. */
	lastValue?: string
}

/** Fallback live-value poll interval (ms) when the config value is missing. */
const DEFAULT_FEEDBACK_POLL_INTERVAL = 1000

export class ModuleInstance extends InstanceBase<ModuleConfig> {
	config!: ModuleConfig // Setup in init()
	api!: PixotopeApi
	connected = false
	private pollTimer: ReturnType<typeof setInterval> | undefined
	private feedbackTimer: ReturnType<typeof setInterval> | undefined
	/** Guards to prevent overlapping polls piling up if the Gateway is slow. */
	private polling = false
	private feedbackPolling = false
	/** Property variables created on demand by the "Get Property" action: id -> display name. */
	private propertyVariables = new Map<string, string>()
	/** Active property/store feedbacks polled on an interval, keyed by feedback id. */
	private feedbackProps = new Map<string, WatchedProbe>()

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig): Promise<void> {
		this.config = config

		this.updateActions()
		this.updateFeedbacks()
		this.updatePresets()
		this.updateVariableDefinitions()

		this.configureApi()
		this.startPolling()
	}

	// When module gets deleted
	async destroy(): Promise<void> {
		this.stopPolling()
		this.stopFeedbackPolling()
		;(this.api as PixotopeApi | undefined)?.close()
		this.log('debug', 'destroy')
	}

	async configUpdated(config: ModuleConfig): Promise<void> {
		this.config = config
		this.configureApi()
		this.startPolling()
		// Re-apply the (possibly changed) live-value poll interval to active watchers.
		this.startFeedbackPolling()
	}

	// Return config fields for web config
	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	configureApi(): void {
		// Close any previous socket pool before replacing the client.
		;(this.api as PixotopeApi | undefined)?.close()
		this.api = new PixotopeApi(this.config.host, this.config.port, this.config.version)
		this.updateStatus(InstanceStatus.Connecting)
		this.setVariableValues({
			gateway_url: this.api.baseUrl,
			connection_status: 'Connecting',
		})
	}

	startPolling(): void {
		this.stopPolling()
		// Always probe once on (re)configuration.
		void this.poll()
		const interval = this.config.pollInterval
		if (interval && interval > 0) {
			this.pollTimer = setInterval(() => void this.poll(), interval)
		}
	}

	stopPolling(): void {
		if (this.pollTimer) {
			clearInterval(this.pollTimer)
			this.pollTimer = undefined
		}
	}

	async poll(): Promise<void> {
		// Skip if the previous heartbeat is still in flight, so a slow Gateway
		// never causes requests to pile up.
		if (this.polling) return
		// When live values are being watched, those polls already prove the
		// Gateway is reachable, so the extra heartbeat request is redundant — skip
		// it to keep network traffic minimal.
		if (this.feedbackProps.size > 0) return
		this.polling = true
		try {
			const ok = await this.api.ping()
			this.setConnected(ok)
		} finally {
			this.polling = false
		}
	}

	/**
	 * Register (or refresh) a polled feedback. Called from the feedback's
	 * subscribe hook with the resolved probe (engine property or Store value).
	 */
	registerPropertyFeedback(id: string, probe: Omit<WatchedProbe, 'modified' | 'lastValue'>): void {
		const existing = this.feedbackProps.get(id)
		this.feedbackProps.set(id, { ...probe, modified: existing?.modified ?? false })
		this.startFeedbackPolling()
		void this.pollFeedbackProperties()
	}

	unregisterPropertyFeedback(id: string): void {
		const entry = this.feedbackProps.get(id)
		this.feedbackProps.delete(id)
		// Tidy up a live variable when no remaining feedback still uses it.
		if (entry?.variableId && ![...this.feedbackProps.values()].some((p) => p.variableId === entry.variableId)) {
			this.removePropertyVariable(entry.variableId)
		}
		if (this.feedbackProps.size === 0) this.stopFeedbackPolling()
	}

	/** Current modified state for a feedback id; read by the feedback callback. */
	isPropertyFeedbackModified(id: string): boolean {
		return this.feedbackProps.get(id)?.modified ?? false
	}

	private startFeedbackPolling(): void {
		this.stopFeedbackPolling()
		if (this.feedbackProps.size === 0) return
		const interval = this.config.feedbackPollInterval || DEFAULT_FEEDBACK_POLL_INTERVAL
		this.feedbackTimer = setInterval(() => void this.pollFeedbackProperties(), interval)
	}

	private stopFeedbackPolling(): void {
		if (this.feedbackTimer) {
			clearInterval(this.feedbackTimer)
			this.feedbackTimer = undefined
		}
	}

	/** Poll every feedback probe; update modified-state and live variables. */
	private async pollFeedbackProperties(): Promise<void> {
		if (this.feedbackProps.size === 0 || this.feedbackPolling) return
		this.feedbackPolling = true
		try {
			await this.runFeedbackPoll()
		} finally {
			this.feedbackPolling = false
		}
	}

	private async runFeedbackPoll(): Promise<void> {
		let changed = false
		const results = await Promise.all(
			[...this.feedbackProps.values()].map(async (probe) =>
				this.pollProbe(probe, () => {
					changed = true
				}),
			),
		)
		if (changed) this.checkFeedbacks('property_modified')
		// Derive connection status from the watch traffic itself, so drops are
		// detected promptly without sending any extra heartbeat request.
		if (results.includes(true)) this.setConnected(true)
		else if (results.includes(false)) this.setConnected(false)
	}

	/**
	 * Poll one probe. Returns true if the Gateway responded (reachable), false on a
	 * network/timeout error, or null if the probe was skipped (nothing requested).
	 */
	private async pollProbe(probe: WatchedProbe, markChanged: () => void): Promise<boolean | null> {
		try {
			let value: string | undefined
			if (probe.kind === 'store') {
				if (probe.name === '') return null
				const response = await this.api.get(probe.target, probe.name)
				const failure = extractFailure(response.body)
				if (failure) {
					this.log('debug', `Watch store "${probe.name}" failed: ${failure}`)
				} else {
					const raw = extractResult(response.body)
					if (raw === null || raw === undefined) {
						this.log('debug', `Watch store "${probe.name}" returned null — check the State Path is correct`)
					}
					value = formatResult(raw)
				}
			} else {
				if (probe.objectSearch === '' || probe.propertyPath === '') return null
				const response = await this.api.call(probe.target, 'GetProperty', {
					ObjectSearch: probe.objectSearch,
					PropertyPath: probe.propertyPath,
				})
				if (!extractFailure(response.body)) {
					const property = extractProperty(response.body)
					const modified = propertyIsModified(property)
					if (modified !== probe.modified) {
						probe.modified = modified
						markChanged()
					}
					value = formatPropertyValue(property)
				}
			}

			if (probe.variableId && value !== undefined && value !== probe.lastValue) {
				probe.lastValue = value
				this.setPropertyVariable(probe.variableId, probe.variableLabel ?? probe.variableId, value)
				this.log('debug', `Watch ${probe.variableId} -> ${value}`)
			}
			// We received an HTTP response, so the Gateway is reachable.
			return true
		} catch {
			return false
		}
	}

	setConnected(connected: boolean): void {
		const changed = connected !== this.connected
		this.connected = connected
		this.updateStatus(connected ? InstanceStatus.Ok : InstanceStatus.ConnectionFailure)
		this.setVariableValues({ connection_status: connected ? 'Connected' : 'Disconnected' })
		if (changed) {
			this.checkFeedbacks('connection_status')
			// On dropping the connection, discard pooled sockets so the next poll
			// opens a fresh connection rather than reusing a dead keep-alive socket.
			// This is what lets the module reconnect on its own after the Gateway
			// (Pixotope) restarts.
			if (!connected) this.api.resetSockets()
		}
	}

	/**
	 * Send a request to Gateway with shared error handling. Used by actions.
	 * Returns the response on success, or undefined on failure (already logged).
	 */
	async sendRequest(request: PixotopeRequest): Promise<PixotopeResponse | undefined> {
		try {
			const response = await this.api.publish(request)
			this.setConnected(true)
			this.log('debug', `Gateway request ${JSON.stringify(request.Topic)} -> ${response.status}`)
			return response
		} catch (e) {
			const message = e instanceof Error ? e.message : String(e)
			this.log('error', `Gateway request failed: ${message}`)
			this.setConnected(false)
			return undefined
		}
	}

	updateActions(): void {
		UpdateActions(this)
	}

	updateFeedbacks(): void {
		UpdateFeedbacks(this)
	}

	updatePresets(): void {
		UpdatePresets(this)
	}

	updateVariableDefinitions(): void {
		UpdateVariableDefinitions(this, this.propertyVariables)
	}

	/**
	 * Register a property variable on demand (used by the Get Property action) and
	 * store its value. Variables persist for the session so buttons can display them.
	 */
	setPropertyVariable(variableId: string, displayName: string, value: string): void {
		if (!this.propertyVariables.has(variableId)) {
			this.propertyVariables.set(variableId, displayName)
			this.updateVariableDefinitions()
		}
		this.setVariableValues({ [variableId]: value })
	}

	/** Remove a single dynamically-created property variable and refresh the definitions. */
	private removePropertyVariable(variableId: string): void {
		if (this.propertyVariables.delete(variableId)) {
			this.updateVariableDefinitions()
		}
	}

	/** Remove all dynamically-created property variables. Live Watch feedbacks repopulate on next poll. */
	clearPropertyVariables(): void {
		if (this.propertyVariables.size === 0) return
		this.propertyVariables.clear()
		this.updateVariableDefinitions()
	}
}

runEntrypoint(ModuleInstance, UpgradeScripts)
